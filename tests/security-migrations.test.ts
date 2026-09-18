import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'node:url';

// Supabase dizinine giden yolu bul (tests klasörünün bir üstü)
const supabaseMigrationsDir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

describe('Security Migrations Tests', () => {
  describe('Migration Files and Rules', () => {
    it('Tüm migration zinciri (001-022, iki adet 002_ dahil) diskte bulunmalıdır', () => {
      const expectedFiles = [
        '001_initial_schema.sql',
        '002_financial_bridge.sql',
        '002_import_batch_and_rollback.sql',
        '003_link_transactions_to_debts.sql',
        '004_create_investments.sql',
        '005_create_dreams.sql',
        '006_create_routines_and_logs.sql',
        '007_create_journal_entries.sql',
        '008_security_and_financial_integrity.sql',
        '009_projects_ideas_redesign.sql',
        '010_add_project_type.sql',
        '011_create_agenda_items.sql',
        '012_create_credentials_table.sql',
        '013_lock_down_financial_rpcs.sql',
        '014_qa_financial_integrity.sql',
        '015_atomic_payments.sql',
        '016_atomic_card_statement.sql',
        '017_keyset_pagination_and_aggregates.sql',
        '018_idempotent_atomic_import.sql',
        '019_restore_atomic_debt_rpcs.sql',
        '020_repair_transaction_financial_bridge.sql',
        '021_atomic_user_workflows.sql',
        '022_atomic_vault_replace.sql'
      ];

      for (const file of expectedFiles) {
        const filePath = join(supabaseMigrationsDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('Yeni çok-adımlı akışlar SECURITY DEFINER, search_path ve execute kısıtlarıyla atomiktir', () => {
      const workflows = readFileSync(join(supabaseMigrationsDir, '021_atomic_user_workflows.sql'), 'utf-8').toLowerCase();
      const vault = readFileSync(join(supabaseMigrationsDir, '022_atomic_vault_replace.sql'), 'utf-8').toLowerCase();
      for (const rpc of [
        'fn_unlink_transaction_from_debt_atomic',
        'fn_link_transaction_to_investment_atomic',
        'fn_unlink_transaction_from_investment_atomic',
        'fn_promote_idea_to_project_atomic',
      ]) {
        expect(workflows).toContain(`create or replace function public.${rpc}`);
        expect(workflows).toContain(`revoke all on function public.${rpc}`);
      }
      expect(workflows).toContain('security definer set search_path=public,pg_temp');
      expect(vault).toContain('create or replace function public.fn_restore_vault_replace_atomic');
      expect(vault).toContain('security definer set search_path=public,pg_temp');
      expect(vault).toContain('revoke all on function public.fn_restore_vault_replace_atomic');
    });

    it('Migration 008 içerisinde SECURITY DEFINER fonksiyonları tanımlanmış olmalıdır', () => {
      const filePath = join(supabaseMigrationsDir, '008_security_and_financial_integrity.sql');
      const content = readFileSync(filePath, 'utf-8');

      // Beklenen security definer sayısını kontrol et (en az bir veya daha fazla kez geçmeli)
      expect(content.toLowerCase()).toContain('security definer');
      
      // Belirli fonksiyonların içerip içermediğine de bakabiliriz, örneğin rollback_statement_import
      const matches = content.match(/security definer/gi);
      expect(matches?.length).toBeGreaterThan(0);
    });

    it('Migration 008 içerisinde search_path kısıtlaması (SET search_path) bulunmalıdır', () => {
      const filePath = join(supabaseMigrationsDir, '008_security_and_financial_integrity.sql');
      const content = readFileSync(filePath, 'utf-8');

      // set search_path = public kısıtlamasının varlığını kontrol et
      expect(content.toLowerCase()).toContain('set search_path = public');
    });

    it('Migration 013 içerisinde 6 RPC için "revoke all on function public.<name>" kısıtlaması bulunmalıdır', () => {
      const filePath = join(supabaseMigrationsDir, '013_lock_down_financial_rpcs.sql');
      const content = readFileSync(filePath, 'utf-8');

      const expectedRpcs = [
        'rollback_statement_import',
        'fn_record_expense_atomic',
        'fn_record_income_atomic',
        'fn_record_transfer_atomic',
        'fn_delete_transaction_atomic',
        'fn_link_transaction_to_debt_atomic'
      ];

      for (const rpc of expectedRpcs) {
        // SQL dosyasında yorum satırları olarak "revoke all on function public.<name>" geçmekte
        // veya kod bloklarının içinde text şeklinde bulunmaktadır.
        const searchString = `revoke all on function public.${rpc}`;
        expect(content.toLowerCase()).toContain(searchString.toLowerCase());
      }
    });
  });
});
