-- ============================================================================
-- 027: Aylık Gelir Kalemleri (Incomes) Tablosu ve RLS Politikaları
-- Beyan odaklı manuel gelir kalemleri (hareketlerden bağımsız referans gelirler)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Maaş & Ücret',
  income_type TEXT NOT NULL DEFAULT 'Sabit' CHECK (income_type IN ('Sabit', 'Değişken')),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  period TEXT NOT NULL DEFAULT 'Aylık',
  payday INTEGER NULL CHECK (payday IS NULL OR (payday >= 1 AND payday <= 31)),
  status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Pasif')),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON public.incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_status ON public.incomes(user_id, status);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own incomes" ON public.incomes;
CREATE POLICY "Users can view their own incomes"
  ON public.incomes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own incomes" ON public.incomes;
CREATE POLICY "Users can insert their own incomes"
  ON public.incomes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own incomes" ON public.incomes;
CREATE POLICY "Users can update their own incomes"
  ON public.incomes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own incomes" ON public.incomes;
CREATE POLICY "Users can delete their own incomes"
  ON public.incomes FOR DELETE
  USING (auth.uid() = user_id);
