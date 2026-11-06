-- ==============================================================================
-- 🧭 PUSULA — Migration 031: Savings & Yield Accounts Support
-- ==============================================================================
-- Adds yield, interest rate, withholding tax, base reserve limit, maturity date,
-- and last yield applied tracking columns to public.accounts.

alter table public.accounts
  add column if not exists interest_rate numeric(6, 2) default null,
  add column if not exists withholding_tax_rate numeric(5, 2) default null,
  add column if not exists reserved_base_amount numeric(12, 2) default null,
  add column if not exists maturity_date date default null,
  add column if not exists last_yield_applied_at date default null;

notify pgrst, 'reload schema';
