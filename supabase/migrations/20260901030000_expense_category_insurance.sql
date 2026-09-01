-- Insurance as an operating expense category (bank rec + employee expenses).
-- Maps to GL 5070 Assurances in the app chart of accounts.

alter type public.expense_category add value if not exists 'insurance';
