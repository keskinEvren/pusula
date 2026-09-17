import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const userA = '11111111-1111-4111-8111-111111111111'
const userB = '99999999-9999-4999-8999-999999999999'
const source = '22222222-2222-4222-8222-222222222222'
const foreign = '44444444-4444-4444-8444-444444444444'
const missing = '55555555-5555-4555-8555-555555555555'
describe('isolated PostgreSQL migrations, RLS and financial integrity', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
    const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
    for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(dir + file, 'utf8').replace(/^\uFEFF/, ''))
    await db.exec(`grant usage on schema public to authenticated, anon; grant select,insert,update,delete on all tables in schema public to authenticated, anon;
      insert into auth.users(id,email) values ('${userA}','a@example.test'),('${userB}','b@example.test');
      insert into public.accounts(id,user_id,name,balance) values ('${source}','${userA}','A',1000),('${foreign}','${userB}','B',1000);`)
  }, 60000)
  afterAll(async () => { await db?.close() })
  async function asUser(id: string) { await db.exec(`reset role; set request.jwt.claim.sub = '${id}'; set role authenticated;`) }
  it('RLS isolates reads and rejects another owner insert', async () => {
    await asUser(userA)
    const rows = await db.query('select id from accounts')
    expect(rows.rows).toEqual([{ id: source }])
    await expect(db.query('insert into accounts(user_id,name) values ($1,$2)', [userB, 'forbidden'])).rejects.toThrow(/row-level security/)
  })
  it('transfer to missing account must not debit source', async () => {
    await asUser(userA)
    const before = await db.query('select balance from accounts where id=$1', [source])
    const result = await db.query<{ result: { success: boolean } }>('select fn_record_transfer_atomic($1,$2,$3,$4,$5,$6) as result', [userA,'2026-09-16',100,'QA',source,missing])
    expect(result.rows[0].result.success).toBe(false)
    const after = await db.query('select balance from accounts where id=$1', [source])
    expect(after.rows).toEqual(before.rows)
  })
  it('transfer to another owner must not debit source', async () => {
    await asUser(userA)
    const before = await db.query('select balance from accounts where id=$1', [source])
    const result = await db.query<{ result: { success: boolean } }>('select fn_record_transfer_atomic($1,$2,$3,$4,$5,$6) as result', [userA,'2026-09-16',100,'QA',source,foreign])
    expect(result.rows[0].result.success).toBe(false)
    expect((await db.query('select balance from accounts where id=$1', [source])).rows).toEqual(before.rows)
  })
  it('expense with missing card must not debit account', async () => {
    await asUser(userA)
    const before = await db.query('select balance from accounts where id=$1', [source])
    const result = await db.query<{ result: { success: boolean } }>('select fn_record_expense_atomic($1,$2,$3,$4,$5,$6,$7,$8) as result', [userA,'2026-09-16',100,'QA','Kişisel',null,source,missing])
    expect(result.rows[0].result.success).toBe(false)
    expect((await db.query('select balance from accounts where id=$1', [source])).rows).toEqual(before.rows)
  })
  it('anonymous role cannot execute privileged financial RPC', async () => {
    await db.exec("reset role; set request.jwt.claim.sub = ''; set role anon;")
    await expect(db.query('select fn_record_income_atomic($1,$2,$3,$4,$5,$6,$7)', [userA,'2026-09-16',100,'QA','Kişisel',null,source])).rejects.toThrow(/permission denied/)
  })
  it('payment and delete restore account and card balances', async () => {
    await asUser(userA)
    const card = '77777777-7777-4777-8777-777777777777'
    await db.query('insert into credit_cards(id,user_id,bank,card_name,current_debt) values($1,$2,$3,$4,500)',[card,userA,'QA','QA'])
    const before = (await db.query('select balance from accounts where id=$1',[source])).rows
    const payment = await db.query<{ result: { success: boolean; transaction_id: string } }>('select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',[userA,'2026-09-16',100,'QA','Kart Ödemesi',source,card])
    expect(payment.rows[0].result.success).toBe(true)
    expect((await db.query('select current_debt from credit_cards where id=$1',[card])).rows).toEqual([{current_debt:'400.00'}])
    await db.query('select fn_delete_transaction_atomic($1,$2)',[payment.rows[0].result.transaction_id,userA])
    expect((await db.query('select balance from accounts where id=$1',[source])).rows).toEqual(before)
    expect((await db.query('select current_debt from credit_cards where id=$1',[card])).rows).toEqual([{current_debt:'500.00'}])
  })
  it('payment failure rolls back changes when ledger insert fails', async () => {
    await asUser(userA)
    const before=(await db.query('select balance from accounts where id=$1',[source])).rows
    await expect(db.query('select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7)',[userA,null,50,'QA','Kart Ödemesi',source,'77777777-7777-4777-8777-777777777777'])).rejects.toThrow()
    expect((await db.query('select balance from accounts where id=$1',[source])).rows).toEqual(before)
    expect((await db.query('select current_debt from credit_cards where id=$1', ['77777777-7777-4777-8777-777777777777'])).rows).toEqual([{ current_debt:'500.00' }])
  })
  it('statement persists atomically, rejects duplicates, and preserves newest summary', async () => {
    await asUser(userA)
    const payload={card_id:'77777777-7777-4777-8777-777777777777',statement_date:'2026-09-01',period_debt:600}
    await db.query('select fn_add_card_statement_atomic($1::jsonb)', [JSON.stringify(payload)])
    await expect(db.query('select fn_add_card_statement_atomic($1::jsonb)',[JSON.stringify(payload)])).rejects.toThrow(/zaten/)
    await db.query('select fn_add_card_statement_atomic($1::jsonb)',[JSON.stringify({...payload,statement_date:'2026-08-01',period_debt:900})])
    expect((await db.query('select current_debt from credit_cards where id=$1',[payload.card_id])).rows).toEqual([{current_debt:'600.00'}])
    expect((await db.query('select count(*)::int as count from card_statements where card_id=$1',[payload.card_id])).rows).toEqual([{count:2}])
  })
  it('expense rejects nonfinite values without inserting a transaction', async () => {
    await asUser(userA)
    for (const amount of ['NaN','Infinity','-1','0']) {
      const result=await db.query<{ result: { success: boolean } }>('select fn_record_expense_atomic($1,$2,$3::numeric,$4,$5,$6,$7) as result',[userA,'2026-09-16',amount,'QA','Kişisel',null,source])
      expect(result.rows[0].result.success).toBe(false)
    }
  })
  it('fn_transactions_stats calculates aggregates accurately with filter and RLS parity', async () => {
    await asUser(userA)
    // Insert test transactions for userA
    await db.query(`insert into transactions (user_id, date, amount, type, analysis_group, merchant, description) values
      ('${userA}', '2026-09-10', 1000.00, 'Harcama', 'Kişisel', 'Market A', 'Alışveriş'),
      ('${userA}', '2026-09-11', 200.00, 'İade', 'Kişisel', 'Market A', 'İade'),
      ('${userA}', '2026-09-12', 5000.00, 'Gelir', 'İş', 'Müşteri X', 'Hakediş'),
      ('${userA}', '2026-09-15', 300.00, 'Harcama', 'Hariç', 'Borsa', 'Yatırım')`)

    const res = await db.query<{ stats: any }>('select fn_transactions_stats() as stats')
    const stats = res.rows[0].stats
    // total_count: 4 transactions
    expect(stats.total_count).toBe(4)
    // total_volume: 1000 + 200 + 5000 + 300 = 6500.00
    expect(Number(stats.total_volume)).toBe(6500)
    // total_spent: Harcama(1000) - İade(200) + Gelir(0) + Hariç(0) = 800.00
    expect(Number(stats.total_spent)).toBe(800)

    // Filter by month
    const monthRes = await db.query<{ stats: any }>("select fn_transactions_stats(p_month => '2026-09') as stats")
    expect(monthRes.rows[0].stats.total_count).toBe(4)

    const otherMonthRes = await db.query<{ stats: any }>("select fn_transactions_stats(p_month => '2026-08') as stats")
    expect(otherMonthRes.rows[0].stats.total_count).toBe(0)
  })
  it('fn_project_finance_summary and fn_all_projects_direct_costs calculate project costs correctly and isolate users', async () => {
    await asUser(userA)
    const projA = '33333333-3333-4333-8333-333333333333'
    await db.query(`insert into projects(id, user_id, name, slug, budget_limit) values ('${projA}', '${userA}', 'Pusula Core', 'pusula-core', 50000)`)
    await db.query(`insert into transactions (user_id, project_id, date, amount, type, analysis_group, description) values
      ('${userA}', '${projA}', '2026-09-01', 2500.00, 'Harcama', 'İş', 'Sunucu Masrafı'),
      ('${userA}', '${projA}', '2026-09-05', 10000.00, 'Gelir', 'İş', 'Lisans Satışı')`)

    const projRes = await db.query<{ summary: any }>(`select fn_project_finance_summary('${projA}') as summary`)
    const summary = projRes.rows[0].summary
    expect(Number(summary.direct_cost_total)).toBe(12500)
    expect(Number(summary.direct_expense)).toBe(2500)
    expect(Number(summary.direct_revenue)).toBe(10000)
    expect(summary.total_count).toBe(2)

    // All projects RPC
    const allProjRes = await db.query<{ costs: any }>('select fn_all_projects_direct_costs() as costs')
    expect(Number(allProjRes.rows[0].costs[projA])).toBe(12500)

    // Another user cannot access userA's project summary
    await asUser(userB)
    await expect(db.query(`select fn_project_finance_summary('${projA}')`)).rejects.toThrow(/yetkisiz/)
  })
  it('fn_transactions_page retrieves pages with row-constructor keyset seeking and isolates users', async () => {
    await asUser(userA)
    // We already have transactions for userA from previous test:
    // 2026-09-10 (1000 Harcama Kişisel), 2026-09-11 (200 İade Kişisel), 2026-09-12 (5000 Gelir İş), 2026-09-15 (300 Harcama Hariç)
    // plus project transactions: 2026-09-01 (2500 Harcama İş), 2026-09-05 (10000 Gelir İş)
    // Total 6 transactions for userA

    // 1. Initial Page (Date DESC) with p_limit = 2
    const p1 = await db.query<{ id: string; date: any; amount: string }>('select id, date, amount from fn_transactions_page(p_limit => 2)')
    expect(p1.rows.length).toBe(2)
    const toDateStr = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
    // Ordered date DESC: first should be 2026-09-15, second 2026-09-12
    expect(toDateStr(p1.rows[0].date)).toBe('2026-09-15')
    expect(toDateStr(p1.rows[1].date)).toBe('2026-09-12')

    // 2. Cursor Page (Date DESC) using second row as cursor
    const cursorDate = toDateStr(p1.rows[1].date)
    const cursorId = p1.rows[1].id
    const p2 = await db.query<{ id: string; date: any; amount: string }>(
      'select id, date, amount from fn_transactions_page(p_cursor_date => $1::date, p_cursor_id => $2::uuid, p_limit => 2)',
      [cursorDate, cursorId]
    )
    expect(p2.rows.length).toBe(2)
    // Next should be 2026-09-11 and 2026-09-10
    expect(toDateStr(p2.rows[0].date)).toBe('2026-09-11')
    expect(toDateStr(p2.rows[1].date)).toBe('2026-09-10')

    // 3. Amount DESC sorting
    const pAmt = await db.query<{ id: string; amount: string }>(
      "select id, amount from fn_transactions_page(p_sort_field => 'amount', p_sort_order => 'desc', p_limit => 2)"
    )
    expect(pAmt.rows.length).toBe(2)
    expect(Number(pAmt.rows[0].amount)).toBe(10000)
    expect(Number(pAmt.rows[1].amount)).toBe(5000)

    // Cursor on Amount DESC
    const curAmt = pAmt.rows[1].amount
    const curAmtId = pAmt.rows[1].id
    const pAmt2 = await db.query<{ id: string; amount: string }>(
      "select id, amount from fn_transactions_page(p_sort_field => 'amount', p_sort_order => 'desc', p_cursor_amount => $1::numeric, p_cursor_id => $2::uuid, p_limit => 2)",
      [curAmt, curAmtId]
    )
    expect(pAmt2.rows.length).toBe(2)
    expect(Number(pAmt2.rows[0].amount)).toBe(2500)
    expect(Number(pAmt2.rows[1].amount)).toBe(1000)

    // 4. Search filtering
    const pSearch = await db.query<{ id: string; description: string }>(
      "select id, description from fn_transactions_page(p_search => 'Sunucu')"
    )
    expect(pSearch.rows.length).toBe(1)
    expect(pSearch.rows[0].description).toBe('Sunucu Masrafı')

    // 5. User isolation: User B must not see User A's transactions
    await asUser(userB)
    const pUserB = await db.query('select id from fn_transactions_page()')
    expect(pUserB.rows.length).toBe(0)
  })

  it('statement import is atomic, idempotent and reverses its recorded delta', async () => {
    await asUser(userA)
    const before = await db.query<{ balance: string }>('select balance from accounts where id=$1', [source])
    const payload = {
      user_id: userA,
      idempotency_key: 'db-test-import-v1',
      parser_version: 'db-test-parser-v1',
      file_name: 'hesap.csv',
      file_hash: 'db-test-file-hash-v1',
      import_type: 'bank_account',
      bank: 'Test Bankası',
      account_id: source,
      source_account_ref: 'TR-TEST-1',
      transactions: [{
        row_index: 0,
        date: '2026-09-17',
        direction: 'outflow',
        type: 'Harcama',
        description: 'Atomik import testi',
        merchant: 'Test',
        amount: 25,
        analysis_group: 'Kişisel',
        action: 'DIRECT_EXPENSE',
        classification_status: 'HIGH_CONFIDENCE',
        confidence: 'high',
        classification_reasons: ['test'],
        external_reference: 'BANK-REF-ATOMIC-1',
        source_fingerprint: 'strong-fingerprint-db-test-1',
        weak_fingerprint: 'weak-fingerprint-db-test-1',
        fingerprint_strength: 'strong',
        duplicate_status: 'NEW',
      }],
    }

    const first = await db.query<{ result: any }>(
      'select fn_commit_statement_import_atomic($1::jsonb) as result',
      [JSON.stringify(payload)]
    )
    expect(first.rows[0].result.success).toBe(true)
    expect(first.rows[0].result.inserted_transactions).toBe(1)

    const after = await db.query<{ balance: string }>('select balance from accounts where id=$1', [source])
    expect(Number(after.rows[0].balance)).toBe(Number(before.rows[0].balance) - 25)

    const repeated = await db.query<{ result: any }>(
      'select fn_commit_statement_import_atomic($1::jsonb) as result',
      [JSON.stringify(payload)]
    )
    expect(repeated.rows[0].result.success).toBe(true)
    expect(repeated.rows[0].result.already_committed).toBe(true)

    const renamedPayload = {
      ...payload,
      idempotency_key: 'db-test-import-renamed-v1',
      file_name: 'hesap-yeniden.csv',
      file_hash: 'db-test-file-hash-renamed-v1',
    }
    const duplicateRows = await db.query<{ result: any }>(
      'select fn_commit_statement_import_atomic($1::jsonb) as result',
      [JSON.stringify(renamedPayload)]
    )
    expect(duplicateRows.rows[0].result.success).toBe(true)
    expect(duplicateRows.rows[0].result.inserted_transactions).toBe(0)
    expect(duplicateRows.rows[0].result.skipped_duplicates).toBe(1)

    const rollbackDuplicateObservation = await db.query<{ result: any }>(
      'select rollback_statement_import($1::uuid,$2::uuid) as result',
      [duplicateRows.rows[0].result.import_id, userA]
    )
    expect(rollbackDuplicateObservation.rows[0].result.success).toBe(true)

    const rollback = await db.query<{ result: any }>(
      'select rollback_statement_import($1::uuid,$2::uuid) as result',
      [first.rows[0].result.import_id, userA]
    )
    expect(rollback.rows[0].result.success).toBe(true)
    expect(rollback.rows[0].result.deleted_transactions).toBe(1)

    const restored = await db.query<{ balance: string }>('select balance from accounts where id=$1', [source])
    expect(Number(restored.rows[0].balance)).toBe(Number(before.rows[0].balance))

    const foreignProject = '77777777-7777-4777-8777-777777777777'
    await asUser(userB)
    await db.query(
      'insert into projects(id,user_id,name,slug) values ($1,$2,$3,$4)',
      [foreignProject, userB, 'Foreign Project', 'foreign-project']
    )
    await asUser(userA)
    const crossTenantPayload = {
      ...payload,
      idempotency_key: 'db-test-cross-tenant-v1',
      file_hash: 'db-test-cross-tenant-file-v1',
      transactions: [{
        ...payload.transactions[0],
        project_id: foreignProject,
        external_reference: 'BANK-REF-CROSS-TENANT-1',
        source_fingerprint: 'strong-fingerprint-cross-tenant-1',
        weak_fingerprint: 'weak-fingerprint-cross-tenant-1',
      }],
    }
    await expect(db.query(
      'select fn_commit_statement_import_atomic($1::jsonb)',
      [JSON.stringify(crossTenantPayload)]
    )).rejects.toThrow(/kullanıcıya ait değil/)
  })
})


