# PostPilot deployment configuration foundation

## Source of truth
- `postpilot.config.json`: public configuration shared by tooling and future frontend runtime integration.
- Secrets (OAuth client secrets, tokens, Supabase service-role keys) must stay in Supabase/Vercel secret stores. Never commit them.

## Environments
- Production frontend URL: the currently known Vercel production URL.
- Preview deployments: unique Vercel URLs; do not register each preview URL as an OAuth provider callback.
- Backend project: the configured Supabase project.
- LinkedIn OAuth callback: stable Supabase Edge Function URL, not a Vercel build URL.

## Build checks
Run locally:
```bash
node scripts/validate-postpilot-config.mjs
```
GitHub Actions runs the same validation on pull requests and pushes to main/feature branches.

## Release safety
- This change is isolated to a feature branch.
- It does not deploy Supabase Edge Functions or modify any Supabase settings.
- It does not modify login, auth code, Instagram publishing, or LinkedIn OAuth code.
- Preview and production deployment settings must be reviewed before changing them.
- Production releases require explicit human approval.

## Next implementation step
Import this config into the frontend and add a read-only deployment health panel that displays the build commit, environment, Supabase project-ref match, and Edge Function reachability. This should be developed and tested in preview before any production rollout.
