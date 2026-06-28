-- Ensure declared_date is always set on insert (handles older app builds that only send payment_date)

alter table public.dividends
  alter column declared_date set default current_date;

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
