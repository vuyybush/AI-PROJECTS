# DreamForge AI

Next.js image studio with Cloudflare Workers AI, Supabase accounts/private history, Turnstile, and persistent generation limits.

The app is at the repository root. In Vercel, choose **Next.js** and root directory **`.`**. Use Node.js 22 and the default `npm run build` command.

## Local development

```sh
npm ci
cp .env.local.example .env.local
npm run dev
```

On Windows, use `Copy-Item .env.local.example .env.local`. Fill in the required values before testing accounts or generation. Never commit `.env.local`.

## Deployment setup

1. Import this repository into your Vercel account.
2. Run `supabase/phase5.sql` only if the Phase 5 tables/bucket do not already exist, then run `supabase/phase6.sql`.
3. Add the eight environment variables listed in `.env.local.example` to Vercel Production. Set `APP_URL` to the final HTTPS site URL. Rebuild after setting/changing the public Turnstile site key.
4. Allow the site's hostname in Turnstile and add its exact `/auth/callback` URL to Supabase Authentication URL Configuration.
5. Test email confirmation, one real generation, private history, download, and deletion.

Keep your existing Supabase project to retain users and images when moving hosting accounts. The frontend builds without credentials; accounts and image generation fail closed until configuration is complete.

See [INSTALL.md](INSTALL.md) for detailed provider setup, quota controls, and live acceptance checks. Its merge-package steps are only needed when installing into another local checkout; this repository already contains the full app.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Phase 6 was tested with mocked external providers, actual quota SQL in PGlite, and desktop/mobile browser flows. Deployment and live-provider validation remain separate steps. Images are stored in Supabase, not Vercel Blob.
