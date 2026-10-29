-- ==============================================================================
-- 🧭 PUSULA — Migration 028: Taksit Kırılımı (debt_installments) ve Senkronizasyon
-- ==============================================================================
-- Borç ve alacakların değişken tutarlı ve esnek vadeli taksit planları için.

CREATE TABLE IF NOT EXISTS public.debt_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no >= 1),
  due_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'Bekliyor' CHECK (status IN ('Bekliyor', 'Ödendi')),
  paid_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_debt_installments_debt_id
  ON public.debt_installments(debt_id, installment_no);

CREATE INDEX IF NOT EXISTS idx_debt_installments_user_due
  ON public.debt_installments(user_id, status, due_date);

-- RLS
ALTER TABLE public.debt_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own debt_installments" ON public.debt_installments;
CREATE POLICY "Users can view their own debt_installments"
  ON public.debt_installments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own debt_installments" ON public.debt_installments;
CREATE POLICY "Users can insert their own debt_installments"
  ON public.debt_installments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own debt_installments" ON public.debt_installments;
CREATE POLICY "Users can update their own debt_installments"
  ON public.debt_installments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own debt_installments" ON public.debt_installments;
CREATE POLICY "Users can delete their own debt_installments"
  ON public.debt_installments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- İzinler
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_installments TO authenticated;

-- Otomatik paid_at ve updated_at Yönetimi
CREATE OR REPLACE FUNCTION public.fn_set_debt_installment_paid_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Ödendi' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'Bekliyor' THEN
    NEW.paid_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_debt_installment_paid_at ON public.debt_installments;
CREATE TRIGGER trg_set_debt_installment_paid_at
  BEFORE INSERT OR UPDATE ON public.debt_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_debt_installment_paid_at();

-- Otomatik Toplam Senkronizasyonu Fonksiyonu & Trigger'ı
CREATE OR REPLACE FUNCTION public.fn_sync_debt_totals_from_installments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_debt_id UUID;
  v_count INTEGER;
  v_total NUMERIC(12, 2);
  v_paid NUMERIC(12, 2);
  v_remaining NUMERIC(12, 2);
BEGIN
  -- Eğer UPDATE ile debt_id değiştiyse, eski borcun toplamlarını güncelle
  IF TG_OP = 'UPDATE' AND OLD.debt_id IS DISTINCT FROM NEW.debt_id THEN
    PERFORM 1 FROM public.debts WHERE id = OLD.debt_id;
    IF FOUND THEN
      SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(CASE WHEN status = 'Ödendi' THEN amount ELSE 0 END), 0)
      INTO v_count, v_total, v_paid
      FROM public.debt_installments
      WHERE debt_id = OLD.debt_id;

      IF v_count > 0 THEN
        v_remaining := GREATEST(0, v_total - v_paid);
        UPDATE public.debts
        SET principal = v_total,
            past_payments = v_paid,
            remaining = v_remaining,
            status = CASE WHEN v_remaining <= 0 THEN 'Kapatıldı' ELSE 'Açık' END,
            updated_at = now()
        WHERE id = OLD.debt_id;
      END IF;
    END IF;
  END IF;

  v_debt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.debt_id ELSE NEW.debt_id END;

  -- Üst borç kaydı hala var mı kontrol et (CASCADE silinmelerde patlamaması için)
  PERFORM 1 FROM public.debts WHERE id = v_debt_id;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(CASE WHEN status = 'Ödendi' THEN amount ELSE 0 END), 0)
  INTO v_count, v_total, v_paid
  FROM public.debt_installments
  WHERE debt_id = v_debt_id;

  IF v_count > 0 THEN
    v_remaining := GREATEST(0, v_total - v_paid);
    UPDATE public.debts
    SET principal = v_total,
        past_payments = v_paid,
        remaining = v_remaining,
        status = CASE WHEN v_remaining <= 0 THEN 'Kapatıldı' ELSE 'Açık' END,
        updated_at = now()
    WHERE id = v_debt_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_debt_totals_from_installments ON public.debt_installments;
CREATE TRIGGER trg_sync_debt_totals_from_installments
  AFTER INSERT OR UPDATE OR DELETE ON public.debt_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_debt_totals_from_installments();

NOTIFY pgrst, 'reload schema';
