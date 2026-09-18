-- Replace-mode vault restore in one database transaction. A raised error rolls
-- back both the cleanup and every insert.
create or replace function public.fn_restore_vault_replace_atomic(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_key text; v_row jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('success',false,'error','Geçersiz kasa verisi.');
  end if;

  -- Never allow a crafted backup to write rows for another user. Tables with
  -- text user_id columns are covered by the same textual comparison.
  foreach v_key in array array[
    'accounts','credit_cards','transactions','debts','subscriptions',
    'statement_imports','merchant_mappings','investments','projects','project_tasks','ideas',
    'agenda_items','dreams','routines','routine_logs','journal_entries','credentials'
  ] loop
    for v_row in select value from jsonb_array_elements(coalesce(p_data->v_key,'[]'::jsonb)) loop
      if v_row->>'user_id' is distinct from v_user_id::text then
        return jsonb_build_object('success',false,'error',v_key||' içinde başka kullanıcıya ait kayıt var.');
      end if;
    end loop;
  end loop;

  -- SECURITY DEFINER bypasses RLS, therefore every foreign key in the backup
  -- must resolve to another row in the same, already owner-validated backup.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data->'card_statements','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'credit_cards','[]'::jsonb)) x where x->>'id'=r->>'card_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'project_tasks','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x where x->>'id'=r->>'project_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'routine_logs','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'routines','[]'::jsonb)) x where x->>'id'=r->>'routine_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'statement_imports','[]'::jsonb)) r
      where nullif(r->>'card_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'credit_cards','[]'::jsonb)) x where x->>'id'=r->>'card_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'debts','[]'::jsonb)) r
      where nullif(r->>'linked_account_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'accounts','[]'::jsonb)) x where x->>'id'=r->>'linked_account_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'subscriptions','[]'::jsonb)) r
      where nullif(r->>'project_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x where x->>'id'=r->>'project_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'merchant_mappings','[]'::jsonb)) r
      where nullif(r->>'default_project_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x where x->>'id'=r->>'default_project_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'ideas','[]'::jsonb)) r
      where nullif(r->>'promoted_project_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x where x->>'id'=r->>'promoted_project_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'agenda_items','[]'::jsonb)) r
      where nullif(r->>'project_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x where x->>'id'=r->>'project_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'routines','[]'::jsonb)) r
      where nullif(r->>'dream_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'dreams','[]'::jsonb)) x where x->>'id'=r->>'dream_id')
  ) then
    return jsonb_build_object('success',false,'error','Yedek başka kullanıcıya veya eksik bir üst kayda referans veriyor.');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_data->'transactions','[]'::jsonb)) r
    cross join lateral (values
      ('accounts',r->>'account_id'),('accounts',r->>'source_account_id'),('accounts',r->>'target_account_id'),
      ('credit_cards',r->>'card_id'),('projects',r->>'project_id'),('statement_imports',r->>'import_id'),
      ('debts',r->>'related_debt_id'),('investments',r->>'related_investment_id')
    ) as ref(table_key,ref_id)
    where nullif(ref.ref_id,'') is not null
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_data->ref.table_key,'[]'::jsonb)) x
        where x->>'id'=ref.ref_id
      )
  ) then
    return jsonb_build_object('success',false,'error','Yedekteki bir hareket başka kullanıcıya veya eksik bir üst kayda referans veriyor.');
  end if;

  -- Reverse dependency order.
  delete from public.transactions where user_id=v_user_id;
  delete from public.card_statements where card_id in (select id from public.credit_cards where user_id=v_user_id);
  delete from public.routine_logs where user_id=v_user_id::text;
  delete from public.project_tasks where user_id=v_user_id;
  delete from public.statement_imports where user_id=v_user_id;
  delete from public.ideas where user_id=v_user_id;
  delete from public.agenda_items where user_id=v_user_id;
  delete from public.subscriptions where user_id=v_user_id;
  delete from public.debts where user_id=v_user_id;
  delete from public.routines where user_id=v_user_id::text;
  delete from public.credentials where user_id=v_user_id;
  delete from public.journal_entries where user_id=v_user_id::text;
  delete from public.merchant_mappings where user_id=v_user_id;
  delete from public.investments where user_id=v_user_id;
  delete from public.dreams where user_id=v_user_id::text;
  delete from public.projects where user_id=v_user_id;
  delete from public.credit_cards where user_id=v_user_id;
  delete from public.accounts where user_id=v_user_id;

  -- Forward dependency order. jsonb_populate_recordset uses the database row
  -- type, so schema constraints remain the final source of truth.
  insert into public.accounts select * from jsonb_populate_recordset(null::public.accounts,coalesce(p_data->'accounts','[]'::jsonb));
  insert into public.credit_cards select * from jsonb_populate_recordset(null::public.credit_cards,coalesce(p_data->'credit_cards','[]'::jsonb));
  insert into public.projects select * from jsonb_populate_recordset(null::public.projects,coalesce(p_data->'projects','[]'::jsonb));
  insert into public.dreams select * from jsonb_populate_recordset(null::public.dreams,coalesce(p_data->'dreams','[]'::jsonb));
  insert into public.investments select * from jsonb_populate_recordset(null::public.investments,coalesce(p_data->'investments','[]'::jsonb));
  insert into public.merchant_mappings select * from jsonb_populate_recordset(null::public.merchant_mappings,coalesce(p_data->'merchant_mappings','[]'::jsonb));
  insert into public.journal_entries select * from jsonb_populate_recordset(null::public.journal_entries,coalesce(p_data->'journal_entries','[]'::jsonb));
  insert into public.routines select * from jsonb_populate_recordset(null::public.routines,coalesce(p_data->'routines','[]'::jsonb));
  insert into public.credentials select * from jsonb_populate_recordset(null::public.credentials,coalesce(p_data->'credentials','[]'::jsonb));
  insert into public.statement_imports select * from jsonb_populate_recordset(null::public.statement_imports,coalesce(p_data->'statement_imports','[]'::jsonb));
  insert into public.project_tasks select * from jsonb_populate_recordset(null::public.project_tasks,coalesce(p_data->'project_tasks','[]'::jsonb));
  insert into public.debts select * from jsonb_populate_recordset(null::public.debts,coalesce(p_data->'debts','[]'::jsonb));
  insert into public.subscriptions select * from jsonb_populate_recordset(null::public.subscriptions,coalesce(p_data->'subscriptions','[]'::jsonb));
  insert into public.ideas select * from jsonb_populate_recordset(null::public.ideas,coalesce(p_data->'ideas','[]'::jsonb));
  insert into public.agenda_items select * from jsonb_populate_recordset(null::public.agenda_items,coalesce(p_data->'agenda_items','[]'::jsonb));
  insert into public.card_statements select * from jsonb_populate_recordset(null::public.card_statements,coalesce(p_data->'card_statements','[]'::jsonb));
  insert into public.routine_logs select * from jsonb_populate_recordset(null::public.routine_logs,coalesce(p_data->'routine_logs','[]'::jsonb));
  insert into public.transactions select * from jsonb_populate_recordset(null::public.transactions,coalesce(p_data->'transactions','[]'::jsonb));

  return jsonb_build_object('success',true);
exception when others then
  raise;
end $$;

revoke all on function public.fn_restore_vault_replace_atomic(jsonb) from public,anon;
grant execute on function public.fn_restore_vault_replace_atomic(jsonb) to authenticated;
notify pgrst, 'reload schema';
