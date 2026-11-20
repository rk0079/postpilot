import fs from "node:fs";

const configPath = new URL("../postpilot.config.json", import.meta.url);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const errors = [];
const isHttps = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

if (config.app?.name !== "PostPilot") errors.push("app.name must be PostPilot");
if (!Number.isInteger(config.app?.configVersion) || config.app.configVersion < 1) errors.push("configVersion must be a positive integer");
const projectRef = config.integrations?.supabase?.projectRef;
const supabaseUrl = config.integrations?.supabase?.url;
if (!projectRef || !/^[a-z0-9]{20,}$/.test(projectRef)) errors.push("Supabase projectRef is missing or malformed");
if (!isHttps(supabaseUrl)) errors.push("Supabase URL must be HTTPS");
if (projectRef && supabaseUrl && !supabaseUrl.includes(projectRef)) errors.push("Supabase URL and projectRef mismatch");
const productionUrl = config.environments?.production?.frontendUrl;
if (!isHttps(productionUrl)) errors.push("Production frontend URL must be HTTPS");
const callback = config.integrations?.linkedin?.oauthCallbackUrl;
if (!isHttps(callback) || !callback?.includes("/functions/v1/linkedin-oauth")) errors.push("LinkedIn callback must be the stable Supabase Edge Function HTTPS URL");
if (callback && supabaseUrl && !callback.startsWith(supabaseUrl + "/functions/v1/")) errors.push("OAuth callback host must match the configured Supabase project");
if (config.deployment?.productionRequiresApproval !== true) errors.push("Production deployments must require approval");

const serialized = JSON.stringify(config);
for (const pattern of [/sb_secret_[A-Za-z0-9_-]+/, /sk-[A-Za-z0-9_-]{20,}/, /access_token\s*[:=]\s*["'][^"']+/i, /client_secret\s*[:=]\s*["'][^"']+/i]) {
  if (pattern.test(serialized)) errors.push("Public config appears to contain a secret/token; remove it");
}

if (errors.length) {
  console.error("PostPilot config validation FAILED:");
  for (const error of errors) console.error(" - " + error);
  process.exit(1);
}
console.log("PostPilot config validation passed.");
