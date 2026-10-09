(() => {
  const SUPABASE_URL = "https://jzwnjzagmijikbhxtrcn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5pGDVM-9-TKyAOKTvQHWKw_j0ZKTy4p";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  let currentUser = null;
  let isSignup = false;
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
          <label class="auth-field" for="auth-email">Email address</label>
          <input class="auth-input" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required>
          <label class="auth-field" for="auth-password">Password</label>
          <input class="auth-input" id="auth-password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters" required>
          <div class="auth-error" id="auth-error" role="alert"></div>
          <button class="auth-submit" id="auth-submit" type="submit">Sign in</button>
        </form>
        <div class="auth-switch"><span id="auth-switch-copy">New to PostPilot?</span> <button id="auth-switch" type="button">Create an account</button></div>
        <div class="auth-note">Your content is private to your account. Instagram publishing is not connected yet.</div>
      </section>`;
    document.body.appendChild(backdrop);

    document.querySelector("#auth-switch").addEventListener("click", () => {
      isSignup = !isSignup;
      document.querySelector("#auth-title").textContent = isSignup ? "Create your workspace." : "Your content, in sync.";
      document.querySelector("#auth-description").textContent = isSignup
        ? "Create an account to start saving your posts and schedule."
        : "Sign in to save your drafts, captions, and publishing calendar across devices.";
      document.querySelector("#auth-submit").textContent = isSignup ? "Create account" : "Sign in";
      document.querySelector("#auth-switch-copy").textContent = isSignup ? "Already have an account?" : "New to PostPilot?";
      document.querySelector("#auth-switch").textContent = isSignup ? "Sign in" : "Create an account";
      document.querySelector("#auth-password").autocomplete = isSignup ? "new-password" : "current-password";
      showAuthError("");
    });

    document.querySelector("#auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      const submit = document.querySelector("#auth-submit");
      submit.disabled = true;
      submit.textContent = isSignup ? "Creating account…" : "Signing in…";
      showAuthError("");
      try {
        const result = isSignup
          ? await client.auth.signUp({ email, password })
          : await client.auth.signInWithPassword({ email, password });
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

  function showAuthError(message) {
    const el = document.querySelector("#auth-error");
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? "block" : "none";
  }

  async function finishSignIn() {
    const backdrop = document.querySelector("#auth-backdrop");
    if (backdrop) backdrop.style.display = "none";
    const profile = document.querySelector(".profile-copy");
    if (profile) {
      profile.innerHTML = "<strong>" + escapeHtml(currentUser.email) + "</strong><small>Signed in</small>";
    }
    const workspace = document.querySelector(".workspace-meta");
    if (workspace) workspace.innerHTML = "<strong>My workspace</strong><small>Connected to Supabase</small>";
    await loadPosts();
    toast("Connected to Supabase — your posts can now be saved.");
  }

  async function loadPosts() {
    if (!currentUser) return;
    const { data, error } = await client.from("posts")
      .select("id,title,content_type,caption,status,scheduled_at,created_at")
      .eq("user_id", currentUser.id)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) {
      console.error("PostPilot load error:", error);
      toast("Signed in, but posts could not load: " + error.message);
      return;
    }
    const scheduled = (data || []).filter((post) => post.status === "scheduled").length;
    const count = document.querySelector("#scheduled-count");
    if (count) count.textContent = String(scheduled);
    const metric = document.querySelector(".metric-card.accent-lilac .metric-value-row strong");
    if (metric) metric.textContent = String(scheduled);
    const rows = document.querySelector(".content-table");
    if (rows) {
      const header = rows.querySelector(".table-head");
      rows.innerHTML = "";
      if (header) rows.appendChild(header);
      if (!data || data.length === 0) {
        const empty = document.createElement("div");
        empty.className = "content-row";
        empty.innerHTML = '<div class="content-name"><span><strong>No saved content yet</strong><small>Create your first post to see it here.</small></span></div>';
        rows.appendChild(empty);
      } else {
        data.slice(0, 8).forEach((post) => {
          const date = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : "No date set";
          const statusClass = post.status === "published" ? "status-published" : post.status === "draft" ? "status-draft" : "status-scheduled";
          const row = document.createElement("div");
          row.className = "content-row";
          row.innerHTML = `
            <div class="content-name"><div class="table-thumb thumb-portrait"></div><span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml((post.caption || "").slice(0, 70) || "No caption added")}</small></span></div>
            <span class="type-tag">${escapeHtml(post.content_type)}</span>
            <span class="status-tag ${statusClass}"><i></i> ${escapeHtml(post.status)}</span>
            <span class="row-date">${escapeHtml(date)}</span><button class="row-menu" type="button" aria-label="Post options">···</button>`;
          rows.appendChild(row);
        });
      }
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
    const scheduledAt = getScheduledDate("#schedule-date", "#schedule-time", 60);
    const status = new Date(scheduledAt).getTime() > Date.now() ? "scheduled" : "draft";
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
      hashtags: (caption.match(/#[\\p{L}\\p{N}_]+/gu) || []),
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

  async function saveBulkPosts() {
    if (!currentUser) {
      buildAuth();
      document.querySelector("#auth-backdrop").style.display = "grid";
      toast("Sign in before saving content.");
      return;
    }
    const files = Array.from(document.querySelector("#bulk-file-input")?.files || []);
    if (!files.length) {
      toast("Choose one or more files for bulk scheduling first.");
      return;
    }
    if (files.length > 50) {
      toast("Bulk scheduling supports up to 50 files at a time.");
      return;
    }
    const start = document.querySelector("#bulk-start-date")?.value || new Date().toISOString().slice(0, 10);
    const time = document.querySelector("#bulk-window")?.value || "19:00";
    const batchId = crypto.randomUUID();
    const uploadedPaths = [];
    const rows = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "upload";
      const path = currentUser.id + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await client.storage.from("post-media").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream"
      });
      if (uploadError) {
        if (uploadedPaths.length) await client.storage.from("post-media").remove(uploadedPaths);
        toast("Bulk media upload failed for " + file.name + ": " + uploadError.message);
        return;
      }
      uploadedPaths.push(path);
      const scheduled = new Date(start + "T" + time + ":00");
      scheduled.setDate(scheduled.getDate() + index);
      const isVideo = file.type.startsWith("video/");
      rows.push({
        user_id: currentUser.id,
        title: file.name.replace(/\\.[^.]+$/, "") || "Untitled content",
        content_type: isVideo ? "reel" : "photo",
        caption: "",
        media_url: path,
        original_filename: file.name,
        status: "scheduled",
        scheduled_at: scheduled.toISOString(),
        batch_id: batchId
      });
    }
    const { error } = await client.from("posts").insert(rows);
    if (error) {
      await client.storage.from("post-media").remove(uploadedPaths);
      toast("Bulk save failed: " + error.message);
      return;
    }
    document.querySelector("#modal-backdrop").hidden = true;
    document.body.style.overflow = "";
    document.querySelector("#schedule-form").reset();
    document.querySelector("#schedule-form").classList.remove("bulk-active");
    toast(files.length + " posts and media files saved to your calendar.");
    await loadPosts();
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

  document.addEventListener("DOMContentLoaded", async () => {
    buildAuth();
    bindRealScheduling();
    const { data, error } = await client.auth.getSession();
    if (error) console.error("Supabase session error:", error);
    currentUser = data?.session?.user || null;
    if (currentUser) {
      await finishSignIn();
    } else {
      document.querySelector("#auth-backdrop").style.display = "grid";
    }
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      if (currentUser) finishSignIn();
      else {
        const backdrop = document.querySelector("#auth-backdrop");
        if (backdrop) backdrop.style.display = "grid";
      }
    });
  });
})();