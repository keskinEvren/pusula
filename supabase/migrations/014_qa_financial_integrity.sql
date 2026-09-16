-- QA-01/02: reject invalid financial references before mutation.
-- Existing RPC signatures and privileges are preserved by CREATE OR REPLACE.

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
  if v_caller_id is null or p_user_id is null or p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_account_id is null and p_card_id is null then
    return jsonb_build_object('success', false, 'error', 'Hesap veya kart seçilmelidir.');
  end if;

  -- Validate and lock every referenced entity BEFORE any mutation.
  if p_account_id is not null and p_card_id is not null then
    return jsonb_build_object('success', false, 'error', 'Tek bir hesap veya kart seçilmelidir.');
  end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id=p_project_id and user_id=p_user_id) then
    return jsonb_build_object('success', false, 'error', 'Proje bulunamadı veya yetkisiz erişim.');
  end if;
  if p_card_id is not null then
    perform id from public.credit_cards where id=p_card_id and user_id=p_user_id for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Kredi kartı bulunamadı veya yetkisiz erişim.');
    end if;
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
  if v_caller_id is null or p_user_id is null or p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_project_id is not null and not exists (select 1 from public.projects where id=p_project_id and user_id=p_user_id) then
    return jsonb_build_object('success', false, 'error', 'Proje bulunamadı veya yetkisiz erişim.');
  end if;
  if p_account_id is null then
    return jsonb_build_object('success', false, 'error', 'Hesap seçilmelidir.');
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
  if v_caller_id is null or p_user_id is null or p_user_id <> v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;

  if p_source_account_id is null or p_target_account_id is null then
    return jsonb_build_object('success', false, 'error', 'Kaynak ve hedef hesap seçilmelidir.');
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
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;
  perform id from public.accounts where id = v_second_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;

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
    user_id, date, type, description, merchant, amount, analysis_group,
    source_account_id, target_account_id
  ) values (
    p_user_id, p_date, 'Transfer', coalesce(p_description, 'Hesaplar Arası Transfer'),
    coalesce(p_description, 'Hesaplar Arası Transfer'),
    p_amount, 'Hariç', p_source_account_id, p_target_account_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

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
  if v_caller_id is null or p_user_id is null or p_user_id <> v_caller_id then
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
  elsif v_tx.type = 'Kart Ödemesi' then
    update public.accounts set balance = balance + v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
    update public.credit_cards set current_debt = current_debt + v_tx.amount, updated_at = now()
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

revoke all on function public.fn_record_expense_atomic(uuid,date,numeric,text,text,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.fn_record_expense_atomic(uuid,date,numeric,text,text,text,uuid,uuid,uuid) to authenticated;

revoke all on function public.fn_record_income_atomic(uuid,date,numeric,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_income_atomic(uuid,date,numeric,text,text,text,uuid,uuid) to authenticated;

revoke all on function public.fn_record_transfer_atomic(uuid,date,numeric,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_transfer_atomic(uuid,date,numeric,text,uuid,uuid) to authenticated;

revoke all on function public.fn_delete_transaction_atomic(uuid,uuid) from public, anon;
grant execute on function public.fn_delete_transaction_atomic(uuid,uuid) to authenticated;

