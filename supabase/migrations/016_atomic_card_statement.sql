-- QA-06: an existing statement-entry action must save summary and card together.
create or replace function public.fn_add_card_statement_atomic(p_statement jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_card public.credit_cards%rowtype;
  v_statement public.card_statements%rowtype;
  v_previous numeric;
  v_amount numeric := (p_statement->>'period_debt')::numeric;
  v_date date := (p_statement->>'statement_date')::date;
begin
  if auth.uid() is null then raise exception 'Yetkisiz erişim.'; end if;
  select * into v_card from public.credit_cards where id=(p_statement->>'card_id')::uuid and user_id=auth.uid() for update;
  if not found then raise exception 'Kart bulunamadı.'; end if;
  if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount < 0 or v_date is null then
    raise exception 'Geçersiz ekstre tutarı veya tarihi.';
  end if;
  if exists (select 1 from public.card_statements where card_id=v_card.id and statement_date=v_date) then
    raise exception 'Bu tarih için ekstre zaten kayıtlı.';
  end if;
  select period_debt into v_previous from public.card_statements where card_id=v_card.id and statement_date<v_date order by statement_date desc limit 1;
  insert into public.card_statements(card_id,statement_date,period_debt,minimum,payments,spending,cash_advance,interest_fees,due_date,prev_debt,change_amount,change_pct)
  values(v_card.id,v_date,v_amount,coalesce((p_statement->>'minimum')::numeric,0),coalesce((p_statement->>'payments')::numeric,0),
    coalesce((p_statement->>'spending')::numeric,0),coalesce((p_statement->>'cash_advance')::numeric,0),coalesce((p_statement->>'interest_fees')::numeric,0),
    nullif(p_statement->>'due_date','')::date,v_previous,v_amount-v_previous,
    case when v_previous>0 then (v_amount-v_previous)/v_previous else null end)
  returning * into v_statement;
  -- Historical entries must not replace the newest card summary.
  if v_card.statement_date is null or v_date>=v_card.statement_date then
    update public.credit_cards set statement_debt=v_amount,current_debt=v_amount,minimum_payment=v_statement.minimum,
      statement_date=v_date,due_date=v_statement.due_date,updated_at=now() where id=v_card.id;
  end if;
  return jsonb_build_object('success',true,'statement',to_jsonb(v_statement));
end;
$$;
revoke all on function public.fn_add_card_statement_atomic(jsonb) from public, anon;
grant execute on function public.fn_add_card_statement_atomic(jsonb) to authenticated;
