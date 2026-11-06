-- ==============================================================================
-- 🧭 PUSULA — Migration 032: Eski Köprü (Bridge) ve İlişkisel Sütunların Temizlenmesi
-- Modüller arası bağımsızlık (Decoupled Architecture) gereğince kullanılmayan yetim
-- yabancı anahtar ve köprü sütunları ile RPC fonksiyonları temizlenir.
-- ==============================================================================

-- 1. Sütunların Kaldırılması
alter table public.projects
  drop column if exists budget_limit;

alter table public.debts
  drop column if exists linked_account_id,
  drop column if exists project_id;

alter table public.subscriptions
  drop column if exists project_id,
  drop column if exists payment_card_id;

alter table public.incomes
  drop column if exists project_id;

alter table public.merchant_mappings
  drop column if exists default_project_id;

alter table public.transactions
  drop column if exists project_id,
  drop column if exists source_account_id,
  drop column if exists target_account_id,
  drop column if exists related_debt_id,
  drop column if exists related_investment_id,
  drop column if exists investment_quantity_delta,
  drop column if exists investment_unit_price;

-- 2. Eski Köprü RPC Fonksiyonlarının Kaldırılması
drop function if exists public.fn_link_transaction_to_debt_atomic(uuid, uuid, uuid);
drop function if exists public.fn_unlink_transaction_from_debt_atomic(uuid, uuid);
drop function if exists public.fn_link_transaction_to_investment_atomic(uuid, uuid, uuid, numeric, numeric);
drop function if exists public.fn_unlink_transaction_from_investment_atomic(uuid, uuid);
drop function if exists public.fn_project_finance_summary(uuid);
drop function if exists public.fn_all_projects_direct_costs();
drop function if exists public.fn_promote_idea_to_project_atomic(uuid, uuid, text, numeric);

-- 3. Güncellenen Atomik RPC Fonksiyonları

