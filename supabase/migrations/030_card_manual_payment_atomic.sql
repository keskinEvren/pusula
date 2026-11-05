-- Migration 030: Card Manual & Intermediate Payments Atomic RPC
-- Allows fn_record_payment_atomic to process 'Kart Ödemesi' with p_account_id IS NULL (decoupled bank account).
-- Atomically decrements credit_cards.current_debt and increments card_statements.payments on the latest statement.

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
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or round(p_amount, 2) <= 0 then
    return jsonb_build_object('success', false, 'error', 'Tutar sıfırdan büyük olmalıdır.');
  end if;
  if p_type is null or p_type not in ('Kart Ödemesi','Borç Ödemesi','Tahsilat') then
    return jsonb_build_object('success', false, 'error', 'Geçersiz ödeme türü.');
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
  if round(p_amount, 2) > v_remaining then
    return jsonb_build_object('success', false, 'error', 'Tutar kalan borcu aşamaz.');
  end if;

  if p_account_id is not null then
    update public.accounts
    set balance=balance + case when p_type='Tahsilat' then round(p_amount, 2) else -round(p_amount, 2) end,
        updated_at=now()
    where id=p_account_id and user_id=p_user_id;
  end if;

  if p_type='Kart Ödemesi' then
    update public.credit_cards
    set current_debt=current_debt-round(p_amount, 2), updated_at=now()
    where id=p_target_id and user_id=p_user_id;

    update public.card_statements
    set payments = coalesce(payments, 0) + round(p_amount, 2)
    where id = (
      select id from public.card_statements
      where card_id = p_target_id
      order by statement_date desc, created_at desc, id desc
      limit 1
    );
  else
    update public.debts
    set remaining=remaining-round(p_amount, 2),
        past_payments=coalesce(past_payments,0)+round(p_amount, 2),
        status=case when remaining-round(p_amount, 2)=0 then 'Kapatıldı' else 'Açık' end,
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
      p_user_id,p_date,p_type,p_description,coalesce(p_description,p_type),round(p_amount, 2),'Hariç',
      p_account_id,
      case when p_type='Kart Ödemesi' then p_target_id else null end,
      case when p_type<>'Kart Ödemesi' then p_target_id else null end
    ) returning id into v_tx_id;
  end if;

  return jsonb_build_object('success',true,'transaction_id',v_tx_id);
end;
$$;

revoke all on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
