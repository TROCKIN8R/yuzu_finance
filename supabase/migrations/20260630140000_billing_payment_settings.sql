-- Billing payment coordinates + bilingual invoice footers (stored in Supabase only — never commit values)

alter table public.organization_settings
  add column if not exists interac_email text,
  add column if not exists bank_institution text,
  add column if not exists bank_transit text,
  add column if not exists bank_account text,
  add column if not exists billing_inquiries_email text,
  add column if not exists payment_instructions_fr text,
  add column if not exists payment_instructions_en text;

update public.organization_settings
set payment_instructions_fr = payment_instructions
where payment_instructions is not null
  and trim(payment_instructions) <> ''
  and (payment_instructions_fr is null or trim(payment_instructions_fr) = '');

update public.organization_settings
set
  interac_email = coalesce(nullif(trim(interac_email), ''), 'accounting@yuzu.solutions'),
  billing_inquiries_email = coalesce(nullif(trim(billing_inquiries_email), ''), 'accounting@yuzu.solutions')
where interac_email is null
   or trim(interac_email) = ''
   or billing_inquiries_email is null
   or trim(billing_inquiries_email) = '';
