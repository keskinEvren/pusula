-- ==============================================================================
-- 🧭 PUSULA — Migration 008: Security Hardening & Financial Integrity
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SECURE ROLLBACK RPC (F08)
-- ------------------------------------------------------------------------------
create or replace function public.rollback_statement_import(
  p_import_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
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
  v_debt_elem jsonb;
begin
  -- Güvenlik: auth.uid() varsa parametre ile eşleşmeli
  v_caller_id := auth.uid();
  if v_caller_id is not null and p_user_id is not null and v_caller_id <> p_user_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim: Kullanıcı kimliği doğrulanamadı.');
  end if;

  if p_user_id is null then
    p_user_id := v_caller_id;
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Kullanıcı kimliği bulunamadı.');
  end if;

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

  -- 3. Revert Credit Card side effects if applicable (verifying ownership)
  v_card_id := v_import.card_id;
  if v_card_id is not null then
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
      where id = v_card_id and user_id = p_user_id;
    end if;

    -- Yalnızca bu import'a ait card_statements satırlarını sil (bağlantısız ekstreler korunur)
    delete from public.card_statements
    where import_id = p_import_id and user_id = p_user_id;
    get diagnostics v_deleted_stmt_count = row_count;
  end if;

  -- 4. Revert Bank Account side effects if applicable (verifying ownership)
  if v_snapshot ? 'previous_account_state' then
    v_account_id := (v_snapshot->'previous_account_state'->>'account_id')::uuid;
    v_prev_acc_balance := (v_snapshot->'previous_account_state'->>'balance')::numeric;
    if v_account_id is not null and v_prev_acc_balance is not null then
      update public.accounts
      set balance = v_prev_acc_balance
      where id = v_account_id and user_id = p_user_id;
    end if;
  end if;

  -- 5. Revert auto-discovered subscriptions (verifying ownership)
  if v_snapshot ? 'created_subscription_ids' then
    delete from public.subscriptions
    where id in (
      select jsonb_array_elements_text(v_snapshot->'created_subscription_ids')::uuid
    ) and user_id = p_user_id;
  end if;

  -- 6. Revert any debts modified during bank account import (if tracked in snapshot)
  if v_snapshot ? 'previous_debt_states' then
    for v_debt_elem in select * from jsonb_array_elements(v_snapshot->'previous_debt_states')
    loop
      update public.debts
      set
        remaining = (v_debt_elem->>'remaining')::numeric,
        past_payments = (v_debt_elem->>'past_payments')::numeric,
        status = (v_debt_elem->>'status')::text
      where id = (v_debt_elem->>'debt_id')::uuid and user_id = p_user_id;
    end loop;
  end if;

  -- 7. Delete all transactions belonging to this import
  delete from public.transactions
  where import_id = p_import_id and user_id = p_user_id;
  get diagnostics v_deleted_tx_count = row_count;

  -- 8. Mark import as ROLLED_BACK
  update public.statement_imports
  set
    status = 'ROLLED_BACK',
    rolled_back_at = now()
  where id = p_import_id and user_id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'import_id', p_import_id,
    'deleted_transactions', v_deleted_tx_count,
    'deleted_statements', v_deleted_stmt_count
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. SECURE RLS POLICIES — REMOVE 'local' TENANT BYPASS (F09)
-- ------------------------------------------------------------------------------
-- Dreams
drop policy if exists "Users can view their own dreams" on public.dreams;
drop policy if exists "Users can insert their own dreams" on public.dreams;
drop policy if exists "Users can update their own dreams" on public.dreams;
drop policy if exists "Users can delete their own dreams" on public.dreams;

create policy "Users can view their own dreams"
  on public.dreams for select
  using (auth.uid()::text = user_id);

create policy "Users can insert their own dreams"
  on public.dreams for insert
  with check (auth.uid()::text = user_id);

create policy "Users can update their own dreams"
  on public.dreams for update
  using (auth.uid()::text = user_id);

create policy "Users can delete their own dreams"
  on public.dreams for delete
  using (auth.uid()::text = user_id);

-- Routines & Logs
drop policy if exists "Users can manage their own routines" on public.routines;
drop policy if exists "Users can manage their own routine logs" on public.routine_logs;

create policy "Users can manage their own routines"
  on public.routines for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users can manage their own routine logs"
  on public.routine_logs for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Journal Entries
drop policy if exists "Users can manage their own journal entries" on public.journal_entries;

create policy "Users can manage their own journal entries"
  on public.journal_entries for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- ------------------------------------------------------------------------------
-- 3. ATOMIC FINANCIAL MUTATION RPCS (F01, F17)
-- ------------------------------------------------------------------------------

-- 3.1 Harcama Kaydet (Atomik)
create or replace function public.fn_record_expense_atomic(
  p_user_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_analysis_group text default 'Kişisel',
  p_merchant text default null,
  p_account_id uuid default null,
  p_card_id uuid default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_tx_id uuid;
  v_acc_balance numeric;
begin
  if v_caller_id is not null and p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_account_id is null and p_card_id is null then
    return jsonb_build_object('success', false, 'error', 'Hesap veya kart seçilmelidir.');
  end if;

  -- Vadesiz hesaptan harcama: Satır kilidi ve bakiye düşümü
  if p_account_id is not null then
    select balance into v_acc_balance
    from public.accounts
    where id = p_account_id and user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
    end if;

    update public.accounts
    set balance = balance - p_amount, updated_at = now()
    where id = p_account_id and user_id = p_user_id;
  end if;

  -- Kredi kartı manuel harcaması ise current_debt artırımı
  if p_card_id is not null then
    update public.credit_cards
    set current_debt = current_debt + p_amount, updated_at = now()
    where id = p_card_id and user_id = p_user_id;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Kredi kartı bulunamadı veya yetkisiz erişim.');
    end if;
  end if;

  -- Transaction kaydı
  insert into public.transactions (
    user_id, date, type, description, amount, analysis_group,
    merchant, account_id, card_id, project_id
  ) values (
    p_user_id, p_date, 'Harcama', p_description, p_amount, coalesce(p_analysis_group, 'Kişisel'),
    p_merchant, p_account_id, p_card_id, p_project_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

-- 3.2 Gelir Kaydet (Atomik)
create or replace function public.fn_record_income_atomic(
  p_user_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_analysis_group text default 'Kişisel',
  p_merchant text default null,
  p_account_id uuid default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_tx_id uuid;
begin
  if v_caller_id is not null and p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_account_id is not null then
    perform id from public.accounts
    where id = p_account_id and user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
    end if;

    update public.accounts
    set balance = balance + p_amount, updated_at = now()
    where id = p_account_id and user_id = p_user_id;
  end if;

  insert into public.transactions (
    user_id, date, type, description, amount, analysis_group,
    merchant, account_id, project_id
  ) values (
    p_user_id, p_date, 'Gelir', p_description, p_amount, coalesce(p_analysis_group, 'Kişisel'),
    p_merchant, p_account_id, p_project_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

-- 3.3 Transfer Kaydet (Atomik & Deadlock Korumalı)
create or replace function public.fn_record_transfer_atomic(
  p_user_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_source_account_id uuid,
  p_target_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_tx_id uuid;
  v_first_id uuid;
  v_second_id uuid;
begin
  if v_caller_id is not null and p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_source_account_id = p_target_account_id then
    return jsonb_build_object('success', false, 'error', 'Aynı hesaba transfer yapılamaz.');
  end if;

  -- Deadlock önleyici sıralı kilit (canonical ordering)
  if p_source_account_id < p_target_account_id then
    v_first_id := p_source_account_id;
    v_second_id := p_target_account_id;
  else
    v_first_id := p_target_account_id;
    v_second_id := p_source_account_id;
  end if;

  perform id from public.accounts where id = v_first_id and user_id = p_user_id for update;
  perform id from public.accounts where id = v_second_id and user_id = p_user_id for update;

  -- Bakiye güncellemeleri
  update public.accounts
  set balance = balance - p_amount, updated_at = now()
  where id = p_source_account_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Kaynak hesap bulunamadı.');
  end if;

  update public.accounts
  set balance = balance + p_amount, updated_at = now()
  where id = p_target_account_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Hedef hesap bulunamadı.');
  end if;

  insert into public.transactions (
    user_id, date, type, description, amount, analysis_group,
    source_account_id, target_account_id
  ) values (
    p_user_id, p_date, 'Transfer', coalesce(p_description, 'Hesaplar Arası Transfer'),
    p_amount, 'Hariç', p_source_account_id, p_target_account_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

-- 3.4 İşlem Sil (Atomik & Bakiye Geri Alma)
create or replace function public.fn_delete_transaction_atomic(
  p_tx_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
begin
  if v_caller_id is not null and p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  select * into v_tx
  from public.transactions
  where id = p_tx_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'İşlem bulunamadı.');
  end if;

  -- Türüne göre ters işlem uygula
  if v_tx.type = 'Harcama' and v_tx.account_id is not null then
    update public.accounts
    set balance = balance + v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
  elsif v_tx.type = 'Harcama' and v_tx.card_id is not null then
    update public.credit_cards
    set current_debt = greatest(0, current_debt - v_tx.amount), updated_at = now()
    where id = v_tx.card_id and user_id = p_user_id;
  elsif v_tx.type = 'Gelir' and v_tx.account_id is not null then
    update public.accounts
    set balance = balance - v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
  elsif v_tx.type = 'Transfer' then
    if v_tx.source_account_id is not null then
      update public.accounts
      set balance = balance + v_tx.amount, updated_at = now()
      where id = v_tx.source_account_id and user_id = p_user_id;
    end if;
    if v_tx.target_account_id is not null then
      update public.accounts
      set balance = balance - v_tx.amount, updated_at = now()
      where id = v_tx.target_account_id and user_id = p_user_id;
    end if;
  elsif (v_tx.type in ('Tahsilat', 'Borç Ödemesi')) and v_tx.related_debt_id is not null then
    -- Borç bakiyesini eski haline getir
    update public.debts
    set
      remaining = remaining + v_tx.amount,
      past_payments = greatest(0, past_payments - v_tx.amount),
      status = 'Açık',
      updated_at = now()
    where id = v_tx.related_debt_id and user_id = p_user_id;

    if v_tx.account_id is not null then
      if v_tx.type = 'Tahsilat' then
        update public.accounts set balance = balance - v_tx.amount where id = v_tx.account_id and user_id = p_user_id;
      else
        update public.accounts set balance = balance + v_tx.amount where id = v_tx.account_id and user_id = p_user_id;
      end if;
    end if;
  end if;

  delete from public.transactions where id = p_tx_id and user_id = p_user_id;

  return jsonb_build_object('success', true);
end;
$$;

-- 3.5 Borç Eşleme (Atomik & Idempotent) (F17)
create or replace function public.fn_link_transaction_to_debt_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_debt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_debt public.debts%rowtype;
  v_old_debt public.debts%rowtype;
  v_is_receivable boolean;
  v_new_type text;
  v_merchant_tag text;
  v_new_past numeric;
  v_new_remaining numeric;
  v_new_status text;
begin
  if v_caller_id is not null and p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  -- 1. Oku ve Kilitle
  select * into v_tx
  from public.transactions
  where id = p_transaction_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Hareket bulunamadı.');
  end if;

  -- F17 Idempotency: Eğer zaten bu borca bağlıysa işlem yapma, başarı dön
  if v_tx.related_debt_id = p_debt_id then
    return jsonb_build_object('success', true, 'already_linked', true);
  end if;

  select * into v_debt
  from public.debts
  where id = p_debt_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Borç/Alacak kaydı bulunamadı.');
  end if;

  -- Eğer önceden başka bir borca bağlıysa, eski borcun bakiyesini geri ver
  if v_tx.related_debt_id is not null and v_tx.related_debt_id <> p_debt_id then
    select * into v_old_debt
    from public.debts
    where id = v_tx.related_debt_id and user_id = p_user_id
    for update;

    if found then
      update public.debts
      set
        remaining = v_old_debt.remaining + v_tx.amount,
        past_payments = greatest(0, v_old_debt.past_payments - v_tx.amount),
        status = 'Açık',
        updated_at = now()
      where id = v_old_debt.id;
    end if;
  end if;

  -- Yeni borç hesaplamaları
  v_is_receivable := (v_debt.type = 'Alacak');
  v_new_type := case when v_is_receivable then 'Tahsilat' else 'Borç Ödemesi' end;
  v_merchant_tag := case when v_is_receivable
    then 'Tahsilat: ' || coalesce(v_debt.person_or_entity, '')
    else 'Ödeme: ' || coalesce(v_debt.person_or_entity, '')
  end;

  v_new_past := v_debt.past_payments + v_tx.amount;
  v_new_remaining := greatest(0, v_debt.remaining - v_tx.amount);
  v_new_status := case when v_new_remaining <= 0 then 'Kapatıldı' else 'Açık' end;

  update public.debts
  set
    past_payments = v_new_past,
    remaining = v_new_remaining,
    status = v_new_status,
    updated_at = now()
  where id = v_debt.id;

  update public.transactions
  set
    type = v_new_type,
    merchant = v_merchant_tag,
    analysis_group = 'Hariç',
    related_debt_id = p_debt_id
  where id = v_tx.id;

  return jsonb_build_object('success', true);
end;
$$;
