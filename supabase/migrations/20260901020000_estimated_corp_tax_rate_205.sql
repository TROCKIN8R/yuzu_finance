-- Planning combined rate for a Québec services CCPC that keeps the federal SBD
-- (9%) but typically fails Québec's 5,500 remunerated-hours test (11.5% general).
-- Draft for CPA review — not an assessed CRA / Revenu Québec rate.

alter table public.organization_settings
  alter column estimated_corp_tax_rate set default 0.205;

update public.organization_settings
  set estimated_corp_tax_rate = 0.205
  where estimated_corp_tax_rate = 0.12;
