-- Partner payment terms: net days + monthly late penalty (default Net 30, 2%)

alter table public.partners
  add column if not exists late_penalty_monthly_pct numeric(6, 5) not null default 0.02;

update public.partners
set late_penalty_monthly_pct = 0.02
where late_penalty_monthly_pct is null;

update public.partners
set payment_terms_days = 30
where payment_terms_days is null;

alter table public.organization_settings
  add column if not exists late_penalty_monthly_pct numeric(6, 5) not null default 0.02;

update public.organization_settings
set late_penalty_monthly_pct = 0.02
where late_penalty_monthly_pct is null;
