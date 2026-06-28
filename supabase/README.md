# Security (required reading)

See [SECURITY.md](../SECURITY.md) for the public GitHub Pages + private Supabase model.

Run **all** migrations in order:

1. `20260628000000_initial.sql`
2. `20260628000001_seed_settings_example.sql` (optional, after signup)
3. `20260628000002_security_hardening.sql`

## Auth lockdown

1. Create your account once.
2. **Authentication → Settings** → disable **Enable new user sign-ups**.
3. Strong password; enable MFA if available.

## Keys

| Key | Where | Safe in public JS? |
|-----|-------|-------------------|
| anon (public) | GitHub Secret → build | Yes — RLS + login protect data |
| service_role | Never in git / never in browser | **No** — full DB access |
