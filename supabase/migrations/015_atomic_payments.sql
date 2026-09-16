-- QA-04: move existing card/debt/receivable payment operations into one transaction.
create or replace function public.fn_record_payment_atomic(
  p_user_id uuid, p_date date, p_amount numeric, p_description text,
  p_type text, p_account_id uuid, p_target_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
  perform id from public.accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı.');
  end if;
  if p_type='Kart Ödemesi' then
    select current_debt into v_remaining from public.credit_cards where id=p_target_id and user_id=p_user_id for update;
  else
    select remaining, type into v_remaining, v_debt_type from public.debts where id=p_target_id and user_id=p_user_id for update;
  end if;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ödeme hedefi bulunamadı.');
  end if;
  if (p_type='Tahsilat' and v_debt_type is distinct from 'Alacak') or (p_type='Borç Ödemesi' and v_debt_type is distinct from 'Borç') then
    return jsonb_build_object('success', false, 'error', 'Borç/alacak türü uyuşmuyor.');
  end if;
  if p_amount > v_remaining then
    return jsonb_build_object('success', false, 'error', 'Tutar kalan borcu aşamaz.');
  end if;
  update public.accounts set balance=balance + case when p_type='Tahsilat' then p_amount else -p_amount end, updated_at=now()
  where id=p_account_id and user_id=p_user_id;
  if p_type='Kart Ödemesi' then
    update public.credit_cards set current_debt=current_debt-p_amount, updated_at=now() where id=p_target_id and user_id=p_user_id;
  else
    update public.debts set remaining=remaining-p_amount, past_payments=coalesce(past_payments,0)+p_amount,
      status=case when remaining-p_amount=0 then 'Kapatıldı' else 'Açık' end, updated_at=now()
    where id=p_target_id and user_id=p_user_id;
  end if;
  insert into public.transactions(user_id,date,type,description,merchant,amount,analysis_group,account_id,card_id,related_debt_id)
  values(p_user_id,p_date,p_type,p_description,coalesce(p_description,p_type),p_amount,'Hariç',p_account_id,
    case when p_type='Kart Ödemesi' then p_target_id else null end,
    case when p_type<>'Kart Ödemesi' then p_target_id else null end) returning id into v_tx_id;
  return jsonb_build_object('success',true,'transaction_id',v_tx_id);
end;
$$;
revoke all on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) to authenticated;
