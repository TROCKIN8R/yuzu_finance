-- Wealthsimple CSV import metadata on bank transactions

alter table public.bank_transactions
  add column if not exists source_format text check (
    source_format is null or source_format in ('chequing', 'credit_card', 'manual')
  ),
  add column if not exists transaction_code text,
  add column if not exists import_key text;

create unique index if not exists bank_transactions_user_import_key_idx
  on public.bank_transactions (user_id, import_key)
  where import_key is not null;
