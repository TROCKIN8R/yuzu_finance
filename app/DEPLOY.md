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

Site URL: `https://<username>.github.io/<repo-name>/`

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
