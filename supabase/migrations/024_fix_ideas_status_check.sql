-- ==============================================================================
-- 🧭 PUSULA — Migration 024: Fix Ideas Status Check Constraint
-- ==============================================================================
-- Allows ideas to be moved to 'decided' (Karar Verildi) state without violating
-- PostgreSQL check constraint ideas_status_check.

ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check 
  CHECK (status IN ('inbox', 'maybe', 'decided', 'killed', 'promoted'));

-- PostgREST şema önbelleğini anında tazele
NOTIFY pgrst, 'reload schema';
