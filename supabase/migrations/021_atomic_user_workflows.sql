-- Atomicity repairs for user workflows that previously used multiple PostgREST mutations.

alter table public.transactions
  add column if not exists related_investment_id uuid references public.investments(id) on delete set null,
  add column if not exists investment_quantity_delta numeric(18,6),
  add column if not exists investment_unit_price numeric(14,4);

create index if not exists idx_transactions_related_investment
  on public.transactions(related_investment_id);

create or replace function public.fn_unlink_transaction_from_debt_atomic(
  p_user_id uuid,
  p_transaction_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_tx public.transactions%rowtype; v_debt public.debts%rowtype;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  select * into v_tx from public.transactions where id=p_transaction_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Hareket bulunamadı.'); end if;
  if v_tx.related_debt_id is not null then
    select * into v_debt from public.debts where id=v_tx.related_debt_id and user_id=p_user_id for update;
    if not found then return jsonb_build_object('success',false,'error','Bağlı borç/alacak bulunamadı.'); end if;
    update public.debts set
      past_payments=greatest(0,coalesce(past_payments,0)-v_tx.amount),
      remaining=remaining+v_tx.amount,status='Açık',updated_at=now()
    where id=v_debt.id;
  end if;
  update public.transactions set
    type=case when type='Tahsilat' then 'Gelir' when type='Borç Ödemesi' then 'Harcama' else type end,
    description=regexp_replace(description,'\s*\[DEBT:[a-fA-F0-9-]+\]','','gi'),
    analysis_group='Kişisel',related_debt_id=null,updated_at=now()
  where id=v_tx.id;
  return jsonb_build_object('success',true,'transaction_id',v_tx.id);
end $$;

create or replace function public.fn_link_transaction_to_investment_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_investment_id uuid,
  p_added_qty numeric default null,
  p_unit_price numeric default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_tx public.transactions%rowtype; v_inv public.investments%rowtype; v_new_qty numeric; v_new_cost numeric;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  select * into v_tx from public.transactions where id=p_transaction_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Hareket bulunamadı.'); end if;
  select * into v_inv from public.investments where id=p_investment_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Yatırım bulunamadı.'); end if;
  if v_tx.related_investment_id is not null then
    return jsonb_build_object('success',false,'error','Hareket zaten bir yatırıma bağlı.');
  end if;
  if (p_added_qty is null) <> (p_unit_price is null)
     or (p_added_qty is not null and (p_added_qty <= 0 or p_unit_price <= 0)) then
    return jsonb_build_object('success',false,'error','Miktar ve birim fiyat birlikte, sıfırdan büyük olmalıdır.');
  end if;
  if p_added_qty is not null then
    v_new_qty := v_inv.quantity+p_added_qty;
    v_new_cost := round(((v_inv.quantity*v_inv.unit_cost)+(p_added_qty*p_unit_price))/v_new_qty,4);
    update public.investments set quantity=v_new_qty,unit_cost=v_new_cost,current_price=p_unit_price,
      last_price_updated_at=now(),updated_at=now() where id=v_inv.id;
  end if;
  update public.transactions set type='Transfer',analysis_group='Hariç',
    description=trim(regexp_replace(description,'\s*\[INV:[^]]+\]','','gi'))||' [INV:'||p_investment_id::text||']',
    related_investment_id=p_investment_id,investment_quantity_delta=p_added_qty,
    investment_unit_price=p_unit_price,updated_at=now() where id=v_tx.id;
  return jsonb_build_object('success',true,'transaction_id',v_tx.id);
end $$;

create or replace function public.fn_unlink_transaction_from_investment_atomic(
  p_user_id uuid,
  p_transaction_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_tx public.transactions%rowtype; v_inv public.investments%rowtype; v_new_qty numeric; v_total numeric;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  select * into v_tx from public.transactions where id=p_transaction_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Hareket bulunamadı.'); end if;
  if v_tx.related_investment_id is not null and v_tx.investment_quantity_delta is not null then
    select * into v_inv from public.investments where id=v_tx.related_investment_id and user_id=p_user_id for update;
    if not found then return jsonb_build_object('success',false,'error','Bağlı yatırım bulunamadı.'); end if;
    v_new_qty := v_inv.quantity-v_tx.investment_quantity_delta;
    if v_new_qty < 0 then return jsonb_build_object('success',false,'error','Yatırım miktarı bağlantıyı geri almaya uygun değil.'); end if;
    v_total := (v_inv.quantity*v_inv.unit_cost)-(v_tx.investment_quantity_delta*v_tx.investment_unit_price);
    update public.investments set quantity=v_new_qty,
      unit_cost=case when v_new_qty=0 then 0 else round(greatest(0,v_total)/v_new_qty,4) end,
      updated_at=now() where id=v_inv.id;
  end if;
  update public.transactions set type='Harcama',analysis_group='Kişisel',
    description=trim(regexp_replace(description,'\s*\[INV:[^]]+\]','','gi')),
    related_investment_id=null,investment_quantity_delta=null,investment_unit_price=null,updated_at=now()
  where id=v_tx.id;
  return jsonb_build_object('success',true,'transaction_id',v_tx.id);
end $$;

create or replace function public.fn_promote_idea_to_project_atomic(
  p_user_id uuid,
  p_idea_id uuid,
  p_slug text,
  p_budget_limit numeric default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_idea public.ideas%rowtype; v_project_id uuid;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  if nullif(trim(p_slug),'') is null then return jsonb_build_object('success',false,'error','Proje adresi boş olamaz.'); end if;
  select * into v_idea from public.ideas where id=p_idea_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Fikir bulunamadı.'); end if;
  if v_idea.promoted_project_id is not null then
    return jsonb_build_object('success',true,'project_id',v_idea.promoted_project_id,'already_promoted',true);
  end if;
  insert into public.projects(user_id,name,slug,description,status,budget_limit)
  values(p_user_id,v_idea.title,trim(p_slug),v_idea.description,'Planlama',p_budget_limit)
  returning id into v_project_id;
  update public.ideas set status='promoted',promoted_project_id=v_project_id,updated_at=now() where id=v_idea.id;
  return jsonb_build_object('success',true,'project_id',v_project_id);
end $$;

revoke all on function public.fn_unlink_transaction_from_debt_atomic(uuid,uuid) from public,anon;
grant execute on function public.fn_unlink_transaction_from_debt_atomic(uuid,uuid) to authenticated;
revoke all on function public.fn_link_transaction_to_investment_atomic(uuid,uuid,uuid,numeric,numeric) from public,anon;
grant execute on function public.fn_link_transaction_to_investment_atomic(uuid,uuid,uuid,numeric,numeric) to authenticated;
revoke all on function public.fn_unlink_transaction_from_investment_atomic(uuid,uuid) from public,anon;
grant execute on function public.fn_unlink_transaction_from_investment_atomic(uuid,uuid) to authenticated;
revoke all on function public.fn_promote_idea_to_project_atomic(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.fn_promote_idea_to_project_atomic(uuid,uuid,text,numeric) to authenticated;

notify pgrst, 'reload schema';
