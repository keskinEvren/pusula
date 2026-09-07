-- Migration 002: Import Batch Lifecycle, Hash Tracking and Atomic Rollback

-- 1. Enhance statement_imports table with batch metadata
alter table public.statement_imports
  add column if not exists file_hash text,
  add column if not exists status text default 'COMPLETED' check (status in ('PROCESSING', 'COMPLETED', 'ROLLED_BACK', 'FAILED')),
  add column if not exists import_type text default 'credit_card' check (import_type in ('credit_card', 'bank_account')),
  add column if not exists rolled_back_at timestamptz,
  add column if not exists snapshot_data jsonb default '{}'::jsonb;

-- 2. Add import_id foreign key to card_statements
alter table public.card_statements
  add column if not exists import_id uuid references public.statement_imports(id) on delete set null;

-- 3. Backfill existing records
update public.statement_imports
set status = 'COMPLETED'
where status is null;

-- 4. Create performance indexes
create index if not exists idx_transactions_import_id on public.transactions(import_id);
create index if not exists idx_card_statements_import_id on public.card_statements(import_id);
create index if not exists idx_statement_imports_user_id on public.statement_imports(user_id);
create index if not exists idx_statement_imports_file_hash on public.statement_imports(file_hash);
create index if not exists idx_statement_imports_status on public.statement_imports(status);

-- 5. Atomic Rollback RPC Function
create or replace function public.rollback_statement_import(
  p_import_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_import public.statement_imports%rowtype;
  v_deleted_tx_count int := 0;
  v_deleted_stmt_count int := 0;
  v_snapshot jsonb;
  v_card_id uuid;
  v_account_id uuid;
  v_prev_card_debt numeric;
  v_prev_stmt_debt numeric;
  v_prev_min_payment numeric;
  v_prev_stmt_date date;
  v_prev_due_date date;
  v_prev_acc_balance numeric;
begin
  -- 1. Verify existence and ownership
  select * into v_import
  from public.statement_imports
  where id = p_import_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Ekstre kaydı bulunamadı veya yetkisiz erişim.');
  end if;

  -- 2. Check if already rolled back
  if v_import.status = 'ROLLED_BACK' then
    return jsonb_build_object('success', false, 'error', 'Bu ekstre daha önce geri alınmış.');
  end if;

  v_snapshot := coalesce(v_import.snapshot_data, '{}'::jsonb);

  -- 3. Revert Credit Card side effects if applicable
  v_card_id := v_import.card_id;
  if v_card_id is not null then
    -- Check if previous card values exist in snapshot
    if v_snapshot ? 'previous_card_state' then
      v_prev_card_debt := (v_snapshot->'previous_card_state'->>'current_debt')::numeric;
      v_prev_stmt_debt := (v_snapshot->'previous_card_state'->>'statement_debt')::numeric;
      v_prev_min_payment := (v_snapshot->'previous_card_state'->>'minimum_payment')::numeric;
      v_prev_stmt_date := (v_snapshot->'previous_card_state'->>'statement_date')::date;
      v_prev_due_date := (v_snapshot->'previous_card_state'->>'due_date')::date;

      update public.credit_cards
      set
        current_debt = coalesce(v_prev_card_debt, current_debt),
        statement_debt = coalesce(v_prev_stmt_debt, statement_debt),
        minimum_payment = coalesce(v_prev_min_payment, minimum_payment),
        statement_date = v_prev_stmt_date,
        due_date = v_prev_due_date
      where id = v_card_id;
    end if;

    -- Delete card_statements created for this import
    delete from public.card_statements
    where import_id = p_import_id or (card_id = v_card_id and statement_date = v_import.statement_date);
    get diagnostics v_deleted_stmt_count = row_count;
  end if;

  -- 4. Revert Bank Account side effects if applicable
  if v_snapshot ? 'previous_account_state' then
    v_account_id := (v_snapshot->'previous_account_state'->>'account_id')::uuid;
    v_prev_acc_balance := (v_snapshot->'previous_account_state'->>'balance')::numeric;
    if v_account_id is not null and v_prev_acc_balance is not null then
      update public.accounts
      set balance = v_prev_acc_balance
      where id = v_account_id;
    end if;
  end if;

  -- 5. Revert auto-discovered subscriptions if tracked
  if v_snapshot ? 'created_subscription_ids' then
    delete from public.subscriptions
    where id in (
      select jsonb_array_elements_text(v_snapshot->'created_subscription_ids')::uuid
    );
  end if;

  -- 6. Delete all transactions belonging to this import
  delete from public.transactions
  where import_id = p_import_id and user_id = p_user_id;
  get diagnostics v_deleted_tx_count = row_count;

  -- 7. Mark import as ROLLED_BACK
  update public.statement_imports
  set
    status = 'ROLLED_BACK',
    rolled_back_at = now()
  where id = p_import_id;

  return jsonb_build_object(
    'success', true,
    'import_id', p_import_id,
    'deleted_transactions', v_deleted_tx_count,
    'deleted_statements', v_deleted_stmt_count
  );
end;
$$;
