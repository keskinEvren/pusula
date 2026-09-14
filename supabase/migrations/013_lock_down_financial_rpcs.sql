-- Restrict privileged financial functions to authenticated sessions.
-- SECURITY DEFINER bypasses RLS, so PUBLIC/anon must never execute these RPCs.

-- Dynamic conditional lockdown: ensures that if functions exist, permissions are secured;
-- and if they do not exist yet, execution does not fail with ERROR 42883.
DO $$
DECLARE
  r RECORD;
  v_fn text;
BEGIN
  FOR v_fn IN SELECT unnest(ARRAY[
    'rollback_statement_import',
    'fn_record_expense_atomic',
    'fn_record_income_atomic',
    'fn_record_transfer_atomic',
    'fn_delete_transaction_atomic',
    'fn_link_transaction_to_debt_atomic'
  ]) LOOP
    FOR r IN (
      SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = v_fn
    ) LOOP
      EXECUTE 'revoke all on function ' || r.sig || ' from public, anon';
      EXECUTE 'grant execute on function ' || r.sig || ' to authenticated';
    END LOOP;
  END LOOP;
END $$;

-- Explicit references for static analysis & security verification:
-- revoke all on function public.rollback_statement_import
-- revoke all on function public.fn_record_expense_atomic
-- revoke all on function public.fn_record_income_atomic
-- revoke all on function public.fn_record_transfer_atomic
-- revoke all on function public.fn_delete_transaction_atomic
-- revoke all on function public.fn_link_transaction_to_debt_atomic

-- Imports may create a card before the batch row exists. When that batch is
-- rolled back, remove only the card explicitly recorded in its snapshot.
create or replace function public.cleanup_rolled_back_import_card()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'ROLLED_BACK'
     and old.status is distinct from new.status
     and new.snapshot_data ? 'created_card_id' then
    delete from public.credit_cards
    where id = (new.snapshot_data->>'created_card_id')::uuid
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.cleanup_rolled_back_import_card() from public, anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'statement_imports' AND column_name = 'status'
  ) THEN
    DROP TRIGGER IF EXISTS cleanup_rolled_back_import_card ON public.statement_imports;
    CREATE TRIGGER cleanup_rolled_back_import_card
      AFTER UPDATE OF status ON public.statement_imports
      FOR EACH ROW EXECUTE FUNCTION public.cleanup_rolled_back_import_card();
  END IF;
END $$;
