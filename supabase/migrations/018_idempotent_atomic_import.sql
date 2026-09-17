-- Idempotent, risk-aware statement imports.
-- Classification is persisted as evidence; only confirmed/high-confidence,
-- uniquely-targeted actions may mutate card/debt state.

alter table public.accounts
  add column if not exists balance_as_of date;

alter table public.statement_imports
  add column if not exists idempotency_key text,
  add column if not exists source_account_id uuid references public.accounts(id) on delete set null,
  add column if not exists source_account_ref text,
  add column if not exists parser_version text,
  add column if not exists completed_at timestamptz;

alter table public.transactions
  add column if not exists source_bank text,
  add column if not exists source_account_ref text,
  add column if not exists source_external_id text,
  add column if not exists source_fingerprint text,
  add column if not exists weak_fingerprint text,
  add column if not exists fingerprint_strength text check (fingerprint_strength in ('strong','weak')),
  add column if not exists classification_status text default 'UNKNOWN'
    check (classification_status in ('CONFIRMED','HIGH_CONFIDENCE','NEEDS_REVIEW','UNKNOWN','CONFLICTING_RULES')),
  add column if not exists classification_confidence text
    check (classification_confidence in ('high','medium','low')),
  add column if not exists classification_reason jsonb default '[]'::jsonb,
  add column if not exists import_row_index integer;

-- Historical schemas did not consistently include ownership on card statements.
alter table public.card_statements add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.card_statements cs
set user_id = cc.user_id
from public.credit_cards cc
where cs.card_id = cc.id and cs.user_id is null;

create table if not exists public.transaction_identities (
  user_id uuid references auth.users(id) on delete cascade not null,
  source_fingerprint text not null,
  transaction_id uuid references public.transactions(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (user_id, source_fingerprint)
);

create table if not exists public.import_observations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  import_id uuid references public.statement_imports(id) on delete cascade not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  row_index integer not null,
  source_bank text,
  source_account_ref text,
  external_reference text,
  booking_date date not null,
  direction text not null check (direction in ('inflow','outflow')),
  amount numeric(12,2) not null check (amount > 0),
  currency text default 'TRY' not null,
  raw_description text not null,
  balance_after numeric(12,2),
  source_fingerprint text,
  weak_fingerprint text,
  fingerprint_strength text check (fingerprint_strength in ('strong','weak')),
  duplicate_status text not null
    check (duplicate_status in ('NEW','EXACT_DUPLICATE','POSSIBLE_DUPLICATE','USER_CONFIRMED_NEW')),
  classification_status text not null,
  classification_reason jsonb default '[]'::jsonb,
  parser_version text,
  created_at timestamptz default now() not null,
  unique (import_id, row_index)
);

create table if not exists public.financial_effects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  import_id uuid references public.statement_imports(id) on delete cascade not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  entity_type text not null check (entity_type in ('account','card','debt')),
  entity_id uuid not null,
  metric text not null check (metric in ('balance','current_debt','statement_debt','minimum_payment','interest_fees','remaining','past_payments')),
  delta numeric(12,2) not null,
  status text default 'APPLIED' not null check (status in ('APPLIED','REVERSED')),
  reversed_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.account_balance_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  import_id uuid references public.statement_imports(id) on delete cascade not null,
  observed_on date not null,
  observed_balance numeric(12,2) not null,
  applied boolean default false not null,
  created_at timestamptz default now() not null,
  unique (import_id, account_id)
);

create unique index if not exists uq_statement_imports_active_idempotency
  on public.statement_imports(user_id, idempotency_key)
  where idempotency_key is not null and status in ('PROCESSING','COMPLETED');
create index if not exists idx_transactions_source_fingerprint on public.transactions(user_id, source_fingerprint);
create index if not exists idx_transactions_weak_fingerprint on public.transactions(user_id, weak_fingerprint);
create index if not exists idx_import_observations_fingerprints on public.import_observations(user_id, source_fingerprint, weak_fingerprint);
create index if not exists idx_financial_effects_import on public.financial_effects(import_id, status);

