-- Security hardening: explicit grants + block anonymous table access.
-- RLS policies already require auth.uid() = user_id; this adds defense in depth.

revoke all on table public.organization_settings from anon, public;
revoke all on table public.clients from anon, public;
revoke all on table public.projects from anon, public;
revoke all on table public.time_entries from anon, public;
revoke all on table public.invoices from anon, public;
revoke all on table public.payments from anon, public;

grant select, insert, update, delete on table public.organization_settings to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.time_entries to authenticated;
grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;

grant execute on function public.next_invoice_number() to authenticated;

-- anon role: no direct table access (auth sign-in still works via Supabase Auth API)
