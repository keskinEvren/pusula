-- ==============================================================================
-- 🧭 PUSULA — Migration 025: Make Agenda plan_date Nullable & Support Backlog
-- ==============================================================================
-- 1. Allow undated agenda items (Backlog / Havuz) by dropping NOT NULL & DEFAULT
-- 2. Add is_late_completed to distinguish items completed in retrospect
-- 3. Add partial index for fast undated item queries

-- 1. plan_date kısıtlarını kaldır
ALTER TABLE public.agenda_items ALTER COLUMN plan_date DROP NOT NULL;
ALTER TABLE public.agenda_items ALTER COLUMN plan_date DROP DEFAULT;

-- 2. Geç tamamlanma durumunu semantik olarak izlemek için sütun ekle
ALTER TABLE public.agenda_items ADD COLUMN IF NOT EXISTS is_late_completed boolean NOT NULL DEFAULT false;

-- 3. Tarihsiz havuz sorguları için kısmi indeks (Backlog performansı)
CREATE INDEX IF NOT EXISTS idx_agenda_user_backlog 
  ON public.agenda_items(user_id) 
  WHERE plan_date IS NULL;

-- 4. PostgREST şema önbelleğini tazele
NOTIFY pgrst, 'reload schema';
