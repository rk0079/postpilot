
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const graphVersion = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const redirectUri =
  Deno.env.get("META_REDIRECT_URI") ??
  `${supabaseUrl}/functions/v1/instagram-publishing`;

async function sha256(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function encryptToken(token: string) {
  const raw = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured");

  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );

  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

async function decryptToken(value: string) {
  const raw = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured");

  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error("Invalid token encryption key configuration");
  }

  const [ivPart, cipherPart] = value.split(".");
  if (!ivPart || !cipherPart) throw new Error("Stored Instagram token is invalid");

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const clear = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(atob(ivPart), (c) => c.charCodeAt(0)),
    },
    key,
    Uint8Array.from(atob(cipherPart), (c) => c.charCodeAt(0)),
  );

  return new TextDecoder().decode(clear);
}


async function maybeRefreshConnection(connection: any) {
  if (!connection?.token_ciphertext || !connection?.token_expires_at) return connection;
  const expiry = new Date(connection.token_expires_at).getTime();
  // Refresh only when the token is nearing expiry and is old enough for Meta's refresh endpoint.
  if (expiry - Date.now() > 10 * 24 * 60 * 60 * 1000) return connection;
  if (Date.now() - new Date(connection.connected_at).getTime() < 25 * 60 * 60 * 1000) return connection;

  const currentToken = await decryptToken(connection.token_ciphertext);
  const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
  refreshUrl.search = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: currentToken,
  }).toString();
  const response = await fetch(refreshUrl);
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message || "Instagram token refresh failed. Reconnect your Instagram account.");
  }

  const encrypted = await encryptToken(payload.access_token);
  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : connection.token_expires_at;
  const { data, error } = await admin.from("instagram_connections")
    .update({
      token_ciphertext: encrypted,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", connection.user_id)
    .select("*")
    .single();
  if (error || !data) throw new Error("Instagram token refreshed but secure storage could not be updated.");
  return data;
}

async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    throw new Error("Sign in to PostPilot first.");
  }

  const userClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    },
  );

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new Error("Your PostPilot session is invalid or expired.");
  }

  return data.user;
}

/**
 * Call Instagram's API and retain useful error information.
 * Never log or return access tokens.
 */
async function graph(
  path: string,
  params: Record<string, string>,
  method = "GET",
) {
  const url = new URL(`https://graph.instagram.com/${graphVersion}/${path}`);
  const options: RequestInit = { method };

  if (method === "GET") {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  } else {
    options.headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    options.body = new URLSearchParams(params);
  }

  const response = await fetch(url, options);
  const raw = await response.text();

  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw: raw.slice(0, 500) };
  }

  if (!response.ok || data.error) {
    const e = data.error ?? data;
    const detail = [
      e.message,
      e.type ? `type=${e.type}` : "",
      e.code != null ? `code=${e.code}` : "",
      e.error_subcode != null ? `subcode=${e.error_subcode}` : "",
      e.fbtrace_id ? `trace=${e.fbtrace_id}` : "",
    ].filter(Boolean).join(" | ");

    throw new Error(
      detail || `Instagram API returned HTTP ${response.status}: ${raw.slice(0, 300)}`,
    );
  }

  return data;
}

