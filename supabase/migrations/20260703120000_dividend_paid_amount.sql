-- Track cumulative dividend payments from bank reconciliation (partial payments allowed)

alter table public.dividends
  add column if not exists paid_amount numeric(12, 2) not null default 0
    check (paid_amount >= 0);

update public.dividends
set paid_amount = total_amount
where status = 'paid';

update public.dividends
set status = 'declared'
where status = 'paid' and paid_amount < total_amount;
