# Instagram publishing setup (approval mode)

The frontend deploys to Vercel automatically from `main`. **Publishing is not active yet**: the Supabase migration and Edge Function must be installed, and Meta app credentials/account authorization must be completed.

## 1. Apply the database migration

In Supabase SQL Editor for project `jzwnjzagmijikbhxtrcn`, run the migration in `supabase/migrations/20261009_instagram_approval.sql`. It is additive and does not delete posts or bulk-upload batches. It adds approval/publish tracking and private tables for encrypted tokens, short-lived OAuth state, and publish logs.

## 2. Deploy the Edge Function

Deploy `supabase/functions/instagram-publishing/index.ts` as a Supabase Edge Function named `instagram-publishing`.

Set **Verify JWT** to OFF for this function because Meta's OAuth redirect has no Supabase JWT. The function itself verifies the user's Supabase JWT for every POST action, and the OAuth callback is protected by one-time, expiring, hashed state. Do not expose the service-role key in browser code.

## 3. Configure server-side secrets

Set these in Supabase Edge Function secrets (never in Vercel public/client variables):

- `META_APP_ID`: Meta developer app ID.
- `META_APP_SECRET`: Meta developer app secret.
- `META_TOKEN_ENCRYPTION_KEY`: base64 encoding of 32 cryptographically random bytes (AES-256-GCM key).
- `META_REDIRECT_URI`: `https://jzwnjzagmijikbhxtrcn.supabase.co/functions/v1/instagram-publishing`
- `SITE_URL`: `https://postpilot-ebon-nu.vercel.app`
- `META_GRAPH_VERSION`: a Graph API version currently supported by your Meta app.
- Ensure Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime.

Never send Meta app secrets or access tokens to the browser or commit them to GitHub.

## 4. Configure the Meta developer app

Create/configure a Meta app with Instagram Graph API / Facebook Login, add the exact redirect URI above to Valid OAuth Redirect URIs, and request `pages_show_list`, `instagram_basic`, `instagram_content_publish`, and `pages_read_engagement`. Use an Instagram **Business** account linked to a Facebook Page managed by the authorizing user. Complete any required app review / business verification before use with accounts outside app roles.

## 5. Approval workflow

1. Sign into PostPilot.
2. Connect the Instagram Business account from the Instagram publishing panel.
3. Review a saved draft or scheduled post.
4. Click **Approve & publish** and confirm. That action publishes immediately; it is not a future auto-publish scheduler.
5. Confirm the post status and Instagram profile after Meta returns success.

The Meta API must be able to fetch the media URL. PostPilot uses a time-limited signed URL from the private `post-media` bucket. Supported image/video formats, dimensions, file sizes, and video processing depend on Meta's current publishing requirements.

## Current implementation limits

- Existing posts and the 50-file bulk scheduler are preserved.
- Single-image posts and Reels/video publishing are wired in the Edge Function.
- A carousel needs multiple ordered image assets attached to one post. The current form stores one file per post, so carousel publishing intentionally returns a clear error rather than publishing an incomplete carousel.
- A successful frontend deployment is not proof that Meta publishing is configured. Until the migration, function, secrets, Meta OAuth, and permissions are all complete, the app must be treated as **not connected / not publish-ready**.
