-- Invoice currency (CAD only for this corporation)

alter table public.invoices
  add column if not exists currency text not null default 'CAD';

update public.invoices
set currency = 'CAD'
where currency is null or btrim(currency) = '';

alter table public.invoices
  drop constraint if exists invoices_currency_cad_check;

alter table public.invoices
  add constraint invoices_currency_cad_check check (currency = 'CAD');
