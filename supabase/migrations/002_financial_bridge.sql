-- ==============================================================================
-- 🧭 PUSULA — Migration 002: Financial Bridge & Structural Improvements
-- ==============================================================================

-- 1. SUBSCRIPTIONS: Stratejik etiket + Kart FK
alter table public.subscriptions
  add column if not exists payment_card_id uuid references public.credit_cards(id) on delete set null,
  add column if not exists strategic_tag text check (strategic_tag in ('Vazgeçilmez', 'Esnek', 'Tek Seferlik', 'İptal'));

-- Mevcut model hacki verilerini taşı
update public.subscriptions set strategic_tag = model
  where model in ('Vazgeçilmez', 'Esnek', 'Tek Seferlik', 'İptal');
update public.subscriptions set model = 'Tekrarlayan'
  where model not in ('Tekrarlayan', 'Yıllık', 'Aylık', 'Haftalık');

-- 2. DEBTS: Proje bağlantısı
alter table public.debts
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- 3. TRANSACTIONS: Transfer köprüsü + Borç bağlantısı
alter table public.transactions
  add column if not exists source_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists target_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists related_debt_id uuid references public.debts(id) on delete set null;
