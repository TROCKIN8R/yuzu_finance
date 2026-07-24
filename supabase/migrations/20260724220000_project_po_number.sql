-- Optional purchase order (PO / BC) number on projects; shown on related invoices when set.

alter table public.projects
  add column if not exists po_number text;