async function callback(url: URL) {
  const siteUrl = Deno.env.get("SITE_URL") ??
    "https://postpilot-ebon-nu.vercel.app";

  if (url.searchParams.get("error")) {
    return Response.redirect(`${siteUrl}/?instagram_error=authorization_denied`, 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return json({ error: "Missing OAuth code or state." }, 400);
  }

  const stateHash = await sha256(state);
  const { data: stateRow } = await admin
    .from("instagram_oauth_states")
    .select("user_id,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return json(
      { error: "OAuth state is invalid or expired. Start connecting again." },
      400,
    );
  }

  await admin.from("instagram_oauth_states")
    .delete()
    .eq("state_hash", stateHash);

  const appId = Deno.env.get("INSTAGRAM_APP_ID");
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

  if (!appId || !appSecret) {
    return json({
      error: "Instagram app credentials are not configured in Supabase secrets.",
    }, 503);
  }

  const tokenResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    },
  );

  const short = await tokenResponse.json();

  if (!tokenResponse.ok || short.error_message || !short.access_token) {
    return json({
      error: short.error_message ?? short.error?.message ??
        "Instagram token exchange failed.",
    }, 400);
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: short.access_token,
  }).toString();

  const longResponse = await fetch(longUrl);
  const long = await longResponse.json();

  if (!longResponse.ok || !long.access_token) {
    return json({
      error: long.error?.message ??
        "Instagram long-lived token exchange failed.",
    }, 400);
  }

  const profile = await graph("me", {
    fields: "user_id,username",
    access_token: long.access_token,
  });

  const igUserId = String(profile.user_id ?? short.user_id ?? "");
  if (!igUserId) {
    return json({ error: "Instagram did not return an account ID." }, 400);
  }

  const encrypted = await encryptToken(long.access_token);
  const expiresAt = long.expires_in
    ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString()
    : null;

  const { error } = await admin.from("instagram_connections").upsert({
    user_id: stateRow.user_id,
    ig_user_id: igUserId,
    ig_username: profile.username ?? null,
    page_id: null,
    token_ciphertext: encrypted,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return json({ error: "Could not securely save Instagram connection." }, 500);
  }

  return Response.redirect(`${siteUrl}/?instagram_connected=1`, 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const url = new URL(req.url);

  if (
    req.method === "GET" &&
    (url.searchParams.has("code") || url.searchParams.has("error"))
  ) {
    try {
      return await callback(url);
    } catch {
      return json({ error: "Instagram authorization could not be completed." }, 500);
    }
  }

  if (req.method !== "POST") {
    return json({ error: "Use POST for PostPilot actions." }, 405);
  }

  try {
    const user = await requireUser(req);
    const body = await req.json();

    if (body.action === "connect-url") {
      const appId = Deno.env.get("INSTAGRAM_APP_ID");
      if (!appId) {
        return json({
          error: "Instagram app setup is incomplete. Configure the app credentials in Supabase.",
        }, 503);
      }

      const state = base64(crypto.getRandomValues(new Uint8Array(32)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const { error } = await admin.from("instagram_oauth_states").insert({
        state_hash: await sha256(state),
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      if (error) throw error;

      const authorize = new URL("https://www.instagram.com/oauth/authorize");
      authorize.searchParams.set("client_id", appId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set(
        "scope",
        "instagram_business_basic,instagram_business_content_publish",
      );
      authorize.searchParams.set("enable_fb_login", "0");

      return json({ url: authorize.toString() });
    }

    if (body.action === "status") {
      const { data, error } = await admin
        .from("instagram_connections")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ connected: false, username: null, connectedAt: null, tokenExpiresAt: null });

      try {
        const refreshed = await maybeRefreshConnection(data);
        return json({
          connected: true,
          username: refreshed.ig_username ?? null,
          connectedAt: refreshed.connected_at ?? null,
          tokenExpiresAt: refreshed.token_expires_at ?? null,
          refreshNeeded: false,
        });
      } catch (refreshError) {
        return json({
          connected: true,
          username: data.ig_username ?? null,
          connectedAt: data.connected_at ?? null,
          tokenExpiresAt: data.token_expires_at ?? null,
          refreshNeeded: true,
          warning: refreshError instanceof Error ? refreshError.message : "Instagram token needs attention.",
        });
      }
    }

    if (body.action === "disconnect") {
      const { error } = await admin.from("instagram_connections").delete().eq("user_id", user.id);
      if (error) throw error;
      return json({ disconnected: true });
    }

    if (body.action === "approve-publish") {
      if (!body.postId) {
        return json({ error: "postId is required." }, 400);
      }

      const { data: post, error: postError } = await admin
        .from("posts")
        .select("*")
        .eq("id", body.postId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (postError || !post) {
        return json({ error: "Post not found." }, 404);
      }

      if (!["scheduled", "draft"].includes(post.status)) {
        return json({
          error: "Only drafts or scheduled posts can be approved.",
        }, 409);
      }

      if (!post.media_url) {
        return json({ error: "Attach media before approving this post." }, 400);
      }

      const { data: initialConnection, error: connectionError } = await admin
        .from("instagram_connections")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (connectionError) throw connectionError;
      if (!initialConnection) {
        return json({ error: "Connect a professional Instagram account first." }, 409);
      }

      let connection = initialConnection;
      try {
        connection = await maybeRefreshConnection(initialConnection);
      } catch (refreshError) {
        if (!initialConnection.token_expires_at || new Date(initialConnection.token_expires_at).getTime() <= Date.now()) {
          throw refreshError;
        }
      }
      const token = await decryptToken(connection.token_ciphertext);
      const { data: signed, error: signedError } = await admin.storage
        .from("post-media")
        .createSignedUrl(post.media_url, 3600);

      if (signedError || !signed?.signedUrl) {
        return json({ error: "Could not create a media URL for Instagram." }, 500);
      }

      const mediaUrl = signed.signedUrl;
      const type = String(post.content_type).toLowerCase();
      const caption = [
        post.caption ?? "",
        Array.isArray(post.hashtags)
          ? post.hashtags.map((t: string) => "#" + String(t).replace(/^#+/, "")).join(" ")
          : "",
      ].filter(Boolean).join("\n\n");

      const params: Record<string, string> = {
        caption,
        access_token: token,
      };

      if (type === "reel" || type === "video") {
        params.media_type = "REELS";
        params.video_url = mediaUrl;
      } else if (type === "carousel") {
        return json({
          error: "Carousel publishing requires multiple ordered media assets. This post has one media file.",
        }, 400);
      } else {
        params.image_url = mediaUrl;
      }

      await admin.from("posts").update({
        approval_status: "publishing",
        publish_error: null,
      }).eq("id", post.id).eq("user_id", user.id);

      try {
        // Confirm Instagram can fetch the image/video URL before creating a container.
        const head = await fetch(mediaUrl, { method: "HEAD" });
        const mime = head.headers.get("content-type") ?? "";
        if (!head.ok) {
          throw new Error(
            `Instagram media URL is not publicly fetchable (HTTP ${head.status}).`,
          );
        }
        if (
          params.image_url &&
          !mime.toLowerCase().startsWith("image/")
        ) {
          throw new Error(
            `Expected an image URL but received content type "${mime}".`,
          );
        }

        const container = await graph(
          `${connection.ig_user_id}/media`,
          params,
          "POST",
        );

        if (!container.id) {
          throw new Error("Instagram did not return a media container ID.");
        }

        // Poll the container before attempting publication.
        const deadline = Date.now() +
          (params.media_type === "REELS" ? 90000 : 45000);
        let ready = false;
        let lastStatus = "IN_PROGRESS";

        while (Date.now() < deadline) {
          const info = await graph(String(container.id), {
            fields: "status_code,status",
            access_token: token,
          });

          lastStatus = String(info.status_code ?? info.status ?? "UNKNOWN");

          // Image containers may not always expose processing status consistently.
          if (lastStatus === "FINISHED") {
            ready = true;
            break;
          }

          if (
            lastStatus === "ERROR" ||
            lastStatus === "EXPIRED"
          ) {
            throw new Error(
              `Instagram media processing failed (status=${lastStatus}). ${String(info.status ?? "").slice(0, 250)}`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        if (!ready) {
          throw new Error(
            `Instagram media container was not ready before timeout (last status=${lastStatus}). Try again later.`,
          );
        }

        const published = await graph(
          `${connection.ig_user_id}/media_publish`,
          {
            creation_id: String(container.id),
            access_token: token,
          },
          "POST",
        );

        if (!published.id) {
          throw new Error("Instagram did not confirm a published media ID.");
        }

        await admin.from("posts").update({
          status: "published",
          approval_status: "published",
          instagram_media_id: String(published.id),
          published_at: new Date().toISOString(),
          publish_error: null,
        }).eq("id", post.id).eq("user_id", user.id);

        await admin.from("instagram_publish_logs").insert({
          user_id: user.id,
          post_id: post.id,
          action: "approve-publish",
          outcome: "success",
          meta_media_id: String(published.id),
          message: "Published through Instagram API.",
        });

        return json({ published: true, mediaId: String(published.id) });
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Instagram publishing failed.";

        await admin.from("posts").update({
          approval_status: "failed",
          publish_error: message,
        }).eq("id", post.id).eq("user_id", user.id);

        await admin.from("instagram_publish_logs").insert({
          user_id: user.id,
          post_id: post.id,
          action: "approve-publish",
          outcome: "failed",
          message,
        });

        return json({ error: message, published: false }, 502);
      }
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Unexpected server error.",
    }, 400);
  }
});