-- 3.1 Fikri Projeye Terfi Ettirme (Bütçe Tavanı Olmadan)
create or replace function public.fn_promote_idea_to_project_atomic(
  p_user_id uuid,
  p_idea_id uuid,
  p_slug text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_idea public.ideas%rowtype;
  v_project_id uuid;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;
  if nullif(trim(p_slug), '') is null then
    return jsonb_build_object('success', false, 'error', 'Proje adresi boş olamaz.');
  end if;
  select * into v_idea from public.ideas where id = p_idea_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Fikir bulunamadı.');
  end if;
  if v_idea.promoted_project_id is not null then
    return jsonb_build_object('success', true, 'project_id', v_idea.promoted_project_id, 'already_promoted', true);
  end if;
  insert into public.projects(user_id, name, slug, description, status)
  values (p_user_id, v_idea.title, trim(p_slug), v_idea.description, 'Planlama')
  returning id into v_project_id;
  update public.ideas set status = 'promoted', promoted_project_id = v_project_id, updated_at = now() where id = v_idea.id;
  return jsonb_build_object('success', true, 'project_id', v_project_id);
end;
$$;

revoke all on function public.fn_promote_idea_to_project_atomic(uuid, uuid, text) from public, anon;
grant execute on function public.fn_promote_idea_to_project_atomic(uuid, uuid, text) to authenticated;

-- 3.2 Kasa Atomik Geri Yükleme (Restore) Güncellemesi
create or replace function public.fn_restore_vault_replace_atomic(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_row jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'Geçersiz kasa verisi.');
  end if;

  foreach v_key in array array[
    'accounts','credit_cards','transactions','debts','debt_installments','subscriptions','incomes',
    'statement_imports','merchant_mappings','investments','projects','ideas',
    'agenda_items','dreams','routines','routine_logs','journal_entries','credentials'
  ] loop
    for v_row in select value from jsonb_array_elements(coalesce(p_data->v_key,'[]'::jsonb)) loop
      if v_row->>'user_id' is distinct from v_user_id::text then
        return jsonb_build_object('success', false, 'error', v_key||' içinde başka kullanıcıya ait kayıt var.');
      end if;
    end loop;
  end loop;

  -- Geriye dönük uyumluluk: Eski yedeklerde kalan köprü referansları burada kontrol edilmez.
  -- Yalnızca geçerli üst tablo referansları doğrulanır.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data->'card_statements','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'credit_cards','[]'::jsonb)) x where x->>'id'=r->>'card_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'routine_logs','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'routines','[]'::jsonb)) x where x->>'id'=r->>'routine_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'statement_imports','[]'::jsonb)) r
      where nullif(r->>'card_id','') is not null and not exists (select 1 from jsonb_array_elements(coalesce(p_data->'credit_cards','[]'::jsonb)) x where x->>'id'=r->>'card_id')
    union all
    select 1 from jsonb_array_elements(coalesce(p_data->'debt_installments','[]'::jsonb)) r
      where not exists (select 1 from jsonb_array_elements(coalesce(p_data->'debts','[]'::jsonb)) x where x->>'id'=r->>'debt_id')
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
    return jsonb_build_object('success', false, 'error', 'Yedek başka kullanıcıya veya eksik bir üst kayda referans veriyor.');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_data->'transactions','[]'::jsonb)) r
    cross join lateral (values
      ('accounts', r->>'account_id'),
      ('credit_cards', r->>'card_id'),
      ('statement_imports', r->>'import_id')
    ) as ref(table_key, ref_id)
    where nullif(ref.ref_id, '') is not null
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_data->ref.table_key, '[]'::jsonb)) x
        where x->>'id' = ref.ref_id
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'Yedekteki bir hareket başka kullanıcıya veya eksik bir üst kayda referans veriyor.');
  end if;

  -- Bağımlılıkların tersi sırasında silme
  delete from public.transactions where user_id = v_user_id;
  delete from public.card_statements where card_id in (select id from public.credit_cards where user_id = v_user_id);
  delete from public.routine_logs where user_id = v_user_id::text;
  delete from public.statement_imports where user_id = v_user_id;
  delete from public.ideas where user_id = v_user_id;
  delete from public.agenda_items where user_id = v_user_id;
  delete from public.subscriptions where user_id = v_user_id;
  delete from public.incomes where user_id = v_user_id;
  delete from public.debt_installments where user_id = v_user_id;
  delete from public.debts where user_id = v_user_id;
  delete from public.routines where user_id = v_user_id::text;
  delete from public.credentials where user_id = v_user_id;
  delete from public.journal_entries where user_id = v_user_id::text;
  delete from public.merchant_mappings where user_id = v_user_id;
  delete from public.investments where user_id = v_user_id;
  delete from public.dreams where user_id = v_user_id::text;
  delete from public.projects where user_id = v_user_id;
  delete from public.credit_cards where user_id = v_user_id;
  delete from public.accounts where user_id = v_user_id;

  -- jsonb_populate_recordset veritabanının güncel şemasına göre yerleştirir;
  -- eski yedeklerdeki fazlalık/kaldırılmış sütunlar PostgreSQL tarafından güvenle yoksayılır.
  insert into public.accounts select * from jsonb_populate_recordset(null::public.accounts, coalesce(p_data->'accounts', '[]'::jsonb));
  insert into public.credit_cards select * from jsonb_populate_recordset(null::public.credit_cards, coalesce(p_data->'credit_cards', '[]'::jsonb));
  insert into public.projects select * from jsonb_populate_recordset(null::public.projects, coalesce(p_data->'projects', '[]'::jsonb));
  insert into public.dreams select * from jsonb_populate_recordset(null::public.dreams, coalesce(p_data->'dreams', '[]'::jsonb));
  insert into public.investments select * from jsonb_populate_recordset(null::public.investments, coalesce(p_data->'investments', '[]'::jsonb));
  insert into public.merchant_mappings select * from jsonb_populate_recordset(null::public.merchant_mappings, coalesce(p_data->'merchant_mappings', '[]'::jsonb));
  insert into public.journal_entries select * from jsonb_populate_recordset(null::public.journal_entries, coalesce(p_data->'journal_entries', '[]'::jsonb));
  insert into public.routines select * from jsonb_populate_recordset(null::public.routines, coalesce(p_data->'routines', '[]'::jsonb));
  insert into public.credentials select * from jsonb_populate_recordset(null::public.credentials, coalesce(p_data->'credentials', '[]'::jsonb));
  insert into public.statement_imports select * from jsonb_populate_recordset(null::public.statement_imports, coalesce(p_data->'statement_imports', '[]'::jsonb));
  insert into public.debts select * from jsonb_populate_recordset(null::public.debts, coalesce(p_data->'debts', '[]'::jsonb));
  insert into public.debt_installments select * from jsonb_populate_recordset(null::public.debt_installments, coalesce(p_data->'debt_installments', '[]'::jsonb));
  insert into public.subscriptions select * from jsonb_populate_recordset(null::public.subscriptions, coalesce(p_data->'subscriptions', '[]'::jsonb));
  insert into public.incomes select * from jsonb_populate_recordset(null::public.incomes, coalesce(p_data->'incomes', '[]'::jsonb));
  insert into public.ideas select * from jsonb_populate_recordset(null::public.ideas, coalesce(p_data->'ideas', '[]'::jsonb));
  insert into public.agenda_items select * from jsonb_populate_recordset(null::public.agenda_items, coalesce(p_data->'agenda_items', '[]'::jsonb));
  insert into public.card_statements select * from jsonb_populate_recordset(null::public.card_statements, coalesce(p_data->'card_statements', '[]'::jsonb));
  insert into public.routine_logs select * from jsonb_populate_recordset(null::public.routine_logs, coalesce(p_data->'routine_logs', '[]'::jsonb));
  insert into public.transactions select * from jsonb_populate_recordset(null::public.transactions, coalesce(p_data->'transactions', '[]'::jsonb));

  return jsonb_build_object('success', true);