alter table public.transaction_identities enable row level security;
alter table public.import_observations enable row level security;
alter table public.financial_effects enable row level security;
alter table public.account_balance_snapshots enable row level security;

create policy "Users can view own transaction identities" on public.transaction_identities
  for select using (auth.uid() = user_id);
create policy "Users can view own import observations" on public.import_observations
  for select using (auth.uid() = user_id);
create policy "Users can view own financial effects" on public.financial_effects
  for select using (auth.uid() = user_id);
create policy "Users can view own account balance snapshots" on public.account_balance_snapshots
  for select using (auth.uid() = user_id);

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
  v_target_card_id uuid;
  v_target_debt_id uuid;
  v_target_project_id uuid;
  v_import_type text := p_payload->>'import_type';
  v_bank text := coalesce(nullif(p_payload->>'bank',''),'Banka Dökümü');
  v_source_ref text := nullif(p_payload->>'source_account_ref','');
  v_created_account_id uuid;
  v_created_card_id uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_amount numeric;
  v_old numeric;
  v_new numeric;
  v_delta numeric;
  v_account_delta numeric := 0;
  v_latest_date date;
  v_closing_balance numeric := nullif(p_payload->>'closing_balance','')::numeric;
  v_statement_debt numeric := nullif(p_payload->>'statement_debt','')::numeric;
  v_minimum numeric := coalesce(nullif(p_payload->>'minimum_payment','')::numeric,0);
  v_interest numeric := coalesce(nullif(p_payload->>'interest_fees','')::numeric,0);
  v_statement_date date := nullif(p_payload->>'statement_date','')::date;
  v_classification_status text;
  v_apply_effect boolean;
  v_identity_inserted integer;
  v_snapshot jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or v_user_id is null or auth.uid() <> v_user_id then
    raise exception 'Yetkisiz erişim.';
  end if;
  if v_import_type not in ('credit_card','bank_account') then raise exception 'Geçersiz import türü.'; end if;
  if coalesce(jsonb_array_length(p_payload->'transactions'),0) = 0 then raise exception 'Aktarılacak hareket bulunamadı.'; end if;

  -- Serialize all imports for one user; this closes two-tab/hash check races.
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

    -- Strong identities are hard-idempotent. Weak identities remain reviewable.
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

    -- A weak match is not safe enough to suppress silently, but it must be
    -- explicitly confirmed before a second ledger row is created.
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

    v_target_card_id := nullif(v_tx->>'target_card_id','')::uuid;
    v_target_debt_id := nullif(v_tx->>'target_debt_id','')::uuid;
    v_target_project_id := nullif(v_tx->>'project_id','')::uuid;
    v_classification_status := coalesce(v_tx->>'classification_status','UNKNOWN');

    if v_target_card_id is not null
       and not exists(select 1 from public.credit_cards where id=v_target_card_id and user_id=v_user_id) then
      raise exception 'Hedef kart bulunamadı veya kullanıcıya ait değil.';
    end if;
    if v_target_debt_id is not null
       and not exists(select 1 from public.debts where id=v_target_debt_id and user_id=v_user_id) then
      raise exception 'Hedef borç/alacak bulunamadı veya kullanıcıya ait değil.';
    end if;
    if v_target_project_id is not null
       and not exists(select 1 from public.projects where id=v_target_project_id and user_id=v_user_id) then
      raise exception 'Hedef proje bulunamadı veya kullanıcıya ait değil.';
    end if;

    insert into public.transactions(
      user_id,date,account_or_card,type,description,amount,analysis_group,merchant,recurrence,card_id,account_id,
      project_id,related_debt_id,import_id,source_bank,source_account_ref,source_external_id,source_fingerprint,
      weak_fingerprint,fingerprint_strength,classification_status,classification_confidence,classification_reason,import_row_index
    ) values (
      v_user_id,(v_tx->>'date')::date,v_bank,v_tx->>'type',v_tx->>'description',v_amount,
      coalesce(v_tx->>'analysis_group','Hariç'),nullif(v_tx->>'merchant',''),nullif(v_tx->>'recurrence',''),
      case when v_tx->>'action' in ('CARD_PAYMENT','CASH_ADVANCE') then v_target_card_id when v_import_type='credit_card' then v_card_id else null end,
      case when v_import_type='bank_account' then v_account_id else null end,
      v_target_project_id,
      case when v_tx->>'action' in ('PAY_DEBT','COLLECT_RECEIVABLE') then v_target_debt_id else null end,
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

    v_apply_effect := v_classification_status in ('CONFIRMED','HIGH_CONFIDENCE');
    if v_apply_effect and v_tx->>'action' in ('CARD_PAYMENT','CASH_ADVANCE') and v_target_card_id is not null then
      select current_debt into v_old from public.credit_cards where id=v_target_card_id and user_id=v_user_id for update;
      if found then
        if v_tx->>'action'='CARD_PAYMENT' then v_new := greatest(0,v_old-v_amount); else v_new := v_old+v_amount; end if;
        update public.credit_cards set current_debt=v_new,updated_at=now() where id=v_target_card_id;
        insert into public.financial_effects(user_id,import_id,transaction_id,entity_type,entity_id,metric,delta)
        values(v_user_id,v_import_id,v_tx_id,'card',v_target_card_id,'current_debt',v_new-v_old);
      end if;
    elsif v_apply_effect and v_tx->>'action' in ('PAY_DEBT','COLLECT_RECEIVABLE') and v_target_debt_id is not null then
      select remaining into v_old from public.debts where id=v_target_debt_id and user_id=v_user_id for update;
      if found and v_amount <= v_old then
        v_new := v_old-v_amount;
        update public.debts set remaining=v_new,past_payments=past_payments+v_amount,
          status=case when v_new=0 then 'Kapatıldı' else 'Açık' end,updated_at=now() where id=v_target_debt_id;
        insert into public.financial_effects(user_id,import_id,transaction_id,entity_type,entity_id,metric,delta)
        values
          (v_user_id,v_import_id,v_tx_id,'debt',v_target_debt_id,'remaining',-v_amount),
          (v_user_id,v_import_id,v_tx_id,'debt',v_target_debt_id,'past_payments',v_amount);
      else
        update public.transactions set classification_status='NEEDS_REVIEW',
          classification_reason=classification_reason || '["Borç/alacak bakiyesi yetersiz veya hedef bulunamadı; finansal etki uygulanmadı."]'::jsonb
        where id=v_tx_id;
      end if;
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
            and existing_snapshot.observed_balance<>v_closing_balance
            and existing_import.status='COMPLETED'
        ) then
          raise exception 'Aynı hesap ve tarih için çelişkili kapanış bakiyesi bulundu.';
        end if;
        -- Same account/date/balance is the same balance observation. The
        -- transaction-level identities above still decide which rows are new.
        v_closing_balance := null;
      end if;
    end if;

    if v_closing_balance is not null then
      insert into public.account_balance_snapshots(user_id,account_id,import_id,observed_on,observed_balance,applied)
      values(v_user_id,v_account_id,v_import_id,v_latest_date,v_closing_balance,false);
      select balance into v_old from public.accounts where id=v_account_id for update;
      if (select balance_as_of from public.accounts where id=v_account_id) is null
         or v_latest_date >= (select balance_as_of from public.accounts where id=v_account_id) then
        update public.accounts set balance=v_closing_balance,balance_as_of=v_latest_date,updated_at=now() where id=v_account_id;
        update public.account_balance_snapshots set applied=true where import_id=v_import_id and account_id=v_account_id;
        insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
        values(v_user_id,v_import_id,'account',v_account_id,'balance',v_closing_balance-v_old);
      end if;
    elsif v_account_delta <> 0 then
      update public.accounts set balance=balance+v_account_delta,balance_as_of=greatest(balance_as_of,v_latest_date),updated_at=now()
      where id=v_account_id;
      insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
      values(v_user_id,v_import_id,'account',v_account_id,'balance',v_account_delta);
    end if;
  elsif v_statement_debt is not null and v_statement_date is not null then
    if exists(select 1 from public.card_statements where card_id=v_card_id and statement_date=v_statement_date) then
      raise exception 'Bu kart ve tarih için ekstre zaten kayıtlı.';
    end if;
    select current_debt into v_old from public.credit_cards where id=v_card_id for update;
    if (select statement_date from public.credit_cards where id=v_card_id) is null
       or v_statement_date >= (select statement_date from public.credit_cards where id=v_card_id) then
      update public.credit_cards set current_debt=v_statement_debt,statement_debt=v_statement_debt,
        minimum_payment=v_minimum,interest_fees=v_interest,statement_date=v_statement_date,
        due_date=nullif(p_payload->>'due_date','')::date,updated_at=now() where id=v_card_id;
      insert into public.financial_effects(user_id,import_id,entity_type,entity_id,metric,delta)
      values(v_user_id,v_import_id,'card',v_card_id,'current_debt',v_statement_debt-v_old);
    end if;
    insert into public.card_statements(user_id,card_id,import_id,statement_date,period_debt,minimum,spending,interest_fees,due_date)
    values(v_user_id,v_card_id,v_import_id,v_statement_date,v_statement_debt,v_minimum,
      (select coalesce(sum(amount),0) from public.transactions where import_id=v_import_id and type='Harcama'),
      v_interest,nullif(p_payload->>'due_date','')::date);
  end if;

  update public.statement_imports set status='COMPLETED',completed_at=now(),total_transactions=v_inserted,
    total_amount=(select coalesce(sum(amount),0) from public.transactions where import_id=v_import_id),
    raw_text=jsonb_build_object('parser_version',p_payload->>'parser_version','status','COMPLETED',
      'skipped_duplicates',v_skipped)::text
  where id=v_import_id;

  return jsonb_build_object('success',true,'import_id',v_import_id,'inserted_transactions',v_inserted,
    'skipped_duplicates',v_skipped,'created_account_id',v_created_account_id,'created_card_id',v_created_card_id);
