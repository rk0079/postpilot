(() => {
  const SUPABASE_URL = "https://jzwnjzagmijikbhxtrcn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5pGDVM-9-TKyAOKTvQHWKw_j0ZKTy4p";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  let currentUser = null;
  let isSignup = false;
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
      profile.innerHTML = "<strong>" + escapeHtml(currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || (currentUser.email || "My account").split("@")[0]) + "</strong><small>Signed in</small>";
    }
    const workspace = document.querySelector(".workspace-meta");
    if (workspace) workspace.innerHTML = "<strong>My workspace</strong><small>Connected to Supabase</small>";
    await loadPosts();
    toast("Connected to Supabase — your posts can now be saved.");
  }

  async function loadPosts() {
    if (!currentUser) return;
    const { data, error } = await client.from("posts")
      .select("id,title,content_type,caption,status,scheduled_at,created_at,media_url")
      .eq("user_id", currentUser.id)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) {
      console.error("PostPilot load error:", error);
      toast("Signed in, but posts could not load: " + error.message);
      return;
    }
    const posts = data || [];
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
            const date = post.scheduled_at
              ? new Date(post.scheduled_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
              : "Draft · no date set";
            const title = document.createElement("strong");
            title.textContent = post.title || "Untitled content";
            const details = document.createElement("span");
            details.textContent = date + " · " + (post.content_type || "post") + " · " + post.status;
            item.append(title, details);
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
          const statusClass = post.status === "published" ? "status-published" : post.status === "draft" ? "status-draft" : "status-scheduled";
          const row = document.createElement("div");
          row.className = "content-row";
          row.innerHTML = `
            <div class="content-name"><div class="table-thumb thumb-portrait"></div><span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml((post.caption || "").slice(0, 70) || "No caption added")}</small></span></div>
            <span class="type-tag">${escapeHtml(post.content_type)}</span>
            <span class="status-tag ${statusClass}"><i></i> ${escapeHtml(post.status)}</span>
            <span class="row-date">${escapeHtml(date)}</span><div class="post-actions"><button class="row-menu" type="button" data-copy-caption="${escapeHtml(post.id)}" aria-label="Copy caption">Copy caption</button><button class="row-menu" type="button" data-open-instagram="${escapeHtml(post.id)}">Open Instagram</button>${post.scheduled_at && post.status !== "published" ? `<button class="row-menu" type="button" data-remind-post="${escapeHtml(post.id)}" data-remind-at="${escapeHtml(post.scheduled_at)}">Remind me</button>` : ""}</div>`;
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
    const bulkCaption = document.querySelector("#bulk-caption")?.value.trim() || "";
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
        caption: bulkCaption,
        hashtags: (bulkCaption.match(/#[\\p{L}\\p{N}_]+/gu) || []),
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

  function addBulkCaptionField() {
    const panel = document.querySelector(".bulk-panel");
    if (!panel || document.querySelector("#bulk-caption")) return;
    const wrap = document.createElement("div");
    wrap.className = "bulk-caption-wrap";
    wrap.innerHTML = '<label class="form-label" for="bulk-caption">Caption and hashtags for this batch <span class="optional">Optional</span></label><textarea class="form-input caption-input" id="bulk-caption" placeholder="One caption will be added to each selected post. Add your hashtags here too."></textarea><p class="bulk-caption-help">You can edit individual captions later. PostPilot will not publish automatically.</p>';
    const header = panel.querySelector(".bulk-panel-header");
    if (header) header.insertAdjacentElement("afterend", wrap);
    else panel.prepend(wrap);
  }

  function scheduleReminder(postId, isoDate) {
    const when = new Date(isoDate).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) {
      toast("Choose a future scheduled time to set a reminder.");
      return;
    }
    const key = "postpilot-reminder:" + postId;
    try { localStorage.setItem(key, String(when)); } catch (_) {}
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
            body: "Your scheduled content is ready. Open Instagram to publish it manually.",
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

  function bindPostActions() {
    document.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-copy-caption]");
      const openButton = event.target.closest("[data-open-instagram]");
      const remindButton = event.target.closest("[data-remind-post]");
      if (!copyButton && !openButton && !remindButton) return;
      if (!currentUser) {
        toast("Sign in to manage your saved posts.");
        return;
      }
      const postId = (copyButton || openButton || remindButton).dataset.copyCaption ||
        (copyButton || openButton || remindButton).dataset.openInstagram ||
        (copyButton || openButton || remindButton).dataset.remindPost;
      const { data: post, error } = await client.from("posts")
        .select("id,title,caption,hashtags,scheduled_at")
        .eq("id", postId).eq("user_id", currentUser.id).maybeSingle();
      if (error || !post) {
        toast("Could not load that post. Please refresh and try again.");
        return;
      }
      if (copyButton) {
        const tags = Array.isArray(post.hashtags) ? post.hashtags.map((tag) => "#" + String(tag).replace(/^#+/, "")).join(" ") : "";
        const text = [post.caption || "", tags].filter(Boolean).join("\n\n");
        try {
          await navigator.clipboard.writeText(text);
          toast("Caption copied. Paste it into Instagram when you post.");
        } catch (_) {
          toast("Clipboard access was blocked. Open the post and copy its caption manually.");
        }
      }
      if (openButton) {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        toast("Instagram opened. Choose your media and paste the copied caption to publish manually.");
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

  document.addEventListener("DOMContentLoaded", async () => {
    buildAuth();
    addBulkCaptionField();
    bindRealScheduling();
    bindPostActions();
    restoreReminders();
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