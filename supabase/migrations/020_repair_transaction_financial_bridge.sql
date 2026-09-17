-- Repair databases that received the atomic debt RPCs without the older
-- financial-bridge columns. Every statement is idempotent so this migration is
-- also safe for databases where migration 002 was applied normally.

alter table public.transactions
  add column if not exists source_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists target_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists related_debt_id uuid references public.debts(id) on delete set null;

create index if not exists idx_transactions_related_debt
  on public.transactions(related_debt_id);

notify pgrst, 'reload schema';
