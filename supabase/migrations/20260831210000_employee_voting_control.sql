-- EI (AE) exclusion: shareholder-employee with more than 40% of voting shares
-- is not in insurable employment (EI Act s. 5(2)(b)). Flag is a fallback when
-- the cap table is not linked; payroll also infers from shareholders.shares_held.

alter table public.employees
  add column if not exists over_40_percent_voting boolean not null default false;