exception when others then
  raise;
end;
$$;

-- New imports reverse recorded deltas, never absolute historical snapshots.
-- Older snapshot-only imports fail closed and require reviewed migration.
create or replace function public.rollback_statement_import(p_import_id uuid,p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_import public.statement_imports%rowtype;
  v_effect public.financial_effects%rowtype;
  v_latest_statement public.card_statements%rowtype;
  v_balance_as_of date;
  v_deleted_tx integer := 0;
  v_deleted_stmt integer := 0;
begin
  if auth.uid() is null or p_user_id is null or auth.uid() <> p_user_id then
    return jsonb_build_object('success',false,'error','Yetkisiz erişim.');
  end if;
  select * into v_import from public.statement_imports
  where id=p_import_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('success',false,'error','Ekstre bulunamadı.'); end if;
  if v_import.status='ROLLED_BACK' then return jsonb_build_object('success',true,'already_rolled_back',true,'deleted_transactions',0,'deleted_statements',0); end if;
  if v_import.parser_version is null then
    return jsonb_build_object('success',false,'error','Eski snapshot tabanlı import otomatik geri alınmadı; veri güvenliği için incelenmiş migration gerekir.');
  end if;
  if exists(select 1 from public.statement_imports newer where newer.user_id=p_user_id
      and newer.status='COMPLETED' and newer.created_at>v_import.created_at
      and ((v_import.source_account_id is not null and newer.source_account_id=v_import.source_account_id)
        or (v_import.card_id is not null and newer.card_id=v_import.card_id))) then
    return jsonb_build_object('success',false,'error','Bu importtan sonra aynı hesap/kart için daha yeni import var. Önce en yeni import geri alınmalıdır.');
  end if;
  if exists(
    select 1
    from public.financial_effects mine
    join public.financial_effects newer_effect
      on newer_effect.entity_type=mine.entity_type
     and newer_effect.entity_id=mine.entity_id
     and newer_effect.metric=mine.metric
     and newer_effect.import_id<>mine.import_id
     and newer_effect.status='APPLIED'
    join public.statement_imports newer_import on newer_import.id=newer_effect.import_id
    where mine.import_id=p_import_id
      and mine.status='APPLIED'
      and newer_import.status='COMPLETED'
      and newer_import.created_at>v_import.created_at
  ) then
    return jsonb_build_object('success',false,'error','Bu importun etkilediği bir bakiye daha yeni bir import tarafından değiştirildi. Önce en yeni import geri alınmalıdır.');
  end if;

  for v_effect in select * from public.financial_effects where import_id=p_import_id and status='APPLIED' order by created_at desc,id desc loop
    if v_effect.entity_type='account' and v_effect.metric='balance' then
      update public.accounts set balance=balance-v_effect.delta,updated_at=now() where id=v_effect.entity_id and user_id=p_user_id;
    elsif v_effect.entity_type='card' and v_effect.metric='current_debt' then
      update public.credit_cards set current_debt=greatest(0,current_debt-v_effect.delta),updated_at=now() where id=v_effect.entity_id and user_id=p_user_id;
    elsif v_effect.entity_type='debt' and v_effect.metric='remaining' then
      update public.debts set remaining=greatest(0,remaining-v_effect.delta),status='Açık',updated_at=now() where id=v_effect.entity_id and user_id=p_user_id;
    elsif v_effect.entity_type='debt' and v_effect.metric='past_payments' then
      update public.debts set past_payments=greatest(0,past_payments-v_effect.delta),updated_at=now() where id=v_effect.entity_id and user_id=p_user_id;
    end if;
  end loop;
  update public.financial_effects set status='REVERSED',reversed_at=now() where import_id=p_import_id and status='APPLIED';
  delete from public.card_statements where import_id=p_import_id;
  get diagnostics v_deleted_stmt = row_count;

  if v_import.card_id is not null then
    select * into v_latest_statement from public.card_statements
    where card_id=v_import.card_id
    order by statement_date desc, created_at desc limit 1;
    if found then
      update public.credit_cards set
        statement_debt=v_latest_statement.period_debt,
        minimum_payment=v_latest_statement.minimum,
        interest_fees=v_latest_statement.interest_fees,
        statement_date=v_latest_statement.statement_date,
        due_date=v_latest_statement.due_date,
        updated_at=now()
      where id=v_import.card_id and user_id=p_user_id;
    else
      update public.credit_cards set
        statement_debt=0,minimum_payment=0,interest_fees=0,
        statement_date=null,due_date=null,updated_at=now()
      where id=v_import.card_id and user_id=p_user_id;
    end if;
  end if;

  if v_import.source_account_id is not null then
    update public.account_balance_snapshots set applied=false where import_id=p_import_id;
    select max(s.observed_on) into v_balance_as_of
    from public.account_balance_snapshots s
    join public.statement_imports i on i.id=s.import_id
    where s.account_id=v_import.source_account_id
      and s.import_id<>p_import_id
      and s.applied=true
      and i.status='COMPLETED';
    update public.accounts set balance_as_of=v_balance_as_of,updated_at=now()
    where id=v_import.source_account_id and user_id=p_user_id;
  end if;

  delete from public.transaction_identities identities
  using public.transactions imported
  where identities.transaction_id=imported.id
    and imported.import_id=p_import_id
    and imported.user_id=p_user_id;
  delete from public.transactions where import_id=p_import_id and user_id=p_user_id;
  get diagnostics v_deleted_tx = row_count;
  update public.statement_imports set status='ROLLED_BACK',rolled_back_at=now() where id=p_import_id;
  return jsonb_build_object('success',true,'import_id',p_import_id,'deleted_transactions',v_deleted_tx,'deleted_statements',v_deleted_stmt);
end;
$$;

revoke all on function public.fn_commit_statement_import_atomic(jsonb) from public, anon;
grant execute on function public.fn_commit_statement_import_atomic(jsonb) to authenticated;
revoke all on function public.rollback_statement_import(uuid,uuid) from public, anon;
grant execute on function public.rollback_statement_import(uuid,uuid) to authenticated;
