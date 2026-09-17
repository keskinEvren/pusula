-- Restore RPCs that may be absent in databases upgraded from partial legacy
-- migrations, and keep manual debt/account changes in one transaction.

create or replace function public.fn_record_payment_atomic(
  p_user_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_type text,
  p_account_id uuid,
  p_target_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx_id uuid;
  v_remaining numeric;
  v_debt_type text;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;
  if p_type is null or p_type not in ('Kart Ödemesi','Borç Ödemesi','Tahsilat') then
    return jsonb_build_object('success', false, 'error', 'Geçersiz ödeme türü.');
  end if;
  if p_type = 'Kart Ödemesi' and p_account_id is null then
    return jsonb_build_object('success', false, 'error', 'Kart ödemesi için kaynak hesap seçilmelidir.');
  end if;

  if p_account_id is not null then
    perform id from public.accounts
    where id=p_account_id and user_id=p_user_id
    for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı.');
    end if;
  end if;

  if p_type='Kart Ödemesi' then
    select current_debt into v_remaining
    from public.credit_cards
    where id=p_target_id and user_id=p_user_id
    for update;
  else
    select remaining, type into v_remaining, v_debt_type
    from public.debts
    where id=p_target_id and user_id=p_user_id
    for update;
  end if;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ödeme hedefi bulunamadı.');
  end if;
  if (p_type='Tahsilat' and v_debt_type is distinct from 'Alacak')
     or (p_type='Borç Ödemesi' and v_debt_type is distinct from 'Borç') then
    return jsonb_build_object('success', false, 'error', 'Borç/alacak türü uyuşmuyor.');
  end if;
  if p_amount > v_remaining then
    return jsonb_build_object('success', false, 'error', 'Tutar kalan borcu aşamaz.');
  end if;

  if p_account_id is not null then
    update public.accounts
    set balance=balance + case when p_type='Tahsilat' then p_amount else -p_amount end,
        updated_at=now()
    where id=p_account_id and user_id=p_user_id;
  end if;

  if p_type='Kart Ödemesi' then
    update public.credit_cards
    set current_debt=current_debt-p_amount, updated_at=now()
    where id=p_target_id and user_id=p_user_id;
  else
    update public.debts
    set remaining=remaining-p_amount,
        past_payments=coalesce(past_payments,0)+p_amount,
        status=case when remaining-p_amount=0 then 'Kapatıldı' else 'Açık' end,
        updated_at=now()
    where id=p_target_id and user_id=p_user_id;
  end if;

  -- Without an account this is an explicit table-only adjustment. With an
  -- account, persist the corresponding ledger movement as part of this RPC.
  if p_account_id is not null then
    insert into public.transactions(
      user_id,date,type,description,merchant,amount,analysis_group,
      account_id,card_id,related_debt_id
    ) values (
      p_user_id,p_date,p_type,p_description,coalesce(p_description,p_type),p_amount,'Hariç',
      p_account_id,
      case when p_type='Kart Ödemesi' then p_target_id else null end,
      case when p_type<>'Kart Ödemesi' then p_target_id else null end
    ) returning id into v_tx_id;
  end if;

  return jsonb_build_object('success',true,'transaction_id',v_tx_id);
end;
$$;

create or replace function public.fn_link_transaction_to_debt_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_debt_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
  v_debt public.debts%rowtype;
  v_old_debt public.debts%rowtype;
  v_is_receivable boolean;
  v_new_type text;
  v_merchant_tag text;
begin
  if auth.uid() is null or p_user_id is null or p_user_id <> auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;

  select * into v_tx from public.transactions
  where id=p_transaction_id and user_id=p_user_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hareket bulunamadı.');
  end if;

  if v_tx.related_debt_id = p_debt_id then
    return jsonb_build_object('success', true, 'already_linked', true, 'transaction_id',v_tx.id);
  end if;

  select * into v_debt from public.debts
  where id=p_debt_id and user_id=p_user_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Borç/Alacak kaydı bulunamadı.');
  end if;

  v_is_receivable := (v_debt.type='Alacak');
  if (v_is_receivable and v_tx.type not in ('Gelir','Tahsilat'))
     or (not v_is_receivable and v_tx.type not in ('Harcama','Borç Ödemesi')) then
    return jsonb_build_object('success', false, 'error', 'Hareket yönü borç/alacak türüyle uyuşmuyor.');
  end if;
  if v_tx.amount > v_debt.remaining then
    return jsonb_build_object('success', false, 'error', 'Hareket tutarı kalan borç/alacağı aşamaz.');
  end if;

  if v_tx.related_debt_id is not null and v_tx.related_debt_id <> p_debt_id then
    select * into v_old_debt from public.debts
    where id=v_tx.related_debt_id and user_id=p_user_id
    for update;
    if found then
      update public.debts
      set remaining=v_old_debt.remaining+v_tx.amount,
          past_payments=greatest(0,coalesce(v_old_debt.past_payments,0)-v_tx.amount),
          status='Açık',updated_at=now()
      where id=v_old_debt.id;
    end if;
  end if;

  v_new_type := case when v_is_receivable then 'Tahsilat' else 'Borç Ödemesi' end;
  v_merchant_tag := case when v_is_receivable
    then 'Tahsilat: ' || coalesce(v_debt.person_or_entity,'')
    else 'Ödeme: ' || coalesce(v_debt.person_or_entity,'') end;

  update public.debts
  set past_payments=coalesce(past_payments,0)+v_tx.amount,
      remaining=remaining-v_tx.amount,
      status=case when remaining-v_tx.amount=0 then 'Kapatıldı' else 'Açık' end,
      updated_at=now()
  where id=v_debt.id;

  update public.transactions
  set type=v_new_type,merchant=v_merchant_tag,analysis_group='Hariç',related_debt_id=p_debt_id,
      updated_at=now()
  where id=v_tx.id;

  return jsonb_build_object('success',true,'transaction_id',v_tx.id);
end;
$$;

revoke all on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) to authenticated;
revoke all on function public.fn_link_transaction_to_debt_atomic(uuid,uuid,uuid) from public, anon;
grant execute on function public.fn_link_transaction_to_debt_atomic(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
