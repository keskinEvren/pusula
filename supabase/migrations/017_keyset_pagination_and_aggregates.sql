-- ==============================================================================
-- 🧭 PUSULA — Migration 017: Keyset Pagination Indexes & Aggregate Stats RPCs
-- ==============================================================================

-- 1. Dual Keyset Indexes (Date & Amount)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id 
ON public.transactions (user_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_amount_id 
ON public.transactions (user_id, amount DESC, id DESC);

-- Project filter support index
CREATE INDEX IF NOT EXISTS idx_transactions_user_project_date
ON public.transactions (user_id, project_id, date DESC);

-- 2. Trigram GIN Search Index (Merchant + Description + Account/Card)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS idx_transactions_search_trgm 
    ON public.transactions USING gin (
      (
        coalesce(merchant, '') || ' ' || 
        coalesce(description, '') || ' ' || 
        coalesce(account_or_card, '')
      ) gin_trgm_ops
    );
  END IF;
END $$;

-- 3. Filter-Parity Aggregate Statistics RPC (Transactions List)
CREATE OR REPLACE FUNCTION public.fn_transactions_stats(
  p_search text DEFAULT NULL,
  p_group text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_month text DEFAULT NULL,
  p_import_id text DEFAULT NULL,
  p_segment_tab text DEFAULT 'all',
  p_entity_id text DEFAULT 'ALL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stats jsonb;
  v_month_start date := CASE 
    WHEN p_month IS NOT NULL AND p_month <> 'ALL' AND p_month ~ '^\d{4}-\d{2}$' 
    THEN to_date(p_month || '-01', 'YYYY-MM-DD') 
    ELSE NULL 
  END;
  v_next_month_start date := CASE 
    WHEN v_month_start IS NOT NULL 
    THEN (v_month_start + interval '1 month')::date 
    ELSE NULL 
  END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz erişim: Oturum açılmalıdır.';
  END IF;

  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'total_volume', COALESCE(SUM(amount), 0),
    'total_spent', COALESCE(SUM(
      CASE 
        WHEN analysis_group = 'Hariç' OR type IN ('Gelir', 'Tahsilat') THEN 0
        WHEN type = 'İade' THEN -amount
        ELSE amount
      END
    ), 0)
  ) INTO v_stats
  FROM public.transactions t
  WHERE t.user_id = auth.uid()
    -- 1. Search Filter (description, merchant, account_or_card)
    AND (
      p_search IS NULL OR trim(p_search) = '' OR 
      (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%'
    )
    -- 2. Group Filter
    AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
    -- 3. Type Filter
    AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
    -- 4. Project Filter
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    -- 5. Sargable Month Range Filter
    AND (
      v_month_start IS NULL OR 
      (t.date >= v_month_start AND t.date < v_next_month_start)
    )
    -- 6. Import Batch Filter
    AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
    -- 7. Segment Tab Filter
    AND (
      p_segment_tab = 'all' OR
      (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
      (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama'))
    )
    -- 8. Specific Entity Selector Filter
    AND (
      p_entity_id = 'ALL' OR
      t.card_id::text = p_entity_id OR 
      t.account_id::text = p_entity_id OR 
      t.account_or_card ILIKE '%' || p_entity_id || '%'
    );

  RETURN v_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_transactions_stats FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_transactions_stats TO authenticated;

-- 4. Project Detail Finance Summary RPC (/projects/[slug])
CREATE OR REPLACE FUNCTION public.fn_project_finance_summary(p_project_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz erişim: Oturum açılmalıdır.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Proje bulunamadı veya yetkisiz erişim.';
  END IF;

  SELECT jsonb_build_object(
    'direct_cost_total', COALESCE(SUM(amount), 0),
    'direct_expense', COALESCE(SUM(amount) FILTER (WHERE type = 'Harcama'), 0),
    'direct_revenue', COALESCE(SUM(amount) FILTER (WHERE type = 'Gelir'), 0),
    'total_count', COUNT(*)
  ) INTO v_res
  FROM public.transactions
  WHERE project_id = p_project_id AND user_id = auth.uid();

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_project_finance_summary FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_project_finance_summary TO authenticated;

-- 5. All Projects Direct Costs Summary RPC (/projects list)
CREATE OR REPLACE FUNCTION public.fn_all_projects_direct_costs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz erişim: Oturum açılmalıdır.';
  END IF;

  SELECT coalesce(
    jsonb_object_agg(project_id::text, total_amount),
    '{}'::jsonb
  ) INTO v_res
  FROM (
    SELECT project_id, COALESCE(SUM(amount), 0) AS total_amount
    FROM public.transactions
    WHERE user_id = auth.uid() AND project_id IS NOT NULL
    GROUP BY project_id
  ) sub;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_all_projects_direct_costs FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_all_projects_direct_costs TO authenticated;

-- 6. Keyset Pagination Page Query RPC (Direct Composite B-Tree Index Cond via Row Constructor)
CREATE OR REPLACE FUNCTION public.fn_transactions_page(
  p_search text DEFAULT NULL,
  p_group text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_month text DEFAULT NULL,
  p_import_id text DEFAULT NULL,
  p_segment_tab text DEFAULT 'all',
  p_entity_id text DEFAULT 'ALL',
  p_sort_field text DEFAULT 'date',
  p_sort_order text DEFAULT 'desc',
  p_cursor_date date DEFAULT NULL,
  p_cursor_amount numeric DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 51
)
RETURNS SETOF public.transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month_start date := CASE 
    WHEN p_month IS NOT NULL AND p_month <> 'ALL' AND p_month ~ '^\d{4}-\d{2}$' 
    THEN to_date(p_month || '-01', 'YYYY-MM-DD') 
    ELSE NULL 
  END;
  v_next_month_start date := CASE 
    WHEN v_month_start IS NOT NULL 
    THEN (v_month_start + interval '1 month')::date 
    ELSE NULL 
  END;
  v_is_asc boolean := (lower(coalesce(p_sort_order, 'desc')) = 'asc');
  v_is_amount boolean := (lower(coalesce(p_sort_field, 'date')) = 'amount');
  v_has_cursor boolean := (p_cursor_id IS NOT NULL AND ((NOT v_is_amount AND p_cursor_date IS NOT NULL) OR (v_is_amount AND p_cursor_amount IS NOT NULL)));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz erişim: Oturum açılmalıdır.';
  END IF;

  -- Branch 1: Date DESC
  IF NOT v_is_amount AND NOT v_is_asc THEN
    IF NOT v_has_cursor THEN
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.date DESC, t.id DESC
      LIMIT p_limit;
    ELSE
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND ROW(t.date, t.id) < ROW(p_cursor_date, p_cursor_id)
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.date DESC, t.id DESC
      LIMIT p_limit;
    END IF;

  -- Branch 2: Date ASC
  ELSIF NOT v_is_amount AND v_is_asc THEN
    IF NOT v_has_cursor THEN
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.date ASC, t.id ASC
      LIMIT p_limit;
    ELSE
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND ROW(t.date, t.id) > ROW(p_cursor_date, p_cursor_id)
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.date ASC, t.id ASC
      LIMIT p_limit;
    END IF;

  -- Branch 3: Amount DESC
  ELSIF v_is_amount AND NOT v_is_asc THEN
    IF NOT v_has_cursor THEN
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.amount DESC, t.id DESC
      LIMIT p_limit;
    ELSE
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND ROW(t.amount, t.id) < ROW(p_cursor_amount, p_cursor_id)
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.amount DESC, t.id DESC
      LIMIT p_limit;
    END IF;

  -- Branch 4: Amount ASC
  ELSE
    IF NOT v_has_cursor THEN
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.amount ASC, t.id ASC
      LIMIT p_limit;
    ELSE
      RETURN QUERY
      SELECT t.* FROM public.transactions t
      WHERE t.user_id = auth.uid()
        AND ROW(t.amount, t.id) > ROW(p_cursor_amount, p_cursor_id)
        AND (p_search IS NULL OR trim(p_search) = '' OR 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ILIKE '%' || trim(p_search) || '%')
        AND (p_group IS NULL OR p_group = 'ALL' OR t.analysis_group = p_group)
        AND (p_type IS NULL OR p_type = 'ALL' OR t.type = p_type)
        AND (p_project_id IS NULL OR t.project_id = p_project_id)
        AND (v_month_start IS NULL OR (t.date >= v_month_start AND t.date < v_next_month_start))
        AND (p_import_id IS NULL OR p_import_id = 'ALL' OR t.import_id::text = p_import_id)
        AND (p_segment_tab = 'all' OR
             (p_segment_tab = 'cards' AND NOT (t.card_id IS NULL AND t.type = 'Gelir') AND NOT (t.account_id IS NOT NULL AND t.type <> 'Harcama')) OR
             (p_segment_tab = 'accounts' AND NOT (t.card_id IS NOT NULL AND t.account_id IS NULL AND t.type = 'Harcama')))
        AND (p_entity_id = 'ALL' OR t.card_id::text = p_entity_id OR t.account_id::text = p_entity_id OR t.account_or_card ILIKE '%' || p_entity_id || '%')
      ORDER BY t.amount ASC, t.id ASC
      LIMIT p_limit;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_transactions_page FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_transactions_page TO authenticated;

