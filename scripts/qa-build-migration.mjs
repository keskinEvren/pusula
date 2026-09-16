// One-shot generator for reviewed replacements of existing financial functions.
import { readFileSync, writeFileSync } from 'node:fs'
const source = readFileSync('supabase/migrations/008_security_and_financial_integrity.sql', 'utf8').replaceAll('\r\n', '\n')
function extract(name) { const start = source.indexOf(`create or replace function public.${name}(`); return source.slice(start, source.indexOf('$$;', start) + 3) }
let expense = extract('fn_record_expense_atomic')
expense = expense.replace('if p_amount <= 0 then', "if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then")
expense = expense.replace('  -- Vadesiz hesaptan harcama:', `  -- Validate and lock every referenced entity BEFORE any mutation.
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

  -- Vadesiz hesaptan harcama:`)
let transfer = extract('fn_record_transfer_atomic')
transfer = transfer.replace('if p_amount <= 0 then', "if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then")
transfer = transfer.replace('  if p_source_account_id = p_target_account_id then', `  if p_source_account_id is null or p_target_account_id is null then
    return jsonb_build_object('success', false, 'error', 'Kaynak ve hedef hesap seçilmelidir.');
  end if;
  if p_source_account_id = p_target_account_id then`)
transfer = transfer.replace('  perform id from public.accounts where id = v_first_id and user_id = p_user_id for update;\n  perform id from public.accounts where id = v_second_id and user_id = p_user_id for update;', `  perform id from public.accounts where id = v_first_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;
  perform id from public.accounts where id = v_second_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Hesap bulunamadı veya yetkisiz erişim.');
  end if;`)
let income = extract('fn_record_income_atomic')
income = income.replace('if p_amount <= 0 then', "if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 then")
income = income.replace('  select balance into v_acc_balance', `  if p_project_id is not null and not exists (select 1 from public.projects where id=p_project_id and user_id=p_user_id) then
    return jsonb_build_object('success', false, 'error', 'Proje bulunamadı veya yetkisiz erişim.');
  end if;
  select balance into v_acc_balance`)
let del = extract('fn_delete_transaction_atomic')
del = del.replace("  elsif v_tx.type = 'Gelir'", `  elsif v_tx.type = 'Kart Ödemesi' then
    update public.accounts set balance = balance + v_tx.amount, updated_at = now()
    where id = v_tx.account_id and user_id = p_user_id;
    update public.credit_cards set current_debt = current_debt + v_tx.amount, updated_at = now()
    where id = v_tx.card_id and user_id = p_user_id;
  elsif v_tx.type = 'Gelir'`)
const output = '-- QA-01/02: reject invalid financial references before mutation.\n-- Existing RPC signatures and privileges are preserved by CREATE OR REPLACE.\n\n' + [expense, income, transfer, del].join('\n\n') + '\n'
writeFileSync('supabase/migrations/014_qa_financial_integrity.sql', output)
