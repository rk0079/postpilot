// PostPilot public runtime configuration loader.
(async () => {
  try {
    const response = await fetch("./postpilot.config.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Config request failed: HTTP " + response.status);
    const config = await response.json();
    window.postpilotRuntimeConfig = Object.freeze(config);
    window.dispatchEvent(new CustomEvent("postpilot:config-ready", { detail: config }));
  } catch (error) {
    console.error("[PostPilot config] Could not load centralized configuration:", error);
    window.postpilotRuntimeConfigError = error;
    window.dispatchEvent(new CustomEvent("postpilot:config-error", { detail: error }));
  }
})();