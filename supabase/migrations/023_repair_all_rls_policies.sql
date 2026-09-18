-- ==============================================================================
-- 🧭 PUSULA — Migration 023: Repair and Unify Row Level Security (RLS) Policies
-- ==============================================================================
-- Ensures all interactive modules (Dreams, Routines, Routine Logs, Journal,
-- Agenda, Investments, Credentials, Projects) allow authenticated users
-- full CRUD access to their own data, and reloads the PostgREST schema cache.

-- 1. HEDEFLER & VİZYON (dreams)
ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own dreams" ON public.dreams;
DROP POLICY IF EXISTS "Users can insert their own dreams" ON public.dreams;
DROP POLICY IF EXISTS "Users can update their own dreams" ON public.dreams;
DROP POLICY IF EXISTS "Users can delete their own dreams" ON public.dreams;
DROP POLICY IF EXISTS "Users can manage own dreams" ON public.dreams;
DROP POLICY IF EXISTS "Users can manage their own dreams" ON public.dreams;

CREATE POLICY "Users can manage their own dreams"
  ON public.dreams FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 2. RUTİNLER & ALIŞKANLIKLAR (routines)
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own routines" ON public.routines;
DROP POLICY IF EXISTS "Users can manage own routines" ON public.routines;

CREATE POLICY "Users can manage their own routines"
  ON public.routines FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 3. RUTİN KAYITLARI (routine_logs)
ALTER TABLE public.routine_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own routine logs" ON public.routine_logs;
DROP POLICY IF EXISTS "Users can manage own routine logs" ON public.routine_logs;

CREATE POLICY "Users can manage their own routine logs"
  ON public.routine_logs FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 4. SEYİR DEFTERİ & GÜNLÜK (journal_entries)
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can manage own journal entries" ON public.journal_entries;

CREATE POLICY "Users can manage their own journal entries"
  ON public.journal_entries FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 5. AJANDA & ODAK (agenda_items)
ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own agenda_items" ON public.agenda_items;
DROP POLICY IF EXISTS "Users can manage their own agenda_items" ON public.agenda_items;

CREATE POLICY "Users can manage own agenda_items"
  ON public.agenda_items FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. ŞİFRE KASASI (credentials)
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own credentials" ON public.credentials;
DROP POLICY IF EXISTS "Users can manage their own credentials" ON public.credentials;

CREATE POLICY "Users can manage own credentials"
  ON public.credentials FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. YATIRIMLAR (investments)
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can insert own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can update own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can delete own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can manage own investments" ON public.investments;

CREATE POLICY "Users can manage own investments"
  ON public.investments FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. PROJELER (projects)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own projects" ON public.projects;

CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. Eski 'local' test verilerini varsa ilk kayıtlı kullanıcıya bağlama (opsiyonel kurtarma)
DO $$
DECLARE
  v_first_user_id text;
BEGIN
  SELECT id::text INTO v_first_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_first_user_id IS NOT NULL THEN
    UPDATE public.dreams SET user_id = v_first_user_id WHERE user_id = 'local';
    UPDATE public.routines SET user_id = v_first_user_id WHERE user_id = 'local';
    UPDATE public.routine_logs SET user_id = v_first_user_id WHERE user_id = 'local';
    UPDATE public.journal_entries SET user_id = v_first_user_id WHERE user_id = 'local';
  END IF;
END $$;

-- 10. PostgREST şema önbelleğini anında tazele
NOTIFY pgrst, 'reload schema';
