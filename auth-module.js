/* PostPilot Authentication Module — isolated from dashboard features.
   Only this module owns the welcome login/signup UI and credential submission. */
(() => {
  const URL = "https://jzwnjzagmijikbhxtrcn.supabase.co";
  const KEY = "sb_publishable_5pGDVM-9-TKyAOKTvQHWKw_j0ZKTy4p";
  let authClient = null, signupMode = false;
  const getClient = () => authClient || (authClient = window.supabase.createClient(URL, KEY, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }));
  const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  function ensureUI() {
    if (document.querySelector("#pp-auth-overlay")) return;
    const root = document.createElement("div");
    root.id = "pp-auth-overlay";
    root.className = "pp-auth-overlay";
    root.hidden = true;
    root.innerHTML = `
      <section class="pp-auth-card" role="dialog" aria-modal="true" aria-labelledby="pp-auth-title">
        <button class="pp-auth-close" type="button" aria-label="Close" id="pp-auth-close">×</button>
        <div class="pp-auth-brand"><span>P</span> postpilot</div>
        <div class="pp-auth-eyebrow">YOUR PRIVATE CONTENT WORKSPACE</div>
        <h2 id="pp-auth-title">Welcome back.</h2>
        <p id="pp-auth-subtitle">Sign in to continue to your dashboard.</p>
        <form id="pp-auth-form" novalidate>
          <div id="pp-auth-profile-fields" hidden>
            <label for="pp-auth-name">Full name</label><input id="pp-auth-name" autocomplete="name" minlength="2" placeholder="Your full name"/>
            <label for="pp-auth-workspace">Business or workspace</label><input id="pp-auth-workspace" autocomplete="organization" minlength="2" placeholder="Your brand or business"/>
          </div>
          <label for="pp-auth-email">Email address</label><input id="pp-auth-email" type="email" autocomplete="email" required placeholder="you@example.com"/>
          <label for="pp-auth-password">Password</label><input id="pp-auth-password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters"/>
          <div class="pp-auth-error" id="pp-auth-error" role="alert" aria-live="polite"></div>
          <button class="pp-auth-submit" id="pp-auth-submit" type="submit">Sign in</button>
        </form>
        <div class="pp-auth-switch"><span id="pp-auth-switch-text">New to PostPilot?</span> <button type="button" id="pp-auth-switch">Create account</button></div>
        <p class="pp-auth-privacy">Your workspace and saved content are tied to your account.</p>
      </section>`;
    document.body.appendChild(root);
    const setMode = (signup) => {
      signupMode = !!signup;
      root.querySelector("#pp-auth-title").textContent = signupMode ? "Create your workspace." : "Welcome back.";
      root.querySelector("#pp-auth-subtitle").textContent = signupMode ? "Create a private workspace for your content." : "Sign in to continue to your dashboard.";
      root.querySelector("#pp-auth-profile-fields").hidden = !signupMode;
      root.querySelector("#pp-auth-name").required = signupMode;
      root.querySelector("#pp-auth-workspace").required = signupMode;
      root.querySelector("#pp-auth-password").autocomplete = signupMode ? "new-password" : "current-password";
      root.querySelector("#pp-auth-submit").textContent = signupMode ? "Create account" : "Sign in";
      root.querySelector("#pp-auth-switch-text").textContent = signupMode ? "Already have an account?" : "New to PostPilot?";
      root.querySelector("#pp-auth-switch").textContent = signupMode ? "Sign in" : "Create account";
      root.querySelector("#pp-auth-error").textContent = "";
    };
    root.querySelector("#pp-auth-switch").addEventListener("click", () => setMode(!signupMode));
    root.querySelector("#pp-auth-close").addEventListener("click", () => { root.hidden = true; });
    root.addEventListener("click", e => { if (e.target === root) root.hidden = true; });
    root.querySelector("#pp-auth-form").addEventListener("submit", async e => {
      e.preventDefault();
      const email = root.querySelector("#pp-auth-email").value.trim();
      const password = root.querySelector("#pp-auth-password").value;
      const fullName = root.querySelector("#pp-auth-name").value.trim();
      const workspaceName = root.querySelector("#pp-auth-workspace").value.trim();
      const btn = root.querySelector("#pp-auth-submit"), error = root.querySelector("#pp-auth-error");
      btn.disabled = true; btn.textContent = signupMode ? "Creating account…" : "Signing in…"; error.textContent = "";
      try {
        const api = getClient();
        const result = signupMode
          ? await api.auth.signUp({ email, password, options: { data: { full_name: fullName, workspace_name: workspaceName } } })
          : await api.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (signupMode && !result.data.session) {
          error.textContent = "Account created. Confirm your email, then return here to sign in.";
          return;
        }
        root.hidden = true;
        document.dispatchEvent(new CustomEvent("postpilot-auth-success", { detail: { user: result.data.user || result.data.session?.user || null } }));
      } catch (err) {
        error.textContent = err?.message || "Could not authenticate. Please try again.";
      } finally {
        btn.disabled = false; btn.textContent = signupMode ? "Create account" : "Sign in";
      }
    });
    setMode(false);
  }
  window.postpilotOpenAuth = (signup = false) => {
    ensureUI();
    const root = document.querySelector("#pp-auth-overlay");
    const switcher = root.querySelector("#pp-auth-switch");
    if (signupMode !== !!signup) switcher.click();
    root.hidden = false;
    root.querySelector(signup ? "#pp-auth-name" : "#pp-auth-email").focus();
  };
  document.addEventListener("DOMContentLoaded", () => {
    ensureUI();
    document.querySelector("#landing-login")?.addEventListener("click", e => { e.preventDefault(); window.postpilotOpenAuth(false); });
    document.querySelector("#landing-signup")?.addEventListener("click", e => { e.preventDefault(); window.postpilotOpenAuth(true); });
    document.querySelector("#auth-login-open")?.addEventListener("click", e => { e.preventDefault(); window.postpilotOpenAuth(false); });
    document.querySelector("#auth-signup-open")?.addEventListener("click", e => { e.preventDefault(); window.postpilotOpenAuth(true); });
  });
})();