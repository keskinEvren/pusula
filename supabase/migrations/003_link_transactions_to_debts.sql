-- ==============================================================================
-- 🧭 PUSULA — Migration 003: Debt & Transaction Linking Indexes
-- ==============================================================================

-- 1. Index on related_debt_id for fast joins and lookups
create index if not exists idx_transactions_related_debt on public.transactions(related_debt_id);

-- 2. Index on debts user and status for fast debt summary cards
create index if not exists idx_debts_user_status on public.debts(user_id, status);
create index if not exists idx_debts_user_type on public.debts(user_id, type);
