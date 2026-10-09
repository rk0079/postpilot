# PostPilot Instagram publishing

## What PostPilot handles automatically

- Every signed-in PostPilot user starts their own Instagram OAuth flow.
- OAuth state is random, hashed, short-lived, one-time, and tied to the initiating PostPilot user.
- Instagram access tokens are encrypted server-side with AES-256-GCM. Tokens and app secrets never go to frontend code.
- Each connection is keyed to the authenticated PostPilot user. Publishing verifies that the post and Instagram connection belong to the same user.
- Instagram connection and OAuth-state tables have no client-side RLS policies; access is through the Edge Function's service role only.
- Long-lived Instagram tokens are refreshed when nearing expiry and eligible for refresh. If refresh fails, PostPilot shows a warning and lets the user reconnect.
- Users can disconnect Instagram without deleting their saved posts.
- Publishing is an explicit, user-approved action. It is not yet an automatic background scheduler.

## Meta configuration needed from the app owner

Edge Function callback / redirect URI:

`https://jzwnjzagmijikbhxtrcn.supabase.co/functions/v1/instagram-publishing`

Set that exact URI in the Meta app's allowed OAuth redirect URI configuration.

Supabase Edge Function secrets (server-side only):
- `INSTAGRAM_APP_ID` — Meta app ID
- `INSTAGRAM_APP_SECRET` — Meta app secret
- `META_TOKEN_ENCRYPTION_KEY` — base64 encoding of 32 cryptographically random bytes (AES-256-GCM key)
- `META_REDIRECT_URI` — exact callback URI above (optional; defaults to the URI above)
- `SITE_URL` — frontend return URL; currently `https://postpilot-ebon-nu.vercel.app`
- `META_GRAPH_VERSION` — supported Instagram Graph API version; defaults to `v23.0`

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function runtime. Never put the service-role key or Meta app secret in Vercel public environment variables, browser JavaScript, or GitHub.

The Edge Function `instagram-publishing` has Verify JWT disabled only because Meta's OAuth callback has no Supabase JWT. The function independently verifies the Supabase user's bearer token for every POST action. Do not enable JWT verification at the gateway unless the OAuth callback is redesigned.

## Meta review and launch checks

1. Configure the Instagram API with Instagram Login for the PostPilot Meta app.
2. Enable/request the scopes used by this implementation: `instagram_business_basic` and `instagram_business_content_publish`.
3. Ensure app settings and allowed redirect URI match exactly.
4. Complete Meta's required app review / access level and business verification for the audience you intend to serve.
5. Test with a second, independent PostPilot user and their own eligible Instagram professional account.
6. Confirm they can connect, publish their own image/Reel, and cannot see another user's posts or connection.
7. Verify token refresh and reconnection after expiry/revocation.

## Known implementation limits

- A single-image post and Reels/video publishing are wired in the Edge Function, subject to Meta's current media requirements and permissions.
- Carousel publishing is not supported by the current one-media-file-per-post form.
- Approve & publish publishes immediately, even if the scheduled date is in the future.
- Automatic scheduled publishing requires a separate trusted background worker/cron flow and is not enabled by this UI.
- A READY Vercel deployment does not prove that Meta OAuth or publishing is approved or operational.
