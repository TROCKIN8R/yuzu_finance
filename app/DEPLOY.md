# Deploy to GitHub Pages

The UI is public; **all business data lives in Supabase**, not in git.

Read [SECURITY.md](../SECURITY.md) before deploying.

## Steps

1. Complete [supabase/README.md](../supabase/README.md) (migrations, auth, your account).
2. In the GitHub repo: **Settings → Secrets and variables → Actions**:
   - `VITE_SUPABASE_URL` — `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — anon public key (not service_role)
3. **Settings → Pages → Build and deployment → Source**: GitHub Actions.
4. Push to `main` — workflow `.github/workflows/deploy-pages.yml` builds and deploys.

Site URL: `https://<username>.github.io/<repo-name>/` (include the repo name and trailing slash).

Example: `https://trockin8r.github.io/yuzu_finance/`

## Troubleshooting 404

1. **Settings → Pages → Build and deployment → Source** must be **GitHub Actions** (not “Deploy from a branch”).
2. Open the latest **Deploy to GitHub Pages** workflow run — both `build` and `deploy` jobs must be green.
3. Use the project URL with the repo name: `https://<user>.github.io/yuzu_finance/` — the root `github.io/` URL will 404 for project sites.
4. After changing Pages source, run **Actions → Deploy to GitHub Pages → Run workflow** once.
5. Hard-refresh the browser (or wait 1–2 minutes for CDN cache).

## Custom domain

Set `VITE_BASE_PATH=/` in the workflow (or a repo variable) if you use a root custom domain.

## Local dev

```bash
cd app
cp .env.example .env.local
# VITE_BASE_PATH=/   (default for local)
npm install
npm run dev
```
