-- Per-invoice sales tax toggle (off by default for non-registered businesses)

alter table public.invoices
  add column if not exists include_sales_tax boolean not null default false;
