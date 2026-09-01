-- Bank inflows: match as opening retained-earnings funding (clears 1190).

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.bank_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%match_source%';
  if cname is not null then
    execute format('alter table public.bank_transactions drop constraint %I', cname);
  end if;
end $$;

alter table public.bank_transactions
  add constraint bank_transactions_match_source_check
  check (
    match_source is null
    or match_source in (
      'payment',
      'expense',
      'payroll',
      'dividend',
      'sales_tax',
      'corporate_tax',
      'manual',
      'interest',
      'capital',
      'opening'
    )
  );
