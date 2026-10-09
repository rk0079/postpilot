import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://postpilot-ebon-nu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const graphVersion = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const redirectUri = Deno.env.get("META_REDIRECT_URI") ?? `${supabaseUrl}/functions/v1/instagram-publishing`;

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function base64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}
async function encryptToken(token: string) {
  const raw = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured");
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
async function decryptToken(value: string) {
  const raw = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured");
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  const [ivPart, cipherPart] = value.split(".");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Uint8Array.from(atob(ivPart), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(cipherPart), c => c.charCodeAt(0)));
  return new TextDecoder().decode(clear);
}
async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sign in to PostPilot first.");
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Your PostPilot session is invalid or expired.");
  return data.user;
}
async function graph(path: string, params: Record<string, string>, method = "GET") {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  const options: RequestInit = { method };
  if (method === "GET") Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  else { options.headers = { "Content-Type": "application/x-www-form-urlencoded" }; options.body = new URLSearchParams(params); }
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `Meta API returned HTTP ${response.status}`);
  return data;
}
async function callback(req: Request, url: URL) {
  if (url.searchParams.get("error")) return Response.redirect(`${Deno.env.get("SITE_URL")}/?instagram_error=authorization_denied`, 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return json({ error: "Missing OAuth code or state." }, 400);
  const stateHash = await sha256(state);
  const { data: stateRow } = await admin.from("instagram_oauth_states").select("user_id,expires_at").eq("state_hash", stateHash).maybeSingle();
  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) return json({ error: "OAuth state is invalid or expired. Start connecting again." }, 400);
  await admin.from("instagram_oauth_states").delete().eq("state_hash", stateHash);

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appId || !appSecret) return json({ error: "Meta app credentials are not configured on the server." }, 503);
  const short = await graph("oauth/access_token", { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
  const long = await graph("oauth/access_token", { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token });
  const pages = await graph("me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", access_token: long.access_token });
  const page = (pages.data ?? []).find((p: any) => p.instagram_business_account?.id && p.access_token);
  if (!page) return Response.redirect(`${Deno.env.get("SITE_URL")}/?instagram_error=no_business_instagram_linked`, 302);
  const encrypted = await encryptToken(page.access_token);
  const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString() : null;
  const { error } = await admin.from("instagram_connections").upsert({
    user_id: stateRow.user_id, ig_user_id: page.instagram_business_account.id,
    ig_username: page.instagram_business_account.username ?? null, page_id: page.id,
    token_ciphertext: encrypted, token_expires_at: expiresAt, updated_at: new Date().toISOString()
  });
  if (error) return json({ error: "Could not securely save Instagram connection." }, 500);
  return Response.redirect(`${Deno.env.get("SITE_URL")}/?instagram_connected=1`, 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // Meta redirects the OAuth callback to this same function URL with ?code=...&state=...
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) return await callback(req, url);
  if (req.method !== "POST") return json({ error: "Use POST for PostPilot actions." }, 405);
  try {
    const user = await requireUser(req);
    const body = await req.json();
    if (body.action === "connect-url") {
      const appId = Deno.env.get("META_APP_ID");
      if (!appId) return json({ error: "Meta app setup is not complete. Configure META_APP_ID and META_APP_SECRET in Supabase secrets." }, 503);
      const state = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      const { error } = await admin.from("instagram_oauth_states").insert({ state_hash: await sha256(state), user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      if (error) throw error;
      const authorize = new URL("https://www.facebook.com/v23.0/dialog/oauth");
      authorize.searchParams.set("client_id", appId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement");
      return json({ url: authorize.toString() });
    }
    if (body.action === "status") {
      const { data } = await admin.from("instagram_connections").select("ig_username,connected_at,token_expires_at").eq("user_id", user.id).maybeSingle();
      return json({ connected: Boolean(data), username: data?.ig_username ?? null, connectedAt: data?.connected_at ?? null, tokenExpiresAt: data?.token_expires_at ?? null });
    }
    if (body.action === "approve-publish") {
      if (!body.postId) return json({ error: "postId is required." }, 400);
      const { data: post, error: postError } = await admin.from("posts").select("*").eq("id", body.postId).eq("user_id", user.id).maybeSingle();
      if (postError || !post) return json({ error: "Post not found." }, 404);
      if (!["scheduled","draft"].includes(post.status)) return json({ error: "Only drafts or scheduled posts can be approved." }, 409);
      if (!post.media_url) return json({ error: "Attach media before approving this post." }, 400);
      const { data: connection } = await admin.from("instagram_connections").select("*").eq("user_id", user.id).maybeSingle();
      if (!connection) return json({ error: "Connect a professional Instagram Business account first." }, 409);
      const token = await decryptToken(connection.token_ciphertext);
      const { data: signed, error: signedError } = await admin.storage.from("post-media").createSignedUrl(post.media_url, 3600);
      if (signedError || !signed?.signedUrl) return json({ error: "Could not create a media URL for Meta." }, 500);
      const mediaUrl = signed.signedUrl;
      const type = String(post.content_type).toLowerCase();
      const caption = [post.caption ?? "", Array.isArray(post.hashtags) ? post.hashtags.map((t: string) => "#" + String(t).replace(/^#+/,"")).join(" ") : ""].filter(Boolean).join("\n\n");
      const params: Record<string,string> = { caption, access_token: token };
      if (type === "reel" || type === "video") { params.media_type = "REELS"; params.video_url = mediaUrl; }
      else if (type === "carousel") return json({ error: "Carousel publishing needs multiple ordered media assets. This saved post has one media file; use a multi-item carousel workflow before approval." }, 400);
      else params.image_url = mediaUrl;
      await admin.from("posts").update({ approval_status: "publishing", publish_error: null }).eq("id", post.id).eq("user_id", user.id);
      try {
        const container = await graph(`${connection.ig_user_id}/media`, params, "POST");
        if (!container.id) throw new Error("Meta did not return a media container ID.");
        // Reels and videos need processing time. This initial implementation fails safely rather than publishing before ready.
        if (params.media_type === "REELS") {
          const deadline = Date.now() + 90000;
          let ready = false;
          while (Date.now() < deadline) {
            const info = await graph(String(container.id), { fields: "status_code,status", access_token: token });
            if (info.status_code === "FINISHED") { ready = true; break; }
            if (info.status_code === "ERROR" || info.status_code === "EXPIRED") throw new Error("Meta could not process the video. Check its format and try again.");
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          if (!ready) throw new Error("Meta is still processing this video. Try approving it again in a moment.");
        }
        const published = await graph(`${connection.ig_user_id}/media_publish`, { creation_id: String(container.id), access_token: token }, "POST");
        await admin.from("posts").update({ status: "published", approval_status: "published", instagram_media_id: String(published.id), published_at: new Date().toISOString(), publish_error: null }).eq("id", post.id).eq("user_id", user.id);
        await admin.from("instagram_publish_logs").insert({ user_id: user.id, post_id: post.id, action: "approve-publish", outcome: "success", meta_media_id: String(published.id), message: "Published through Meta Instagram API." });
        return json({ published: true, mediaId: String(published.id) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Publishing failed.";
        await admin.from("posts").update({ approval_status: "failed", publish_error: message }).eq("id", post.id).eq("user_id", user.id);
        await admin.from("instagram_publish_logs").insert({ user_id: user.id, post_id: post.id, action: "approve-publish", outcome: "failed", message });
        return json({ error: message, published: false }, 502);
      }
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 400);
  }
});
