(() => {
  const SUPABASE_URL = "https://jzwnjzagmijikbhxtrcn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5pGDVM-9-TKyAOKTvQHWKw_j0ZKTy4p";
  let client = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  if (client) window.postpilotAuthClient = client;
  let supabaseLoadPromise = null;
  async function ensureClient() {
    if (client) return client;
    if (!supabaseLoadPromise) {
      supabaseLoadPromise = new Promise((resolve, reject) => {
        if (window.supabase?.createClient) return resolve();
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Supabase SDK could not load. Check your connection and refresh."));
        document.head.appendChild(script);
      });
    }
    try { await supabaseLoadPromise; } catch (error) { supabaseLoadPromise = null; throw error; }
    if (!window.supabase?.createClient) { supabaseLoadPromise = null; throw new Error("Supabase SDK is unavailable. Please refresh and try again."); }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    window.postpilotAuthClient = client;
    return client;
  }

  let currentUser = null;
  let isSignup = false;
  let isPasswordRecovery = false;
  const reminderTimers = new Map();
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);

  function toast(message) {
    const target = document.querySelector("#toast-message");
    const wrap = document.querySelector("#toast");
    if (!target || !wrap) return;
    target.textContent = message;
    wrap.classList.add("show");
    window.setTimeout(() => wrap.classList.remove("show"), 3500);
  }

  function buildAuth() {
    if (document.querySelector("#auth-backdrop")) return;
    const backdrop = document.createElement("div");
    backdrop.className = "auth-backdrop";
    backdrop.id = "auth-backdrop";
    backdrop.innerHTML = `
      <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-brand"><span class="auth-brand-mark">P</span> postpilot</div>
        <h2 id="auth-title">Your content, in sync.</h2>
        <p id="auth-description">Sign in to save your drafts, captions, and publishing calendar across devices.</p>
        <form id="auth-form">
          <label class="auth-field" for="auth-full-name" id="auth-full-name-label" hidden>Full name</label>
          <input class="auth-input" id="auth-full-name" type="text" autocomplete="name" placeholder="Your full name" minlength="2" hidden>
          <label class="auth-field" for="auth-workspace" id="auth-workspace-label" hidden>Business or workspace name</label>
          <input class="auth-input" id="auth-workspace" type="text" autocomplete="organization" placeholder="Your brand or business" minlength="2" hidden>
          <label class="auth-field" for="auth-email">Email address</label>
          <input class="auth-input" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required>
          <label class="auth-field" for="auth-password">Password</label>
          <input class="auth-input" id="auth-password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters" required>
          <div class="auth-error" id="auth-error" role="alert"></div>
          <button class="auth-submit" id="auth-submit" type="submit">Sign in</button>
          <div class="auth-forgot-row" id="auth-forgot-row"><button id="auth-forgot" type="button">Forgot password?</button></div>
        </form>
        <div class="auth-switch"><span id="auth-switch-copy">New to PostPilot?</span> <button id="auth-switch" type="button">Create an account</button></div>
        <div class="auth-note">Your content is private to your account. Reset links are sent securely by email.</div>
      </section>`;
    document.body.appendChild(backdrop);

    document.querySelector("#auth-forgot").addEventListener("click", async () => {
      const email = document.querySelector("#auth-email").value.trim();
      if (!email) {
        showAuthError("Enter your account email above, then select Forgot password again.");
        document.querySelector("#auth-email").focus();
        return;
      }
      const button = document.querySelector("#auth-forgot");
      button.disabled = true;
      button.textContent = "Sending reset link…";
      showAuthError("");
      try {
        const redirectTo = window.location.origin + window.location.pathname + "?reset_password=1";
        const authClient = await ensureClient();
        const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        showAuthError("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.");
        const errorBox = document.querySelector("#auth-error");
        errorBox.style.display = "block";
        errorBox.style.background = "#eef7f1";
        errorBox.style.color = "#216844";
      } catch (error) {
        showAuthError(error.message || "Could not send a reset link. Please try again.");
      } finally {
        button.disabled = false;
        button.textContent = "Forgot password?";
      }
    });

    const setAuthMode = (signup) => {
      isSignup = Boolean(signup);
      document.querySelector("#auth-title").textContent = isSignup ? "Create your workspace." : "Your content, in sync.";
      document.querySelector("#auth-description").textContent = isSignup
        ? "Create an account to start saving your posts and schedule."
        : "Sign in to save your drafts, captions, and publishing calendar across devices.";
      document.querySelector("#auth-submit").textContent = isSignup ? "Create account" : "Sign in";
      document.querySelector("#auth-switch-copy").textContent = isSignup ? "Already have an account?" : "New to PostPilot?";
      document.querySelector("#auth-switch").textContent = isSignup ? "Sign in" : "Create an account";
      document.querySelector("#auth-password").autocomplete = isSignup ? "new-password" : "current-password";
      document.querySelector("#auth-full-name-label").hidden = !isSignup;
      document.querySelector("#auth-full-name").hidden = !isSignup;
      document.querySelector("#auth-full-name").required = isSignup;
      document.querySelector("#auth-workspace-label").hidden = !isSignup;
      document.querySelector("#auth-workspace").hidden = !isSignup;
      document.querySelector("#auth-workspace").required = isSignup;
      document.querySelector("#auth-forgot-row").hidden = isSignup;
      showAuthError("");
    };
    document.querySelector("#auth-switch").addEventListener("click", () => setAuthMode(!isSignup));


    document.querySelector("#auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      const fullName = document.querySelector("#auth-full-name").value.trim();
      const workspaceName = document.querySelector("#auth-workspace").value.trim();
      const submit = document.querySelector("#auth-submit");
      if (isPasswordRecovery || new URLSearchParams(window.location.search).get("reset_password") === "1" || new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery") {
        submit.disabled = true;
        submit.textContent = "Updating password…";
        showAuthError("");
        try {
          const authClient = await ensureClient();
          const { error } = await authClient.auth.updateUser({ password });
          if (error) throw error;
          window.history.replaceState({}, "", window.location.pathname);
          isPasswordRecovery = false;
          document.querySelector("#auth-email").hidden = false;
          document.querySelector('label[for="auth-email"]').hidden = false;
          document.querySelector(".auth-switch").hidden = false;
          document.querySelector("#auth-forgot-row").hidden = false;
          document.querySelector("#auth-title").textContent = "Password updated";
          document.querySelector("#auth-description").textContent = "Your password has been changed. You can now continue to PostPilot.";
          document.querySelector("#auth-password").value = "";
          document.querySelector("#auth-password").placeholder = "Password updated";
          showAuthError("Password updated successfully. You can sign in with your new password.");
          const errorBox = document.querySelector("#auth-error");
          errorBox.style.display = "block";
          errorBox.style.background = "#eef7f1";
          errorBox.style.color = "#216844";
          submit.textContent = "Continue";
          submit.disabled = false;
          submit.type = "button";
          submit.onclick = () => {
            document.querySelector("#auth-title").textContent = "Your content, in sync.";
            document.querySelector("#auth-description").textContent = "Sign in to save your drafts, captions, and publishing calendar across devices.";
            submit.type = "submit";
            submit.onclick = null;
            submit.textContent = "Sign in";
            showAuthError("");
          };
        } catch (error) {
          showAuthError(error.message || "Could not update password. Request a fresh reset link and try again.");
          submit.disabled = false;
          submit.textContent = "Update password";
        }
        return;
      }
      submit.disabled = true;
      submit.textContent = isSignup ? "Creating account…" : "Signing in…";
      showAuthError("");
      try {
        const authClient = await ensureClient();
        const result = isSignup
          ? await authClient.auth.signUp({ email, password, options: { data: { full_name: fullName, workspace_name: workspaceName } } })
          : await authClient.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (isSignup && !result.data.session) {
          showAuthError("Account created. Check your email to confirm your address, then sign in.");
          return;
        }
        currentUser = result.data.user || result.data.session?.user || null;
        if (currentUser) await finishSignIn();
      } catch (error) {
        showAuthError(error.message || "Authentication failed. Please try again.");
      } finally {
        submit.disabled = false;
        submit.textContent = isSignup ? "Create account" : "Sign in";
      }
    });
  }

  function activatePasswordRecovery() {
    isPasswordRecovery = true;
    buildAuth();
    const backdrop = document.querySelector("#auth-backdrop");
    if (backdrop) backdrop.style.display = "grid";
    document.querySelector("#auth-title").textContent = "Set a new password";
    document.querySelector("#auth-description").textContent = "Choose a new password for your PostPilot account.";
    document.querySelector("#auth-email").hidden = true;
    document.querySelector('label[for="auth-email"]').hidden = true;
    document.querySelector("#auth-forgot-row").hidden = true;
    document.querySelector(".auth-switch").hidden = true;
    const password = document.querySelector("#auth-password");
    password.autocomplete = "new-password";
    password.minLength = 8;
    password.placeholder = "At least 8 characters";
    password.value = "";
    document.querySelector("#auth-submit").textContent = "Save new password";
    showAuthError("");
  }

  function showProfileSetup() {
    const backdrop = document.querySelector("#auth-backdrop");
    if (backdrop) backdrop.style.display = "grid";
    document.querySelector("#auth-title").textContent = "Set up your private workspace";
    document.querySelector("#auth-description").textContent = "Tell us who you are and what workspace this content belongs to. Your posts and connected accounts stay separate from other users.";
    document.querySelector("#auth-form").innerHTML = `
      <label class="auth-field" for="profile-full-name">Full name *</label>
      <input class="auth-input" id="profile-full-name" type="text" autocomplete="name" minlength="2" placeholder="Your full name" required>
      <label class="auth-field" for="profile-workspace-name">Business or workspace name *</label>
      <input class="auth-input" id="profile-workspace-name" type="text" autocomplete="organization" minlength="2" placeholder="Your brand or business" required>
      <div class="auth-error" id="auth-error" role="alert"></div>
      <button class="auth-submit" id="profile-save" type="submit">Save profile and continue</button>`;
    document.querySelector(".auth-switch").hidden = true;
    document.querySelector(".auth-note").textContent = "Required profile details. Each account has its own private posts, schedule, and Instagram connection.";
    document.querySelector("#auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.querySelector("#profile-save");
      button.disabled = true;
      button.textContent = "Saving…";
      const fullName = document.querySelector("#profile-full-name").value.trim();
      const workspaceName = document.querySelector("#profile-workspace-name").value.trim();
      try {
        const { error } = await client.from("profiles").upsert({ id: currentUser.id, full_name: fullName, workspace_name: workspaceName, updated_at: new Date().toISOString() });
        if (error) throw error;
        await client.auth.updateUser({ data: { full_name: fullName, workspace_name: workspaceName } });
        document.querySelector("#auth-backdrop").remove();
        buildAuth();
        await finishSignIn();
      } catch (error) {
        showAuthError(error.message || "Could not save profile. Please try again.");
        button.disabled = false;
        button.textContent = "Save profile and continue";
      }
    }, { once: true });
  }

  function showAuthError(message) {
    const el = document.querySelector("#auth-error");
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? "block" : "none";
  }

  function showGuestMode() {
    currentUser = null;
    document.body.classList.remove("auth-required");
    const authEntryActions = document.querySelector("#auth-entry-actions");
    if (authEntryActions) authEntryActions.hidden = false;
    document.querySelector("#guest-auth-gate")?.setAttribute("hidden", "");
    document.querySelector("#platform-selector")?.removeAttribute("hidden");
    document.querySelector(".platform-selector")?.removeAttribute("hidden");
    document.querySelector("#linkedin-workspace")?.removeAttribute("hidden");
    document.querySelectorAll(".welcome-row,.metric-grid,.workspace-grid,.bottom-grid").forEach(el => el.removeAttribute("hidden"));
    document.querySelector(".invite-button")?.removeAttribute("hidden");
    document.querySelector(".quick-action[data-action=\"invite\"]")?.removeAttribute("hidden");
    document.querySelectorAll("[data-user-initials]").forEach(el => el.textContent = "—");
    const guestGateButton = document.querySelector("#guest-login-cta");
    if (guestGateButton && !guestGateButton.dataset.bound) { guestGateButton.dataset.bound = "1"; guestGateButton.addEventListener("click", () => { buildAuth(); isSignup = false; document.querySelector("#auth-title").textContent = "Welcome to PostPilot"; document.querySelector("#auth-backdrop").style.display = "grid"; }); }
    const backdrop = document.querySelector("#auth-backdrop");
    if (backdrop) backdrop.style.display = "none";
    const profile = document.querySelector(".profile-copy");
    if (profile) profile.innerHTML = "<strong>Guest visitor</strong><small>Browsing preview</small>";
    const signout = document.querySelector("#auth-signout");
    if (signout) signout.remove();
    const profileRow = document.querySelector(".profile-row");
    if (profileRow && !profileRow.dataset.guestBound) {
      profileRow.dataset.guestBound = "true";
      profileRow.addEventListener("click", () => {
        buildAuth();
        isSignup = false;
        document.querySelector("#auth-title").textContent = "Welcome to PostPilot";
        document.querySelector("#auth-description").textContent = "Sign in or create your own private workspace to save content, manage your calendar, and connect Instagram.";
        document.querySelector("#auth-backdrop").style.display = "grid";
      });
    }
    const workspace = document.querySelector(".workspace-meta");
    if (workspace) workspace.innerHTML = "<strong>Guest preview</strong><small>Sign in to save your own work</small>";
    const guestNote = document.querySelector("#guest-preview-note");
    if (!guestNote) {
      const note = document.createElement("div");
      note.id = "guest-preview-note";
      note.style.cssText = "margin:0 0 18px;padding:11px 15px;border:1px solid #e9e5fb;border-radius:12px;background:#f7f5ff;color:#62568e;font-size:13px";
      note.innerHTML = "<strong>Guest mode</strong> — explore the dashboard freely. Sign in when you’re ready to save posts, manage your calendar, or connect Instagram.";
      const main = document.querySelector(".main-area");
      const topbar = main?.querySelector(".topbar");
      if (topbar) topbar.insertAdjacentElement("afterend", note);
    }
    const instagramPanel = document.querySelector("#instagram-connection-panel");
    if (instagramPanel) instagramPanel.remove();
  }

  async function finishSignIn() {
    if (!currentUser) return;
    // Unlock the dashboard immediately after Supabase confirms the user.
    // Profile reads/writes are optional enrichment and must never block authentication.
    const fallbackName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || (currentUser.email || "User").split("@")[0];
    const fallbackWorkspace = currentUser.user_metadata?.workspace_name || "My workspace";
    let profileData = { full_name: fallbackName, workspace_name: fallbackWorkspace };
    try {
      const { data: savedProfile, error: profileReadError } = await client.from("profiles").select("full_name,workspace_name").eq("id", currentUser.id).maybeSingle();
      if (profileReadError) console.warn("PostPilot profile read skipped; using account metadata:", profileReadError.message);
      if (savedProfile?.full_name || savedProfile?.workspace_name) {
        profileData = {
          full_name: savedProfile.full_name || fallbackName,
          workspace_name: savedProfile.workspace_name || fallbackWorkspace
        };
      }
      const { error: profileWriteError } = await client.from("profiles").upsert({ id: currentUser.id, full_name: profileData.full_name, workspace_name: profileData.workspace_name, updated_at: new Date().toISOString() });
      if (profileWriteError) console.warn("PostPilot profile save skipped:", profileWriteError.message);
    } catch (profileError) {
      console.warn("PostPilot profile setup skipped:", profileError?.message || profileError);
    }
    document.body.classList.remove("auth-required");
    await loadReminderPreferences().catch(error => console.warn("Reminder preferences unavailable:", error));
    const backdrop = document.querySelector("#auth-backdrop");
    if (backdrop) backdrop.style.display = "none";
    const authEntryActions = document.querySelector("#auth-entry-actions");
    if (authEntryActions) authEntryActions.hidden = true;
    document.querySelector("#guest-auth-gate")?.setAttribute("hidden", "");
    document.querySelector(".platform-selector")?.removeAttribute("hidden");
    document.querySelectorAll(".welcome-row,.metric-grid,.workspace-grid,.bottom-grid").forEach(el => el.removeAttribute("hidden"));
    document.querySelector(".invite-button")?.removeAttribute("hidden");
    document.querySelector(".quick-action[data-action=\"invite\"]")?.removeAttribute("hidden");
    const initials = String(profileData.full_name || "").trim().split(/\\s+/).filter(Boolean).slice(0,2).map(part => part.charAt(0).toUpperCase()).join("") || "U";
    document.querySelectorAll("[data-user-initials]").forEach(el => el.textContent = initials);
    document.querySelector("#guest-preview-note")?.remove();
    const profileRow = document.querySelector(".profile-row");
    if (profileRow && !document.querySelector("#auth-signout")) {
      const signout = document.createElement("button");
      signout.id = "auth-signout";
      signout.type = "button";
      signout.textContent = "Sign out";
      signout.style.cssText = "display:block;width:calc(100% - 24px);margin:8px 12px;padding:9px 12px;border-radius:9px;background:#f1effa;color:#5743b1;font-weight:600;text-align:left;";
      signout.addEventListener("click", async () => {
        await client.auth.signOut();
        currentUser = null;
        toast("Signed out. This session is now closed.");
        window.location.reload();
      });
      profileRow.insertAdjacentElement("afterend", signout);
    }
    const profile = document.querySelector(".profile-copy");
    if (profile) profile.innerHTML = "<strong>" + escapeHtml(profileData.full_name) + "</strong><small>" + escapeHtml(profileData.workspace_name) + "</small>";
    ensureInstagramPanel();
    refreshInstagramStatus();
    const workspace = document.querySelector(".workspace-meta");
    if (workspace) workspace.innerHTML = "<strong>" + escapeHtml(profileData.workspace_name) + "</strong><small>Private workspace</small>";
    await loadPosts();
    window.dispatchEvent(new CustomEvent("postpilot:auth-ready"));
    toast("Welcome to PostPilot — dashboard ready.");
  }

  async function loadPosts() {
    if (!currentUser) return;
    const { data, error } = await client.from("posts")
      .select("id,title,content_type,caption,hashtags,status,approval_status,publish_error,scheduled_at,created_at,media_url")
      .eq("user_id", currentUser.id)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) {
      console.error("PostPilot load error:", error);
      toast("Signed in, but posts could not load: " + error.message);
      return;
    }
    const posts = data || [];
    window.dispatchEvent(new CustomEvent("postpilot:posts-updated", { detail: { posts } }));
    const scheduledPosts = posts.filter((post) => post.status === "scheduled");
    const drafts = posts.filter((post) => post.status === "draft");
    const published = posts.filter((post) => post.status === "published");
    const mediaCount = posts.filter((post) => Boolean(post.media_url)).length;
    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = String(value);
    };
    setText("#scheduled-count", scheduledPosts.length);
    setText("#draft-count", drafts.length);
    setText("#metric-scheduled", scheduledPosts.length);
    setText("#metric-published", published.length);
    setText("#metric-media", mediaCount);
    setText("#queue-total", scheduledPosts.length);
    setText("#queue-scheduled", scheduledPosts.length);
    setText("#queue-drafts", drafts.length);
    setText(".nav-item[data-view='library'] .nav-count", posts.length);
    setText(".recent-panel .heading-count", posts.length + " items");

    const calendar = document.querySelector("#week-calendar");
    if (calendar) {
      calendar.innerHTML = "";
      if (!posts.length) {
        const empty = document.createElement("div");
        empty.className = "calendar-empty-state";
        empty.textContent = "Your saved posts will appear here once you schedule them.";
        calendar.appendChild(empty);
      } else {
        const list = document.createElement("div");
        list.className = "calendar-post-list";
        posts.filter((post) => post.status === "scheduled" || post.status === "draft")
          .slice(0, 12).forEach((post) => {
            const item = document.createElement("article");
            item.className = "calendar-post-item";
            const scheduledMs = post.scheduled_at ? new Date(post.scheduled_at).getTime() : null;
            const isOverdue = post.status === "scheduled" && scheduledMs !== null && scheduledMs <= Date.now();
            const date = post.scheduled_at
              ? (isOverdue ? "OVERDUE · " : "") + new Date(post.scheduled_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Draft · no date set";
            const title = document.createElement("strong");
            title.textContent = post.title || "Untitled content";
            const details = document.createElement("span");
            details.textContent = date + " · " + (post.content_type || "post") + " · " + post.status;
            item.append(title, details);
            const actions = document.createElement("div");
            actions.className = "post-actions calendar-post-actions";
            actions.innerHTML = `${post.approval_status === "failed" ? `<button class="row-menu publish-action" type="button" data-approve-publish="${escapeHtml(post.id)}" data-scheduled-at="${escapeHtml(post.scheduled_at || "")}">Retry publishing</button>` : ""}<button class="row-menu publish-action" type="button" data-publish-manually="${escapeHtml(post.id)}" data-caption-text="${escapeHtml(post.caption || "")}" data-hashtags-text="${escapeHtml(Array.isArray(post.hashtags) ? post.hashtags.map((tag) => "#" + String(tag).replace(/^#+/, "")).join(" ") : "")}">Publish manually</button><button class="row-menu" type="button" data-copy-caption="${escapeHtml(post.id)}">Copy caption</button>${post.media_url ? `<button class="row-menu" type="button" data-save-media="${escapeHtml(post.id)}">Open media</button>` : ""}<button class="row-menu" type="button" data-open-instagram="${escapeHtml(post.id)}">Open Instagram</button>`;
            item.appendChild(actions);
            list.appendChild(item);
          });
        if (!list.childElementCount) {
          const empty = document.createElement("div");
          empty.className = "calendar-empty-state";
          empty.textContent = "No upcoming posts. Create a post and choose a date to see it here.";
          list.appendChild(empty);
        }
        calendar.appendChild(list);
      }
    }

    const rows = document.querySelector(".content-table");
    if (rows) {
      const header = rows.querySelector(".table-head");
      rows.innerHTML = "";
      if (header) rows.appendChild(header);
      if (!posts.length) {
        const empty = document.createElement("div");
        empty.className = "content-row";
        empty.innerHTML = '<div class="content-name"><span><strong>No saved content yet</strong><small>Create your first post to see it here.</small></span></div>';
        rows.appendChild(empty);
      } else {
        posts.slice(0, 8).forEach((post) => {
          const date = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : "No date set";
          const isOverdue = post.status === "scheduled" && post.scheduled_at && new Date(post.scheduled_at).getTime() <= Date.now();
          const statusClass = post.status === "published" ? "status-published" : post.status === "draft" ? "status-draft" : "status-scheduled";
          const statusLabel = post.status === "scheduled" && isOverdue ? "overdue · publishing queue" : post.status === "scheduled" ? "scheduled" : post.status;
          const row = document.createElement("div");
          row.className = "content-row";
          row.innerHTML = `
            <div class="content-name"><div class="table-thumb thumb-portrait"></div><span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml((post.caption || "").slice(0, 70) || "No caption added")}</small></span></div>
            <span class="type-tag">${escapeHtml(post.content_type)}</span>
            <span class="status-tag ${statusClass}"><i></i> ${escapeHtml(statusLabel)}${post.approval_status === "failed" ? " · publish failed" : ""}</span>
            <span class="row-date">${escapeHtml(date)}</span><div class="post-actions">${post.approval_status === "failed" ? `<button class="row-menu publish-action" type="button" data-approve-publish="${escapeHtml(post.id)}" data-scheduled-at="${escapeHtml(post.scheduled_at || "")}">Retry publishing</button>` : ""}<button class="row-menu publish-action" type="button" data-publish-manually="${escapeHtml(post.id)}">Publish manually</button><button class="row-menu" type="button" data-copy-caption="${escapeHtml(post.id)}" aria-label="Copy caption">Copy caption</button>${post.media_url ? `<button class="row-menu" type="button" data-save-media="${escapeHtml(post.id)}">Open media</button>` : ""}<button class="row-menu" type="button" data-open-instagram="${escapeHtml(post.id)}">Open Instagram</button>${post.scheduled_at && post.status !== "published" ? `<button class="row-menu" type="button" data-remind-post="${escapeHtml(post.id)}" data-remind-at="${escapeHtml(post.scheduled_at)}">Remind me</button>` : ""}</div>`;
          rows.appendChild(row);
        });
      }
    }
    const ring = document.querySelector(".health-ring");
    if (ring) {
      const total = scheduledPosts.length + drafts.length;
      const pct = total ? Math.round(scheduledPosts.length / total * 100) : 0;
      ring.style.background = "conic-gradient(var(--purple) 0 " + pct + "%, #eeecf4 " + pct + "% 100%)";
    }
  }

  function getScheduledDate(dateId, timeId, fallbackMinutes) {
    const date = document.querySelector(dateId)?.value;
    const time = document.querySelector(timeId)?.value || "19:00";
    if (date) {
      const parsed = new Date(date + "T" + time + ":00");
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date(Date.now() + fallbackMinutes * 60000).toISOString();
  }

  async function saveSinglePost() {
    if (!currentUser) {
      buildAuth();
      document.querySelector("#auth-backdrop").style.display = "grid";
      toast("Sign in before saving content.");
      return;
    }
    const title = document.querySelector("#content-title")?.value.trim() || "Untitled content";
    const contentType = document.querySelector(".type-choice.active")?.dataset.type || "Carousel";
    const caption = document.querySelector("#content-caption")?.value.trim() || "";
    const file = document.querySelector("#file-input")?.files?.[0] || null;
    const dateValue = document.querySelector("#schedule-date")?.value;
    const timeValue = document.querySelector("#schedule-time")?.value || "19:00";
    const scheduledAt = getScheduledDate("#schedule-date", "#schedule-time", 60);
    if (!dateValue || new Date(scheduledAt).getTime() <= Date.now()) {
      toast("Choose a future date and time. Past scheduling is not allowed.");
      return;
    }
    const status = "scheduled";
    let mediaPath = null;
    if (file) {
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "upload";
      mediaPath = currentUser.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await client.storage.from("post-media").upload(mediaPath, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream"
      });
      if (uploadError) {
        toast("Media upload failed: " + uploadError.message);
        return;
      }
    }
    const payload = {
      user_id: currentUser.id,
      title,
      content_type: contentType.toLowerCase(),
      caption,
      hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) || []),
      media_url: mediaPath,
      original_filename: file?.name || null,
      status,
      scheduled_at: scheduledAt
    };
    const { error } = await client.from("posts").insert(payload);
    if (error) {
      if (mediaPath) await client.storage.from("post-media").remove([mediaPath]);
      toast("Couldn't save post: " + error.message);
      return;
    }
    document.querySelector("#modal-backdrop").hidden = true;
    document.body.style.overflow = "";
    document.querySelector("#schedule-form").reset();
    toast("Post saved to your PostPilot calendar.");
    await loadPosts();
  }

  let bulkUploadPaused = false, bulkUploadCancelled = false;
  window.postpilotBulkControl = (action) => {
    if(action === "pause") bulkUploadPaused = true;
    if(action === "resume") bulkUploadPaused = false;
    if(action === "cancel") { bulkUploadCancelled = true; bulkUploadPaused = false; }
  };
  async function saveBulkPosts() {
    if (!currentUser) {
      buildAuth();
      document.querySelector("#auth-backdrop").style.display = "grid";
      toast("Sign in before saving content.");
      return;
    }
    const files = Array.from(document.querySelector("#bulk-file-input")?.files || []);
    if (!files.length) { toast("Choose one or more files for bulk scheduling first."); return; }
    if (files.length > 500) { toast("Bulk scheduling supports up to 500 files at a time."); return; }
    const items = Array.from(document.querySelectorAll(".batch-post-item"));
    if (items.length !== files.length) { toast("Please reselect the files so every post has its own schedule."); return; }
    const sharedCaption = document.querySelector("#bulk-caption")?.value.trim() || "";
    const schedules = [];
    for (let index = 0; index < files.length; index++) {
      const item = items[index], date = item.querySelector("[data-batch-date]")?.value, time = item.querySelector("[data-batch-time]")?.value;
      const localDateTime = date && time ? new Date(date + "T" + time + ":00") : null;
      if (!localDateTime || !Number.isFinite(localDateTime.getTime()) || localDateTime.getTime() <= Date.now()) {
        toast("Post " + (index + 1) + " (" + files[index].name + ") needs a future date and time."); return;
      }
      const captionInput = item.querySelector("[data-batch-caption]");
      const caption = captionInput?.value.trim() || (captionInput?.dataset.edited ? "" : sharedCaption);
      schedules.push({dateTime:localDateTime,caption,title:item.querySelector("[data-batch-title]")?.value.trim() || files[index].name.replace(/\.[^.]+$/,"") || "Untitled content"});
    }
    bulkUploadPaused = false; bulkUploadCancelled = false;
    const progressPanel = document.querySelector("#bulk-upload-progress");
    if(progressPanel) progressPanel.hidden = false;
    const pauseButton = document.querySelector("#bulk-upload-pause");
    const cancelButton = document.querySelector("#bulk-upload-cancel");
    if(pauseButton){pauseButton.disabled=false;pauseButton.dataset.paused="false";pauseButton.textContent="Pause uploads";}
    if(cancelButton){cancelButton.disabled=false;cancelButton.textContent="Cancel remaining";}
    const batchId = crypto.randomUUID(), rows = [], failedFiles = [];
    let uploaded = 0;
    const notify = status => window.dispatchEvent(new CustomEvent("postpilot:bulk-progress",{detail:{uploaded,total:files.length,failed:failedFiles.length,status}}));
    notify("Preparing uploads");
    const uploadOne = async index => {
      const file=files[index], safeName=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-120)||"upload";
      const path=currentUser.id+"/"+crypto.randomUUID()+"-"+safeName;
      const {error:uploadError}=await client.storage.from("post-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||"application/octet-stream"});
      if(uploadError){failedFiles.push({file,error:uploadError.message});return;}
      const caption=schedules[index].caption,isVideo=file.type.startsWith("video/");
      rows.push({user_id:currentUser.id,title:schedules[index].title,content_type:isVideo?"reel":"photo",caption,hashtags:(caption.match(/#[\p{L}\p{N}_]+/gu)||[]),media_url:path,original_filename:file.name,status:"scheduled",scheduled_at:schedules[index].dateTime.toISOString(),batch_id:batchId});
      uploaded++;
      notify("Uploading files");
    };
    for(let start=0;start<files.length&&!bulkUploadCancelled;start+=20){
      while(bulkUploadPaused&&!bulkUploadCancelled){notify("Paused");await new Promise(resolve=>setTimeout(resolve,250));}
      if(bulkUploadCancelled)break;
      const chunk=Array.from({length:Math.min(20,files.length-start)},(_,offset)=>start+offset);
      await Promise.all(chunk.map(uploadOne));
      notify(bulkUploadCancelled?"Cancelled":"Uploading files");
    }
    if(rows.length){
      const {error}=await client.from("posts").insert(rows);
      if(error){toast("Uploads completed, but saving posts failed: "+error.message);return;}
    }
    const status=bulkUploadCancelled?"Stopped":"Complete";
    notify(status);
    if(progressPanel)progressPanel.hidden=false;
    if(pauseButton)pauseButton.disabled=true;
    if(cancelButton)cancelButton.disabled=true;
    if(rows.length)await loadPosts();
    if(failedFiles.length)toast(rows.length+" posts saved; "+failedFiles.length+" uploads failed. Reselect failed files to retry.");
    else if(bulkUploadCancelled)toast(rows.length+" posts saved. Remaining files were cancelled.");
    else toast(rows.length+" posts saved with their individual captions and schedules.");
    if(rows.length===files.length){
      document.querySelector("#modal-backdrop").hidden=true;document.body.style.overflow="";
      document.querySelector("#schedule-form").reset();document.querySelector("#schedule-form").classList.remove("bulk-active");
      const preview=document.querySelector("#batch-preview");if(preview){preview.hidden=true;preview.innerHTML="";}
    }
  }

  function addBulkCaptionField() {
    const panel = document.querySelector(".bulk-panel");
    if (!panel || document.querySelector("#bulk-caption")) return;
    const wrap = document.createElement("div");
    wrap.className = "bulk-caption-wrap";
    wrap.innerHTML = '<label class="form-label" for="bulk-caption">Default caption and hashtags <span class="optional">Optional</span></label><textarea class="form-input caption-input" id="bulk-caption" placeholder="Optional shared caption. You can customize every post below."></textarea><button type="button" class="secondary-button" id="apply-batch-caption">Apply this caption to all posts</button><p class="bulk-caption-help">Each post can have a different caption, date and time. Use the buttons to reuse the same caption or default schedule when you want.</p>';
    const header = panel.querySelector(".bulk-panel-header");
    if (header) header.insertAdjacentElement("afterend", wrap);
    else panel.prepend(wrap);
  }

  function scheduleReminder(postId, isoDate) {
    const scheduledWhen = new Date(isoDate).getTime();
    if (!Number.isFinite(scheduledWhen) || scheduledWhen <= Date.now()) {
      toast("Choose a future scheduled time to set a reminder.");
      return;
    }
    let remindersEnabled = true, beforeMinutes = 30;
    try {
      remindersEnabled = localStorage.getItem("postpilot-in-app-reminders") !== "false";
      beforeMinutes = Number(localStorage.getItem("postpilot-reminder-before-minutes") || 30);
      if (![10,30,60,1440].includes(beforeMinutes)) beforeMinutes = 30;
    } catch (_) {}
    if (!remindersEnabled) {
      toast("In-app reminders are turned off in Settings.");
      return;
    }
    const when = scheduledWhen - beforeMinutes * 60000;
    if (when <= Date.now()) {
      try { localStorage.removeItem("postpilot-reminder:" + postId); } catch (_) {}
      toast("The reminder time has already passed. Choose a shorter lead time or schedule further ahead.");
      return;
    }
    const key = "postpilot-reminder:" + postId;
    try { localStorage.setItem(key, String(scheduledWhen)); } catch (_) {}
    const existing = reminderTimers.get(postId);
    if (existing) clearTimeout(existing);
    const delay = when - Date.now();
    if (delay > 2147483647) {
      toast("Reminder saved. Keep PostPilot open closer to the scheduled time.");
      return;
    }
    const timer = setTimeout(async () => {
      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Time to post with PostPilot", {
            body: "Your scheduled content is coming up. Open PostPilot to review it and publish manually.",
            icon: "/favicon.ico"
          });
        } else {
          toast("Your post is due. Open PostPilot to copy the caption and launch Instagram.");
        }
      } else {
        toast("Your post is due. Open PostPilot to copy the caption and launch Instagram.");
      }
      try { localStorage.removeItem(key); } catch (_) {}
      reminderTimers.delete(postId);
    }, delay);
    reminderTimers.set(postId, timer);
    toast("Reminder set for " + new Date(when).toLocaleString());
  }

  function restoreReminders() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("postpilot-reminder:")) continue;
        const postId = key.slice("postpilot-reminder:".length);
        const when = Number(localStorage.getItem(key));
        if (when > Date.now()) scheduleReminder(postId, new Date(when).toISOString());
        else localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("Could not restore reminders:", error);
    }
  }

  async function loadReminderPreferences() {
    if (!currentUser) return;
    try {
      const { data, error } = await client.from("workspace_settings")
        .select("reminder_preferences")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      if (error) return;
      const preferences = data?.reminder_preferences || { in_app: true, before_minutes: 30 };
      const enabled = preferences.in_app !== false;
      const beforeMinutes = [10,30,60,1440].includes(Number(preferences.before_minutes)) ? Number(preferences.before_minutes) : 30;
      try {
        localStorage.setItem("postpilot-in-app-reminders", enabled ? "true" : "false");
        localStorage.setItem("postpilot-reminder-before-minutes", String(beforeMinutes));
      } catch (_) {}
      if (!enabled) {
        for (const timer of reminderTimers.values()) clearTimeout(timer);
        reminderTimers.clear();
      } else {
        restoreReminders();
      }
    } catch (_) {}
  }

  window.addEventListener("postpilot:reminder-preferences-changed", (event) => {
    const preferences = event.detail || {};
    if (preferences.in_app === false) {
      for (const timer of reminderTimers.values()) clearTimeout(timer);
      reminderTimers.clear();
    } else {
      restoreReminders();
    }
  });

  function ensureInstagramPanel() {
    if (document.querySelector("#instagram-connection-panel")) return;
    const welcome = document.querySelector(".welcome-row");
    if (!welcome) return;
    const panel = document.createElement("section");
    panel.id = "instagram-connection-panel";
    panel.className = "panel";
    panel.style.cssText = "margin:18px 0;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap";
    panel.innerHTML = '<div><strong>Instagram publishing · Automatic scheduling</strong><p id="instagram-connection-status" style="margin:5px 0 0;color:var(--muted,#777)">Checking connection…</p><small>Scheduled posts publish automatically at their scheduled time when your Instagram connection and Meta permissions are valid.</small></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary-button" id="instagram-connect-button" type="button">Connect Instagram Business</button><button id="instagram-disconnect-button" type="button" style="padding:10px 14px;border:1px solid var(--border,#ddd);border-radius:10px;background:transparent;color:var(--text,#333);font-weight:600" hidden>Disconnect</button></div>';
    welcome.insertAdjacentElement("afterend", panel);
    panel.querySelector("#instagram-disconnect-button").addEventListener("click", async (event) => {
      if (!window.confirm("Disconnect this Instagram account from your PostPilot workspace? Your saved posts will remain.")) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { data, error } = await client.functions.invoke("instagram-publishing", { body: { action: "disconnect" } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const status = document.querySelector("#instagram-connection-status");
        if (status) status.textContent = "Instagram disconnected. Your saved posts are unchanged.";
        const connect = document.querySelector("#instagram-connect-button");
        if (connect) connect.textContent = "Connect Instagram Business";
        button.hidden = true;
        toast("Instagram disconnected securely.");
      } catch (error) {
        toast("Could not disconnect Instagram: " + (error.message || "Please try again."));
      } finally {
        button.disabled = false;
      }
    });
    panel.querySelector("#instagram-connect-button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Connecting…";
      try {
        const { data, error } = await client.functions.invoke("instagram-publishing", { body: { action: "connect-url" } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error("Connection URL was not returned.");
        window.location.href = data.url;
      } catch (error) {
        toast("Instagram connection not configured: " + (error.message || "check Meta app setup and Edge Function deployment."));
        button.disabled = false;
        button.textContent = "Connect Instagram Business";
      }
    });
    const query = new URLSearchParams(window.location.search);
    if (query.get("instagram_connected") === "1") {
      toast("Instagram connected. Publishing still requires approval for each post.");
      query.delete("instagram_connected");
      history.replaceState({}, "", window.location.pathname + (query.toString() ? "?" + query : ""));
    } else if (query.has("instagram_error")) {
      toast("Instagram connection needs attention: " + query.get("instagram_error").replaceAll("_", " "));
      query.delete("instagram_error");
      history.replaceState({}, "", window.location.pathname + (query.toString() ? "?" + query : ""));
    }
  }

  async function refreshInstagramStatus() {
    const status = document.querySelector("#instagram-connection-status");
    const button = document.querySelector("#instagram-connect-button");
    if (!status || !currentUser) return;
    try {
      const { data, error } = await client.functions.invoke("instagram-publishing", { body: { action: "status" } });
      if (error || data?.error) throw error || new Error(data.error);
      if (data?.connected) {
        status.textContent = "Connected as @" + (data.username || "Instagram Business") + ". Review each post before publishing." + (data.warning ? " Token needs attention: " + data.warning : "");
        if (button) button.textContent = "Reconnect Instagram";
        const disconnect = document.querySelector("#instagram-disconnect-button");
        if (disconnect) disconnect.hidden = false;
      } else {
        status.textContent = "Not connected yet. Connect your eligible Instagram professional account.";
        const disconnect = document.querySelector("#instagram-disconnect-button");
        if (disconnect) disconnect.hidden = true;
      }
    } catch (error) {
      const detail = error?.message || error?.context?.message || "Unknown connection error";
      status.textContent = "Could not check Instagram connection: " + detail + ". Check the Edge Function logs and Meta configuration if this continues.";
      console.error("PostPilot Instagram status check failed:", error);
    }
  }

  function bindPostActions() {
    document.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-copy-caption]");
      const openButton = event.target.closest("[data-open-instagram]");
      const remindButton = event.target.closest("[data-remind-post]");
      const mediaButton = event.target.closest("[data-save-media]");
      const publishButton = event.target.closest("[data-publish-manually]");
      const approveButton = event.target.closest("[data-approve-publish]");
      if (!copyButton && !openButton && !remindButton && !mediaButton && !publishButton && !approveButton) return;
      if (approveButton) {
        if (!currentUser) { toast("Sign in before approving a post."); return; }
        const scheduledAt = approveButton.dataset.scheduledAt;
        const isFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
        const prompt = isFuture
          ? "This post is scheduled for " + new Date(scheduledAt).toLocaleString() + ". Approve & publish now will publish it immediately, not on that future date. Continue?"
          : "Retry publishing this post to Instagram now? It will publish publicly if Meta accepts it.";
        if (!window.confirm(prompt)) return;
        approveButton.disabled = true;
        approveButton.textContent = "Retrying…";
        try {
          const { data, error } = await client.functions.invoke("instagram-publishing", { body: { action: "approve-publish", postId: approveButton.dataset.approvePublish } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast("Meta confirmed publishing. Refreshing your posts…");
          await loadPosts();
        } catch (error) {
          toast("Not published: " + (error.message || "Instagram connection or Meta setup is incomplete."));
          approveButton.disabled = false;
          approveButton.textContent = "Retry publishing";
        }
        return;
      }
      // Launch Instagram synchronously from the tap; iOS Safari may block pop-ups after awaited requests.
      const mediaTab = mediaButton ? window.open("about:blank", "_blank") : null;
      const instagramTab = (publishButton || openButton) ? window.open("https://www.instagram.com/", "_blank") : null;
      if (publishButton) {
        const quickCaption = [publishButton.dataset.captionText || "", publishButton.dataset.hashtagsText || ""].filter(Boolean).join("\n\n");
        // Trigger clipboard access directly from the tap before any network request.
        try {
          navigator.clipboard.writeText(quickCaption)
            .then(() => toast("Caption copied. Select your media in Instagram to finish publishing."))
            .catch(() => toast("Instagram opened. Caption copying was blocked; copy the caption manually."));
        } catch (_) {
          toast("Instagram opened. Caption copying was blocked; copy the caption manually.");
        }
      }
      if (!currentUser) {
        if (mediaTab) mediaTab.close();
        toast("Sign in to manage your saved posts.");
        return;
      }
      const actionButton = copyButton || openButton || remindButton || mediaButton || publishButton;
      const postId = actionButton.dataset.copyCaption || actionButton.dataset.openInstagram ||
        actionButton.dataset.remindPost || actionButton.dataset.saveMedia || actionButton.dataset.publishManually;
      const { data: post, error } = await client.from("posts")
        .select("id,title,caption,hashtags,scheduled_at,media_url,original_filename")
        .eq("id", postId).eq("user_id", currentUser.id).maybeSingle();
      if (error || !post) {
        if (mediaTab) mediaTab.close();
        toast("Could not load that post. Please refresh and try again.");
        return;
      }
      if (copyButton) {
        const tags = Array.isArray(post.hashtags) ? post.hashtags.map((tag) => "#" + String(tag).replace(/^#+/, "")).join(" ") : "";
        const text = [post.caption || "", tags].filter(Boolean).join("\n\n");
        try {
          await navigator.clipboard.writeText(text);
          if (publishButton) {
            toast(post.media_url ? "Caption copied. Select your media in Instagram to finish publishing." : "Caption copied. This post has no uploaded media attached.");
          } else {
            toast("Caption copied. Paste it into Instagram when you post.");
          }
        } catch (_) {
          if (publishButton) {
            toast("Instagram opened, but caption copying was blocked. Copy the caption manually before publishing.");
          } else {
            toast("Clipboard access was blocked. Open the post and copy its caption manually.");
          }
        }
      }
      if (mediaButton) {
        if (!post.media_url) {
          if (mediaTab) mediaTab.close();
          toast("This post has no attached media file.");
        } else {
          const { data: signed, error: mediaError } = await client.storage.from("post-media").createSignedUrl(post.media_url, 300, { download: post.original_filename || true });
          if (mediaError || !signed?.signedUrl) {
            if (mediaTab) mediaTab.close();
            toast("Could not open media: " + (mediaError?.message || "signed link unavailable"));
          } else if (mediaTab) {
            mediaTab.location.href = signed.signedUrl;
            toast("Media opened in a new tab. On iPhone, use Share to save it to Photos or Files.");
          } else {
            toast("Your browser blocked the media tab. Allow pop-ups for PostPilot and try again.");
          }
        }
      }
      if (openButton) {
        toast(instagramTab ? "Instagram opened. Open the saved media, then paste your caption to publish manually." : "Your browser blocked Instagram. Allow pop-ups for PostPilot and try again.");
      }
      if (remindButton) {
        if ("Notification" in window && Notification.permission === "default") {
          try { await Notification.requestPermission(); } catch (_) {}
        }
        scheduleReminder(post.id, remindButton.dataset.remindAt);
      }
    });
  }

  function bindRealScheduling() {
    const form = document.querySelector("#schedule-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const button = form.querySelector('button[type="submit"]');
      const original = button?.innerHTML;
      if (button) { button.disabled = true; button.textContent = "Saving…"; }
      try {
        if (form.classList.contains("bulk-active")) await saveBulkPosts();
        else await saveSinglePost();
      } catch (error) {
        console.error(error);
        toast("Something went wrong while saving. Please try again.");
      } finally {
        if (button) { button.disabled = false; button.innerHTML = original; }
      }
    }, true);
  }


  // Shared, authenticated bridge for the Analytics page. The Edge Function owns all Meta tokens.
  window.postpilotFetchInsights = async (days = 30) => {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData?.session?.access_token) {
      throw new Error("Sign in to PostPilot to view Instagram analytics.");
    }
    const { data, error } = await client.functions.invoke("instagram-publishing", {
      body: { action: "insights", days: [7, 30, 90].includes(Number(days)) ? Number(days) : 30 }
    });
    if (error) {
      let message = error.message || "Could not load Instagram insights.";
      try {
        const response = error.context;
        if (response && typeof response.clone === "function") {
          const detail = await response.clone().json();
          if (detail?.error) message = detail.error;
        }
      } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };


  // Authenticated workspace bridge used by Settings, Team & Roles, and Social Inbox.
  const invokeInstagramAction = async (body) => {
    const { data, error } = await client.functions.invoke("instagram-publishing", { body });
    if (error) {
      let message = error.message || "Instagram request failed.";
      try {
        const response = error.context;
        if (response && typeof response.clone === "function") {
          const detail = await response.clone().json();
          if (detail?.error) message = detail.error;
        }
      } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const invokeLinkedInAction = async (body) => {
    if (!currentUser) throw new Error("Sign in to connect LinkedIn.");
    const { data, error } = await client.functions.invoke("linkedin-oauth", { body });
    if (error) {
      let detail = "";
      const context = error.context;
      try {
        if (context && typeof context.clone === "function") {
          const response = context.clone();
          const bodyText = await response.text();
          detail = "HTTP " + response.status + (bodyText ? " · " + bodyText.slice(0, 500) : "");
        } else if (context) {
          detail = String(context);
        }
      } catch (_) {}
      console.error("PostPilot LinkedIn function invocation failed", { action: body?.action, error, detail });
      throw new Error((error.message || "LinkedIn request failed.") + (detail ? " Details: " + detail : " (No HTTP response body available; check browser console/network.) );
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  window.postpilotWorkspace = {
    getUser: () => currentUser ? ({ id: currentUser.id, email: currentUser.email || "", fullName: currentUser.user_metadata?.full_name || "", workspaceName: currentUser.user_metadata?.workspace_name || "" }) : null,
    getProfile: async () => {
      if (!currentUser) throw new Error("Sign in to manage your workspace.");
      const [{ data: profile, error: profileError }, { data: settings, error: settingsError }] = await Promise.all([
        client.from("profiles").select("full_name,workspace_name").eq("id", currentUser.id).maybeSingle(),
        client.from("workspace_settings").select("timezone,reminder_preferences,publishing_preferences").eq("user_id", currentUser.id).maybeSingle()
      ]);
      if (profileError) throw profileError;
      if (settingsError) throw settingsError;
      return {
        fullName: profile?.full_name || currentUser.user_metadata?.full_name || "",
        workspaceName: profile?.workspace_name || currentUser.user_metadata?.workspace_name || "",
        email: currentUser.email || "",
        timezone: settings?.timezone || "Asia/Kolkata",
        reminders: settings?.reminder_preferences || { email: false, in_app: true, before_minutes: 30 },
        publishing: settings?.publishing_preferences || { require_approval: false, default_platform: "instagram" }
      };
    },
    saveProfile: async ({fullName, workspaceName}) => {
      if (!currentUser) throw new Error("Sign in to update your profile.");
      const name = String(fullName || "").trim(), workspace = String(workspaceName || "").trim();
      if (!name || !workspace) throw new Error("Name and workspace name are required.");
      const { error } = await client.from("profiles").upsert({ id: currentUser.id, full_name: name, workspace_name: workspace, updated_at: new Date().toISOString() });
      if (error) throw error;
      const { error: authError } = await client.auth.updateUser({ data: { full_name: name, workspace_name: workspace } });
      if (authError) throw authError;
      const profile = document.querySelector(".profile-copy");
      if (profile) profile.innerHTML = "<strong>" + escapeHtml(name) + "</strong><small>" + escapeHtml(workspace) + "</small>";
      const switcher = document.querySelector(".workspace-meta");
      if (switcher) switcher.innerHTML = "<strong>" + escapeHtml(workspace) + "</strong><small>Private workspace</small>";
      return true;
    },
    saveSettings: async ({timezone, reminders, publishing}) => {
      if (!currentUser) throw new Error("Sign in to save settings.");
      const { error } = await client.from("workspace_settings").upsert({
        user_id: currentUser.id,
        timezone: String(timezone || "Asia/Kolkata"),
        reminder_preferences: reminders || { email: false, in_app: true, before_minutes: 30 },
        publishing_preferences: publishing || { require_approval: false, default_platform: "instagram" },
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return true;
    },
    changePassword: async (password) => {
      if (!currentUser) throw new Error("Sign in to change your password.");
      if (String(password || "").length < 8) throw new Error("Use at least 8 characters for your new password.");
      const { error } = await client.auth.updateUser({ password: String(password) });
      if (error) throw error;
      return true;
    },
    signOut: async () => { const { error } = await client.auth.signOut(); if (error) throw error; currentUser = null; window.location.reload(); },
    getInvites: async () => {
      if (!currentUser) throw new Error("Sign in to manage your team.");
      const { data, error } = await client.from("workspace_invites").select("id,invite_email,role,status,created_at").eq("owner_id", currentUser.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    saveInvite: async ({email, role}) => {
      if (!currentUser) throw new Error("Sign in to invite teammates.");
      const inviteEmail = String(email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) throw new Error("Enter a valid email address.");
      if (inviteEmail === String(currentUser.email || "").toLowerCase()) throw new Error("You are already the workspace owner.");
      const { data, error } = await client.from("workspace_invites").upsert({
        owner_id: currentUser.id, invite_email: inviteEmail, role: ["admin","editor","viewer"].includes(role) ? role : "editor", status: "pending"
      }, { onConflict: "owner_id,invite_email" }).select("id,invite_email,role,status,created_at").single();
      if (error) throw error;
      return data;
    },
    updateInvite: async ({id, role, status}) => {
      if (!currentUser) throw new Error("Sign in to manage invitations.");
      const update = {};
      if (role && ["admin","editor","viewer"].includes(role)) update.role = role;
      if (status && ["pending","revoked"].includes(status)) update.status = status;
      const { error } = await client.from("workspace_invites").update(update).eq("id", id).eq("owner_id", currentUser.id);
      if (error) throw error;
      return true;
    },
    getLinkedInStatus: async () => invokeLinkedInAction({action:"status"}),
    connectLinkedIn: async () => { const result = await invokeLinkedInAction({action:"connect"}); if (!result.url) throw new Error("No LinkedIn authorization URL returned."); window.location.href = result.url; },
    disconnectLinkedIn: async () => invokeLinkedInAction({action:"disconnect"}),
    publishLinkedIn: async (text) => invokeLinkedInAction({action:"publish", text}),
    getInstagramStatus: async () => invokeInstagramAction({action:"status"}),
    connectInstagram: async () => {
      const result = await invokeInstagramAction({action:"connect-url"});
      if (!result.url) throw new Error("Instagram did not return a connection URL.");
      window.location.href = result.url;
    },
    disconnectInstagram: async () => invokeInstagramAction({action:"disconnect"}),
    getInbox: async () => invokeInstagramAction({action:"inbox"}),
    replyMessage: async (payload) => invokeInstagramAction({action:"reply-message", ...payload}),
    replyComment: async (payload) => invokeInstagramAction({action:"reply-comment", ...payload})
  };

  document.addEventListener("DOMContentLoaded", async () => {
    // Authentication UI is owned by auth-module.js; dashboard code only receives the authenticated user event.
    document.addEventListener("postpilot-auth-success", async (event) => {
      currentUser = event.detail?.user || (await ensureClient()).auth.getUser().then(({data}) => data.user).catch(() => null);
      if (currentUser) await finishSignIn();
    });
    /* Legacy auth UI launcher retained for password recovery/profile compatibility, not used by welcome-page buttons.
    window.postpilotOpenAuth = (signup = false) => {
      buildAuth();
      const switchButton = document.querySelector("#auth-switch");
      if (isSignup !== Boolean(signup)) switchButton?.click();
      const backdrop = document.querySelector("#auth-backdrop");
      if (backdrop) {
        backdrop.hidden = false;
        backdrop.style.removeProperty("display");
        backdrop.style.display = "grid";
        backdrop.setAttribute("aria-hidden", "false");
      }
      document.querySelector(signup ? "#auth-full-name" : "#auth-email")?.focus();
    };
    document.querySelector("#auth-login-open")?.addEventListener("click", (event) => {
      event.preventDefault();
      window.postpilotOpenAuth(false);
    });
    document.querySelector("#auth-signup-open")?.addEventListener("click", (event) => {
      event.preventDefault();
      window.postpilotOpenAuth(true);
    });
    */

    addBulkCaptionField();
    bindRealScheduling();
    bindPostActions();
    restoreReminders();
    const authClient = await ensureClient();
    const { data, error } = await authClient.auth.getSession();
    if (error) console.error("Supabase session error:", error);
    currentUser = data?.session?.user || null;
    if (currentUser) {
      await finishSignIn();
    } else {
      showGuestMode();
    }
    authClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery" || new URLSearchParams(window.location.search).get("reset_password") === "1") {
        activatePasswordRecovery();
        return;
      }
      currentUser = session?.user || null;
      if (currentUser) finishSignIn();
      else {
        showGuestMode();
      }
    });
  });
})();