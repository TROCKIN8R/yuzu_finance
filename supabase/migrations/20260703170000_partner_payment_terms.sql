-- Partner payment terms: net days + invoice late penalty % (default Net 30, 2% monthly)

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'late_penalty_monthly_pct'
  ) then
    alter table public.partners rename column late_penalty_monthly_pct to invoice_penalty_monthly_pct;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'invoice_penalty_monthly_pct'
  ) then
    alter table public.partners add column invoice_penalty_monthly_pct numeric(6, 5) not null default 0.02;
  end if;
end $$;

update public.partners
set invoice_penalty_monthly_pct = 0.02
where invoice_penalty_monthly_pct is null;

update public.partners
set payment_terms_days = 30
where payment_terms_days is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organization_settings' and column_name = 'late_penalty_monthly_pct'
  ) then
    alter table public.organization_settings rename column late_penalty_monthly_pct to invoice_penalty_monthly_pct;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organization_settings' and column_name = 'invoice_penalty_monthly_pct'
  ) then
    alter table public.organization_settings add column invoice_penalty_monthly_pct numeric(6, 5) not null default 0.02;
  end if;
end $$;

update public.organization_settings
set invoice_penalty_monthly_pct = 0.02
where invoice_penalty_monthly_pct is null;
