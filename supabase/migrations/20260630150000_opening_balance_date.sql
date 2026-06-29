-- Opening balance date for grand-livre opening entries (share capital / trésorerie d'ouverture)

alter table public.organization_settings
  add column if not exists opening_balance_date date;
