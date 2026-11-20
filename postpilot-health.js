// Read-only deployment health checks. This panel never changes auth or integration settings.
(() => {
  const CONFIG_URL = "./postpilot.config.json";
  const clean = (value) => String(value || "").replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
  const fetchTimeout = async (url, options = {}, ms = 9000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" }); }
    finally { clearTimeout(timeout); }
  };
  const addPanel = () => {
    if (document.querySelector("#postpilot-health-panel")) return document.querySelector("#postpilot-health-panel");
    const anchor = document.querySelector(".platform-selector");
    if (!anchor) return null;
    const panel = document.createElement("section");
    panel.className = "postpilot-health";
    panel.id = "postpilot-health-panel";
    panel.innerHTML = `
      <div class="postpilot-health-head">
        <div><div class="postpilot-health-title"><i class="health-dot" id="postpilot-health-dot"></i><span>Deployment health</span></div><div class="postpilot-health-subtitle">Read-only checks for frontend, Supabase and OAuth endpoint configuration.</div></div>
        <button class="postpilot-health-check" type="button" id="postpilot-health-run">Run checks</button>
      </div>
      <div class="postpilot-health-results" id="postpilot-health-results">
        <div class="postpilot-health-item"><strong>Configuration</strong><span id="postpilot-health-config">Waiting for check…</span></div>
        <div class="postpilot-health-item"><strong>Supabase Auth</strong><span id="postpilot-health-auth">Waiting for check…</span></div>
        <div class="postpilot-health-item"><strong>LinkedIn function</strong><span id="postpilot-health-linkedin">Waiting for check…</span></div>
      </div>
      <div class="postpilot-health-foot" id="postpilot-health-foot">No settings are changed by these checks.</div>`;
    anchor.insertAdjacentElement("afterend", panel);
    return panel;
  };
  const setResult = (id, text, state) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.dataset.state = state || "unknown";
  };
  const check = async () => {
    const button = document.querySelector("#postpilot-health-run");
    const dot = document.querySelector("#postpilot-health-dot");
    const foot = document.querySelector("#postpilot-health-foot");
    if (button) { button.disabled = true; button.textContent = "Checking…"; }
    if (dot) dot.className = "health-dot";
    ["postpilot-health-config","postpilot-health-auth","postpilot-health-linkedin"].forEach(id=>setResult(id,"Checking…","unknown"));
    let states=[];
    try {
      const response = await fetchTimeout(CONFIG_URL, {}, 9000);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const config = await response.json();
      const ref = config?.integrations?.supabase?.projectRef;
      const supabaseUrl = config?.integrations?.supabase?.url;
      const linkedinCallback = config?.integrations?.linkedin?.oauthCallbackUrl;
      const callbackValid = linkedinCallback === supabaseUrl + "/functions/v1/linkedin-oauth";
      const urlValid = new URL(supabaseUrl).hostname.startsWith(ref + ".");
      const host = window.location.hostname;
      const preview = host.endsWith(".vercel.app") && host !== new URL(config.environments.production.frontendUrl).hostname;
      const hostState = preview ? "Preview deployment · " + host : "Production/custom host · " + host;
      const ok = callbackValid && urlValid && config.deployment?.productionRequiresApproval === true;
      setResult("postpilot-health-config", ok ? "Config loaded · project/callback match · " + hostState : "Config mismatch detected. Check project ref, callback, or production approval setting.", ok ? "ok" : "fail");
      states.push(ok);
      window.postpilotRuntimeConfig = config;
    } catch (error) {
      setResult("postpilot-health-config", "Failed to load/validate config: " + (error.message || "unknown error"), "fail");
      states.push(false);
    }
    try {
      const authUrl = window.postpilotRuntimeConfig?.integrations?.supabase?.url;
      if (!authUrl) throw new Error("Supabase URL unavailable");
      const response = await fetchTimeout(authUrl + "/auth/v1/settings", {}, 9000);
      if (response.ok) {
        setResult("postpilot-health-auth", "Reachable · Auth settings returned HTTP " + response.status, "ok");
        states.push(true);
      } else {
        setResult("postpilot-health-auth", "Endpoint responded HTTP " + response.status, "warn");
        states.push(false);
      }
    } catch (error) {
      setResult("postpilot-health-auth", "Connection failed: " + (error.message || "timeout or network error"), "fail");
      states.push(false);
    }
    try {
      const callback = window.postpilotRuntimeConfig?.integrations?.linkedin?.oauthCallbackUrl;
      if (!callback) throw new Error("Callback URL unavailable");
      const response = await fetchTimeout(callback, { method: "OPTIONS" }, 9000);
      if (response.ok) {
        setResult("postpilot-health-linkedin", "Edge Function endpoint responds to OPTIONS · HTTP " + response.status + " (OAuth not verified)", "ok");
        states.push(true);
      } else {
        setResult("postpilot-health-linkedin", "Endpoint responds HTTP " + response.status + " (OAuth not verified)", "warn");
        states.push(false);
      }
    } catch (error) {
      setResult("postpilot-health-linkedin", "Reachability failed: " + (error.message || "timeout/CORS/network error"), "fail");
      states.push(false);
    }
    const good = states.every(Boolean);
    if (dot) dot.className = "health-dot " + (good ? "ok" : "warn");
    if (foot) foot.textContent = "Checked " + new Date().toLocaleTimeString() + " · Read-only. Green endpoint checks do not prove OAuth login/publishing works.";
    if (button) { button.disabled = false; button.textContent = "Run checks again"; }
  };
  document.addEventListener("DOMContentLoaded", () => {
    addPanel();
    document.querySelector("#postpilot-health-run")?.addEventListener("click", check);
    check();
  });
})();