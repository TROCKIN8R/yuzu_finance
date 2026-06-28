-- Dividends: declared on creation, paid via bank reconciliation

alter table public.dividends
  add column if not exists declared_date date,
  add column if not exists status text not null default 'declared'
    check (status in ('declared', 'paid'));

update public.dividends
set declared_date = payment_date
where declared_date is null;

update public.dividends
set status = 'paid'
where payment_date is not null;

alter table public.dividends
  alter column declared_date set not null,
  alter column declared_date set default current_date,
  alter column payment_date drop not null,
  alter column payment_date drop default;

create or replace function public.dividends_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.declared_date is null then
    new.declared_date := coalesce(new.payment_date, current_date);
  end if;
  if new.status is null then
    new.status := 'declared';
  end if;
  return new;
end;
$$;

drop trigger if exists dividends_before_insert on public.dividends;

create trigger dividends_before_insert
  before insert on public.dividends
  for each row execute function public.dividends_before_insert();