exception when others then
  raise;
end;
$$;

revoke all on function public.fn_restore_vault_replace_atomic(jsonb) from public, anon;
grant execute on function public.fn_restore_vault_replace_atomic(jsonb) to authenticated;

-- 3.3 Ekstre İçe Aktarım RPC (Çapraz Varlık Yan Etkileri Olmadan Salt Ekstre ve Hareket Aktarımı)
create or replace function public.fn_commit_statement_import_atomic(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (p_payload->>'user_id')::uuid;
  v_import_id uuid;
  v_existing public.statement_imports%rowtype;
  v_tx jsonb;
  v_tx_id uuid;
  v_account_id uuid := nullif(p_payload->>'account_id','')::uuid;
  v_card_id uuid := nullif(p_payload->>'card_id','')::uuid;
  v_import_type text := p_payload->>'import_type';
  v_bank text := coalesce(nullif(p_payload->>'bank',''),'Banka Dökümü');
  v_source_ref text := nullif(p_payload->>'source_account_ref','');
  v_created_account_id uuid;
  v_created_card_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_amount numeric;
  v_account_delta numeric := 0;
  v_summary_only boolean := coalesce((p_payload->>'summary_only')::boolean, false);
  v_latest_date date := coalesce(nullif(p_payload->>'observed_date','')::date, nullif(p_payload->>'statement_date','')::date, current_date);
  v_closing_balance numeric := nullif(p_payload->>'closing_balance','')::numeric;
  v_statement_debt numeric := nullif(p_payload->>'statement_debt','')::numeric;
  v_minimum numeric := coalesce(nullif(p_payload->>'minimum_payment','')::numeric,0);
  v_interest numeric := coalesce(nullif(p_payload->>'interest_fees','')::numeric,0);
  v_statement_date date := coalesce(nullif(p_payload->>'statement_date','')::date, case when coalesce((p_payload->>'summary_only')::boolean, false) and p_payload->>'import_type' = 'credit_card' then coalesce(nullif(p_payload->>'observed_date','')::date, current_date) else null end);
  v_classification_status text;
  v_identity_inserted integer;
  v_snapshot jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or v_user_id is null or auth.uid() <> v_user_id then
    raise exception 'Yetkisiz erişim.';
  end if;
  if v_import_type not in ('credit_card','bank_account') then raise exception 'Geçersiz import türü.'; end if;
  if not v_summary_only and coalesce(jsonb_array_length(p_payload->'transactions'),0) = 0 then
    raise exception 'Aktarılacak hareket bulunamadı.';
  end if;
  if v_summary_only then
    if v_import_type = 'bank_account' and v_closing_balance is null then
      raise exception 'Özet modunda aktarım için kapanış bakiyesi bulunamadı.';
    end if;
    if v_import_type = 'credit_card' and v_statement_debt is null then
      raise exception 'Özet modunda aktarım için ekstre dönem borcu bulunamadı.';
    end if;
  end if;

  perform id from public.profiles where id=v_user_id for update;
  select * into v_existing from public.statement_imports
  where user_id=v_user_id and idempotency_key=p_payload->>'idempotency_key'
    and status in ('PROCESSING','COMPLETED')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('success',true,'already_committed',true,'import_id',v_existing.id,
      'inserted_transactions',0,'skipped_duplicates',coalesce(v_existing.total_transactions,0));
  end if;
  if nullif(p_payload->>'file_hash','') is not null then
    select * into v_existing from public.statement_imports
    where user_id=v_user_id and file_hash=p_payload->>'file_hash' and status in ('PROCESSING','COMPLETED')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('success',true,'already_committed',true,'import_id',v_existing.id,
        'inserted_transactions',0,'skipped_duplicates',coalesce(v_existing.total_transactions,0));
    end if;
  end if;

  if v_import_type='bank_account' then
    if v_account_id is not null then
      perform id from public.accounts where id=v_account_id and user_id=v_user_id for update;
      if not found then raise exception 'Hedef hesap bulunamadı.'; end if;
    else
      insert into public.accounts(user_id,name,type,balance)
      values(v_user_id,v_bank,'vadesiz',0) returning id into v_account_id;
      v_created_account_id := v_account_id;
      v_snapshot := jsonb_set(v_snapshot,'{created_account_id}',to_jsonb(v_account_id));
    end if;
  else
    if v_card_id is not null then
      perform id from public.credit_cards where id=v_card_id and user_id=v_user_id for update;
      if not found then raise exception 'Hedef kart bulunamadı.'; end if;
    else
      insert into public.credit_cards(user_id,bank,card_name,last_four)
      values(v_user_id,v_bank,coalesce(nullif(p_payload->>'card_name',''),'Kredi Kartı'),nullif(p_payload->>'last_four',''))
      returning id into v_card_id;
      v_created_card_id := v_card_id;
      v_snapshot := jsonb_set(v_snapshot,'{created_card_id}',to_jsonb(v_card_id));
    end if;
  end if;

  insert into public.statement_imports(
    user_id,file_name,file_hash,status,import_type,idempotency_key,source_account_id,source_account_ref,
    parser_version,bank,card_id,statement_date,due_date,total_transactions,total_amount,snapshot_data,raw_text
  ) values (
    v_user_id,coalesce(nullif(p_payload->>'file_name',''),'ekstre'),nullif(p_payload->>'file_hash',''),
    'PROCESSING',v_import_type,p_payload->>'idempotency_key',v_account_id,v_source_ref,
    p_payload->>'parser_version',v_bank,v_card_id,v_statement_date,nullif(p_payload->>'due_date','')::date,
    0,0,v_snapshot,jsonb_build_object('parser_version',p_payload->>'parser_version','status','PROCESSING')::text
  ) returning id into v_import_id;

  for v_tx in select value from jsonb_array_elements(p_payload->'transactions') loop
    v_amount := (v_tx->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 then raise exception 'Geçersiz hareket tutarı.'; end if;
    v_latest_date := greatest(v_latest_date,(v_tx->>'date')::date);

    if v_tx->>'fingerprint_strength'='strong' and nullif(v_tx->>'source_fingerprint','') is not null then
      insert into public.transaction_identities(user_id,source_fingerprint)
      values(v_user_id,v_tx->>'source_fingerprint') on conflict do nothing;
      get diagnostics v_identity_inserted = row_count;
      if v_identity_inserted = 0 then
        v_skipped := v_skipped + 1;
        insert into public.import_observations(
          user_id,import_id,row_index,source_bank,source_account_ref,external_reference,booking_date,direction,
          amount,raw_description,balance_after,source_fingerprint,weak_fingerprint,fingerprint_strength,
          duplicate_status,classification_status,classification_reason,parser_version
        ) values (
          v_user_id,v_import_id,(v_tx->>'row_index')::integer,v_bank,v_source_ref,nullif(v_tx->>'external_reference',''),
          (v_tx->>'date')::date,v_tx->>'direction',v_amount,v_tx->>'description',nullif(v_tx->>'balance_after','')::numeric,
          v_tx->>'source_fingerprint',v_tx->>'weak_fingerprint','strong','EXACT_DUPLICATE',
          coalesce(v_tx->>'classification_status','UNKNOWN'),coalesce(v_tx->'classification_reasons','[]'::jsonb),p_payload->>'parser_version'
        );
        continue;
      end if;
    end if;

    if v_tx->>'fingerprint_strength'='weak'
       and nullif(v_tx->>'weak_fingerprint','') is not null
       and exists (
         select 1 from public.transactions existing
         where existing.user_id=v_user_id
           and existing.weak_fingerprint=v_tx->>'weak_fingerprint'
       )
       and coalesce(v_tx->>'duplicate_status','NEW') <> 'USER_CONFIRMED_NEW' then
      v_skipped := v_skipped + 1;
      insert into public.import_observations(
        user_id,import_id,row_index,source_bank,source_account_ref,external_reference,booking_date,direction,
        amount,raw_description,balance_after,source_fingerprint,weak_fingerprint,fingerprint_strength,
        duplicate_status,classification_status,classification_reason,parser_version
      ) values (
        v_user_id,v_import_id,(v_tx->>'row_index')::integer,v_bank,v_source_ref,nullif(v_tx->>'external_reference',''),
        (v_tx->>'date')::date,v_tx->>'direction',v_amount,v_tx->>'description',nullif(v_tx->>'balance_after','')::numeric,
        v_tx->>'source_fingerprint',v_tx->>'weak_fingerprint','weak','POSSIBLE_DUPLICATE',
        coalesce(v_tx->>'classification_status','UNKNOWN'),coalesce(v_tx->'classification_reasons','[]'::jsonb),p_payload->>'parser_version'
      );
      continue;
    end if;

    v_classification_status := coalesce(v_tx->>'classification_status','UNKNOWN');

    -- Salt hareket aktarımı: project_id ve related_debt_id olmadan doğrudan kart/hesap kaydı
    insert into public.transactions(
      user_id,date,account_or_card,type,description,amount,analysis_group,merchant,recurrence,card_id,account_id,
      import_id,source_bank,source_account_ref,source_external_id,source_fingerprint,
      weak_fingerprint,fingerprint_strength,classification_status,classification_confidence,classification_reason,import_row_index
    ) values (
      v_user_id,(v_tx->>'date')::date,v_bank,v_tx->>'type',v_tx->>'description',v_amount,
      coalesce(v_tx->>'analysis_group','Hariç'),nullif(v_tx->>'merchant',''),nullif(v_tx->>'recurrence',''),
      case when v_import_type='credit_card' then v_card_id else null end,
      case when v_import_type='bank_account' then v_account_id else null end,
      v_import_id,v_bank,v_source_ref,nullif(v_tx->>'external_reference',''),v_tx->>'source_fingerprint',
      v_tx->>'weak_fingerprint',v_tx->>'fingerprint_strength',v_classification_status,
      coalesce(v_tx->>'confidence','low'),coalesce(v_tx->'classification_reasons','[]'::jsonb),(v_tx->>'row_index')::integer
    ) returning id into v_tx_id;

    if v_tx->>'fingerprint_strength'='strong' then
      update public.transaction_identities set transaction_id=v_tx_id
      where user_id=v_user_id and source_fingerprint=v_tx->>'source_fingerprint';
    end if;

    insert into public.import_observations(
      user_id,import_id,transaction_id,row_index,source_bank,source_account_ref,external_reference,booking_date,direction,
      amount,raw_description,balance_after,source_fingerprint,weak_fingerprint,fingerprint_strength,duplicate_status,
      classification_status,classification_reason,parser_version
    ) values (
      v_user_id,v_import_id,v_tx_id,(v_tx->>'row_index')::integer,v_bank,v_source_ref,nullif(v_tx->>'external_reference',''),
      (v_tx->>'date')::date,v_tx->>'direction',v_amount,v_tx->>'description',nullif(v_tx->>'balance_after','')::numeric,
      v_tx->>'source_fingerprint',v_tx->>'weak_fingerprint',v_tx->>'fingerprint_strength',
      coalesce(v_tx->>'duplicate_status','NEW'),v_classification_status,
      coalesce(v_tx->'classification_reasons','[]'::jsonb),p_payload->>'parser_version'
    );

    v_inserted := v_inserted + 1;
    if v_import_type='bank_account' and v_closing_balance is null then
      v_account_delta := v_account_delta + case when v_tx->>'direction'='inflow' then v_amount else -v_amount end;
    end if;
  end loop;

  if v_import_type='bank_account' then
    if v_closing_balance is not null then
      if exists (
        select 1
        from public.account_balance_snapshots existing_snapshot
        join public.statement_imports existing_import on existing_import.id=existing_snapshot.import_id
        where existing_snapshot.account_id=v_account_id
          and existing_snapshot.observed_on=v_latest_date
          and existing_import.status='COMPLETED'
      ) then
        if exists (
          select 1
          from public.account_balance_snapshots existing_snapshot
          join public.statement_imports existing_import on existing_import.id=existing_snapshot.import_id
          where existing_snapshot.account_id=v_account_id
            and existing_snapshot.observed_on=v_latest_date
            and existing_import.status='COMPLETED'
            and round(existing_snapshot.closing_balance,2)=round(v_closing_balance,2)
        ) then
          -- Aynı gün ve aynı bakiye
        else
          raise exception 'Bu hesap için % tarihinde farklı bir kapanış bakiyesi zaten içe aktarılmış.', v_latest_date;
        end if;
      else
        insert into public.account_balance_snapshots(user_id,account_id,import_id,observed_on,closing_balance)
        values(v_user_id,v_account_id,v_import_id,v_latest_date,v_closing_balance);
      end if;
    end if;

    select row_to_json(a)::jsonb into v_snapshot from public.accounts a where id=v_account_id;
    update public.statement_imports
    set snapshot_data=jsonb_set(coalesce(snapshot_data,'{}'::jsonb),'{previous_account_state}',
      jsonb_build_object('account_id',v_account_id,'balance',v_snapshot->'balance'))
    where id=v_import_id;

    if v_closing_balance is not null then
      if not exists (
        select 1 from public.account_balance_snapshots s
        where s.account_id=v_account_id and s.observed_on > v_latest_date
      ) then
        update public.accounts
        set balance=v_closing_balance,
            balance_as_of=case when balance_as_of is null or v_latest_date >= balance_as_of then v_latest_date else balance_as_of end,
            updated_at=now()
        where id=v_account_id;
        insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
        values(v_user_id,v_import_id,'account',v_account_id,'balance',v_closing_balance - coalesce((v_snapshot->>'balance')::numeric, 0));
      end if;
    else
      if v_account_delta <> 0 then
        update public.accounts set balance=balance+v_account_delta,updated_at=now() where id=v_account_id;
        insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
        values(v_user_id,v_import_id,'account',v_account_id,'balance',v_account_delta);
      end if;
    end if;
  else
    select row_to_json(c)::jsonb into v_snapshot from public.credit_cards c where id=v_card_id;
    update public.statement_imports
    set snapshot_data=jsonb_set(coalesce(snapshot_data,'{}'::jsonb),'{previous_card_state}',
      jsonb_build_object(
        'card_id',v_card_id,
        'current_debt',v_snapshot->'current_debt',
        'statement_debt',v_snapshot->'statement_debt',
        'minimum_payment',v_snapshot->'minimum_payment',
        'interest_fees',v_snapshot->'interest_fees',
        'statement_date',v_snapshot->'statement_date',
        'due_date',v_snapshot->'due_date'
      ))
    where id=v_import_id;

    if v_statement_debt is not null and v_statement_date is not null then
      insert into public.card_statements(
        card_id,statement_date,due_date,period_debt,minimum,interest_fees,spending,cash_advance,import_id
      ) values (
        v_card_id,v_statement_date,nullif(p_payload->>'due_date','')::date,v_statement_debt,v_minimum,v_interest,
        coalesce(nullif(p_payload->>'spending','')::numeric,0),coalesce(nullif(p_payload->>'cash_advance','')::numeric,0),v_import_id
      );

      if not exists (
        select 1 from public.card_statements cs
        where cs.card_id=v_card_id and cs.statement_date > v_statement_date
      ) then
        update public.credit_cards set
          statement_date=v_statement_date,
          due_date=nullif(p_payload->>'due_date','')::date,
          statement_debt=v_statement_debt,
          current_debt=v_statement_debt,
          minimum_payment=v_minimum,
          interest_fees=v_interest,
          updated_at=now()
        where id=v_card_id;
        insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
        values(v_user_id,v_import_id,'card',v_card_id,'current_debt',v_statement_debt - coalesce((v_snapshot->>'current_debt')::numeric, 0));
      end if;
    end if;
  end if;

  update public.statement_imports set
    status='COMPLETED',
    total_transactions=v_inserted,
    total_amount=(select coalesce(sum(amount),0) from public.transactions where import_id=v_import_id),
    raw_text=jsonb_build_object(
      'parser_version',p_payload->>'parser_version',
      'status','COMPLETED',
      'file_hash',p_payload->>'file_hash',
      'import_type',v_import_type,
      'inserted_transactions',v_inserted,
      'skipped_duplicates',v_skipped
    )::text
  where id=v_import_id;

  return jsonb_build_object(
    'success',true,
    'import_id',v_import_id,
    'inserted_transactions',v_inserted,
    'skipped_duplicates',v_skipped
  );
exception when others then
  raise;
end;
$$;

revoke all on function public.fn_commit_statement_import_atomic(jsonb) from public, anon;
grant execute on function public.fn_commit_statement_import_atomic(jsonb) to authenticated;

-- 3.4 Gelir Kaydı RPC (transactions.project_id referansı olmadan)
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

  if p_account_id is null then
    return jsonb_build_object('success', false, 'error', 'Hesap seçilmelidir.');
  end if;

  perform id from public.accounts
  where id = p_account_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;

  update public.accounts
  set balance = balance + p_amount, updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  insert into public.transactions (
    user_id, date, type, description, amount, analysis_group,
    merchant, account_id
  ) values (
    p_user_id, p_date, 'Gelir', p_description, p_amount, coalesce(p_analysis_group, 'Kişisel'),
    p_merchant, p_account_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

revoke all on function public.fn_record_income_atomic(uuid,date,numeric,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_income_atomic(uuid,date,numeric,text,text,text,uuid,uuid) to authenticated;

-- 3.5 Harcama Kaydı RPC (transactions.project_id referansı olmadan)
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

  if p_account_id is not null and p_card_id is not null then
    return jsonb_build_object('success', false, 'error', 'Tek bir hesap veya kart seçilmelidir.');
  end if;

  if p_card_id is not null then
    perform id from public.credit_cards where id=p_card_id and user_id=p_user_id for update;
    if not found then
      return jsonb_build_object('success', false, 'error', 'Kredi kartı bulunamadı veya yetkisiz erişim.');
    end if;
  end if;

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

  if p_card_id is not null then
    update public.credit_cards
    set current_debt = current_debt + p_amount, updated_at = now()
    where id = p_card_id and user_id = p_user_id;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Kredi kartı bulunamadı veya yetkisiz erişim.');
    end if;
  end if;

  insert into public.transactions (
    user_id, date, type, description, amount, analysis_group,
    merchant, account_id, card_id
  ) values (
    p_user_id, p_date, 'Harcama', p_description, p_amount, coalesce(p_analysis_group, 'Kişisel'),
    p_merchant, p_account_id, p_card_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

revoke all on function public.fn_record_expense_atomic(uuid,date,numeric,text,text,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.fn_record_expense_atomic(uuid,date,numeric,text,text,text,uuid,uuid,uuid) to authenticated;

-- 3.6 Ödeme Kaydı RPC (transactions.related_debt_id referansı olmadan)
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

  if p_account_id is not null then
    insert into public.transactions(
      user_id,date,type,description,merchant,amount,analysis_group,
      account_id,card_id
    ) values (
      p_user_id,p_date,p_type,p_description,coalesce(p_description,p_type),round(p_amount, 2),'Hariç',
      p_account_id,
      case when p_type='Kart Ödemesi' then p_target_id else null end
    ) returning id into v_tx_id;
  end if;

  return jsonb_build_object('success',true,'transaction_id',v_tx_id);
end;
$$;

revoke all on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_payment_atomic(uuid,date,numeric,text,text,uuid,uuid) to authenticated;

-- 3.7 Transfer Kaydı RPC (source_account_id / target_account_id yerine standart account_id)
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
  v_first_id uuid;
  v_second_id uuid;
  v_tx_id uuid;
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

  if p_source_account_id < p_target_account_id then
    v_first_id := p_source_account_id;
    v_second_id := p_target_account_id;
  else
    v_first_id := p_target_account_id;
    v_second_id := p_source_account_id;
  end if;

  perform id from public.accounts
  where id = v_first_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;

  perform id from public.accounts
  where id = v_second_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;

  update public.accounts
  set balance = balance - p_amount, updated_at = now()
  where id = p_source_account_id and user_id = p_user_id;

  update public.accounts
  set balance = balance + p_amount, updated_at = now()
  where id = p_target_account_id and user_id = p_user_id;

  insert into public.transactions (
    user_id, date, type, description, merchant, amount, analysis_group,
    account_id
  ) values (
    p_user_id, p_date, 'Transfer', coalesce(p_description, 'Hesaplar Arası Transfer'),
    coalesce(p_description, 'Hesaplar Arası Transfer'),
    p_amount, 'Hariç', p_source_account_id
  ) returning id into v_tx_id;

  return jsonb_build_object('success', true, 'transaction_id', v_tx_id);
end;
$$;

revoke all on function public.fn_record_transfer_atomic(uuid,date,numeric,text,uuid,uuid) from public, anon;
grant execute on function public.fn_record_transfer_atomic(uuid,date,numeric,text,uuid,uuid) to authenticated;

-- 3.8 Hareket Silme RPC (düşürülen sütunların referansları kaldırılmış versiyon)
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

  if v_tx.type = 'Harcama' and v_tx.account_id is not null then
    update public.accounts
    set balance = balance + v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
  elsif v_tx.type = 'Harcama' and v_tx.card_id is not null then
    update public.credit_cards
    set current_debt = greatest(0, current_debt - v_tx.amount), updated_at = now()
    where id = v_tx.card_id and user_id = p_user_id;
  elsif v_tx.type = 'Kart Ödemesi' then
    if v_tx.account_id is not null then
      update public.accounts set balance = balance + v_tx.amount, updated_at = now()
      where id = v_tx.account_id and user_id = p_user_id;
    end if;
    if v_tx.card_id is not null then
      update public.credit_cards set current_debt = current_debt + v_tx.amount, updated_at = now()
      where id = v_tx.card_id and user_id = p_user_id;
    end if;
  elsif v_tx.type = 'Gelir' and v_tx.account_id is not null then
    update public.accounts
    set balance = balance - v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
  elsif v_tx.type = 'Transfer' and v_tx.account_id is not null then
    update public.accounts
    set balance = balance + v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
  end if;

  delete from public.transactions
  where id = p_tx_id and user_id = p_user_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.fn_delete_transaction_atomic(uuid,uuid) from public, anon;
grant execute on function public.fn_delete_transaction_atomic(uuid,uuid) to authenticated;

-- 3.9 Keyset Sayfalama ve İstatistik RPC'leri (project_id filtresi kaldırılmış)
create or replace function public.fn_transactions_stats(
  p_search text default null,
  p_group text default null,
  p_type text default null,
  p_project_id uuid default null,
  p_month text default null,
  p_import_id text default null,
  p_segment_tab text default 'all',
  p_entity_id text default 'ALL'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stats jsonb;
  v_month_start date := case 
    when p_month is not null and p_month <> 'ALL' and p_month ~ '^\d{4}-\d{2}$' 
    then to_date(p_month || '-01', 'YYYY-MM-DD') 
    else null 
  end;
  v_next_month_start date := case 
    when v_month_start is not null 
    then (v_month_start + interval '1 month')::date 
    else null 
  end;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim: Oturum açılmalıdır.';
  end if;

  select jsonb_build_object(
    'total_count', count(*),
    'total_volume', coalesce(sum(amount), 0),
    'total_spent', coalesce(sum(
      case 
        when analysis_group = 'Hariç' or type in ('Gelir', 'Tahsilat') then 0
        when type = 'İade' then -amount
        else amount
      end
    ), 0)
  ) into v_stats
  from public.transactions t
  where t.user_id = auth.uid()
    and (
      p_search is null or trim(p_search) = '' or 
      (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%'
    )
    and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
    and (p_type is null or p_type = 'ALL' or t.type = p_type)
    and (
      v_month_start is null or 
      (t.date >= v_month_start and t.date < v_next_month_start)
    )
    and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
    and (
      p_segment_tab = 'all' or
      (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
      (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama'))
    )
    and (
      p_entity_id = 'ALL' or
      t.card_id::text = p_entity_id or 
      t.account_id::text = p_entity_id or 
      t.account_or_card ilike '%' || p_entity_id || '%'
    );

  return v_stats;
end;
$$;

revoke all on function public.fn_transactions_stats from public, anon;
grant execute on function public.fn_transactions_stats to authenticated;

create or replace function public.fn_transactions_page(
  p_search text default null,
  p_group text default null,
  p_type text default null,
  p_project_id uuid default null,
  p_month text default null,
  p_import_id text default null,
  p_segment_tab text default 'all',
  p_entity_id text default 'ALL',
  p_sort_field text default 'date',
  p_sort_order text default 'desc',
  p_cursor_date date default null,
  p_cursor_amount numeric default null,
  p_cursor_id uuid default null,
  p_limit integer default 51
)
returns setof public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_month_start date := case 
    when p_month is not null and p_month <> 'ALL' and p_month ~ '^\d{4}-\d{2}$' 
    then to_date(p_month || '-01', 'YYYY-MM-DD') 
    else null 
  end;
  v_next_month_start date := case 
    when v_month_start is not null 
    then (v_month_start + interval '1 month')::date 
    else null 
  end;
  v_is_asc boolean := (lower(coalesce(p_sort_order, 'desc')) = 'asc');
  v_is_amount boolean := (lower(coalesce(p_sort_field, 'date')) = 'amount');
  v_has_cursor boolean := (p_cursor_id is not null and ((not v_is_amount and p_cursor_date is not null) or (v_is_amount and p_cursor_amount is not null)));
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz erişim: Oturum açılmalıdır.';
  end if;

  if not v_is_amount and not v_is_asc then
    if not v_has_cursor then
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.date desc, t.id desc
      limit p_limit;
    else
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and row(t.date, t.id) < row(p_cursor_date, p_cursor_id)
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.date desc, t.id desc
      limit p_limit;
    end if;

  elsif not v_is_amount and v_is_asc then
    if not v_has_cursor then
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.date asc, t.id asc
      limit p_limit;
    else
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and row(t.date, t.id) > row(p_cursor_date, p_cursor_id)
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.date asc, t.id asc
      limit p_limit;
    end if;

  elsif v_is_amount and not v_is_asc then
    if not v_has_cursor then
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.amount desc, t.id desc
      limit p_limit;
    else
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and row(t.amount, t.id) < row(p_cursor_amount, p_cursor_id)
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.amount desc, t.id desc
      limit p_limit;
    end if;

  else
    if not v_has_cursor then
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.amount asc, t.id asc
      limit p_limit;
    else
      return query
      select t.* from public.transactions t
      where t.user_id = auth.uid()
        and row(t.amount, t.id) > row(p_cursor_amount, p_cursor_id)
        and (p_search is null or trim(p_search) = '' or 
             (coalesce(t.merchant, '') || ' ' || coalesce(t.description, '') || ' ' || coalesce(t.account_or_card, '')) ilike '%' || trim(p_search) || '%')
        and (p_group is null or p_group = 'ALL' or t.analysis_group = p_group)
        and (p_type is null or p_type = 'ALL' or t.type = p_type)
        and (v_month_start is null or (t.date >= v_month_start and t.date < v_next_month_start))
        and (p_import_id is null or p_import_id = 'ALL' or t.import_id::text = p_import_id)
        and (p_segment_tab = 'all' or
             (p_segment_tab = 'cards' and not (t.card_id is null and t.type = 'Gelir') and not (t.account_id is not null and t.type <> 'Harcama')) or
             (p_segment_tab = 'accounts' and not (t.card_id is not null and t.account_id is null and t.type = 'Harcama')))
        and (p_entity_id = 'ALL' or t.card_id::text = p_entity_id or t.account_id::text = p_entity_id or t.account_or_card ilike '%' || p_entity_id || '%')
      order by t.amount asc, t.id asc
      limit p_limit;
    end if;
  end if;
end;
$$;

revoke all on function public.fn_transactions_page from public, anon;
grant execute on function public.fn_transactions_page to authenticated;

notify pgrst, 'reload schema';
