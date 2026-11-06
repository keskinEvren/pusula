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
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
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
  it('decoupled manual card payment reduces current_debt and increments statement payments without account or transaction', async () => {
    await asUser(userA)
    const card = '77777777-7777-4777-8777-777777777777'
    const stmt = '66666666-6666-4666-8666-666666666666'
    await db.query(
      'insert into card_statements(id,card_id,statement_date,period_debt,minimum,payments) values($1,$2,$3,$4,$5,$6)',
      [stmt, card, '2026-09-10', 500, 100, 0]
    )
    const accountBefore = await db.query('select balance from accounts where id=$1', [source])
    const txCountBefore = await db.query<{ count: string }>('select count(*)::text as count from transactions')

    const payment = await db.query<{ result: { success: boolean; transaction_id: string | null } }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA, '2026-09-17', 150, 'Manuel Ara Ödeme', 'Kart Ödemesi', null, card]
    )
    expect(payment.rows[0].result.success).toBe(true)
    expect(payment.rows[0].result.transaction_id).toBeNull()

    expect((await db.query('select current_debt from credit_cards where id=$1', [card])).rows)
      .toEqual([{ current_debt: '350.00' }])

    expect((await db.query('select payments from card_statements where id=$1', [stmt])).rows)
      .toEqual([{ payments: '150.00' }])

    expect((await db.query('select balance from accounts where id=$1', [source])).rows).toEqual(accountBefore.rows)
    expect((await db.query<{ count: string }>('select count(*)::text as count from transactions')).rows[0].count)
      .toBe(txCountBefore.rows[0].count)

    const overpay = await db.query<{ result: { success: boolean; error: string } }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA, '2026-09-17', 400, 'Fazla Ödeme', 'Kart Ödemesi', null, card]
    )
    expect(overpay.rows[0].result.success).toBe(false)
    expect(overpay.rows[0].result.error).toMatch(/Tutar kalan borcu aşamaz/)

    // Sub-cent validation: 0.004 rounds to 0.00, so must be rejected
    const subPenny = await db.query<{ result: { success: boolean; error: string } }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA, '2026-09-17', 0.004, 'Kuruş altı', 'Kart Ödemesi', null, card]
    )
    expect(subPenny.rows[0].result.success).toBe(false)
    expect(subPenny.rows[0].result.error).toMatch(/Tutar sıfırdan büyük olmalıdır/)

    // Payment without statement: delete statement first, then pay 50.126 which rounds to 50.13
    await db.query('delete from card_statements where id=$1', [stmt])
    const noStmtPayment = await db.query<{ result: { success: boolean; transaction_id: string | null } }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA, '2026-09-17', 50.126, 'Ekstresiz Ödeme', 'Kart Ödemesi', null, card]
    )
    expect(noStmtPayment.rows[0].result.success).toBe(true)
    expect((await db.query('select current_debt from credit_cards where id=$1', [card])).rows)
      .toEqual([{ current_debt: '299.87' }]) // 350.00 - 50.13 = 299.87

    await db.query('update credit_cards set current_debt=500 where id=$1', [card])
  })
  it('debt adjustments and existing transaction links are atomic and idempotent', async () => {
    await asUser(userA)
    const debt = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await db.query(
      `insert into debts(id,user_id,type,category,person_or_entity,principal,past_payments,remaining,status)
       values($1,$2,'Borç','Test','Test Borcu',300,0,300,'Açık')`,
      [debt,userA]
    )
    const accountBefore = await db.query('select balance from accounts where id=$1',[source])

    const tableOnly = await db.query<{ result: any }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA,'2026-09-17',100,'Tablodan düş','Borç Ödemesi',null,debt]
    )
    expect(tableOnly.rows[0].result.success).toBe(true)
    expect(tableOnly.rows[0].result.transaction_id).toBeNull()
    expect((await db.query('select remaining,past_payments from debts where id=$1',[debt])).rows)
      .toEqual([{remaining:'200.00',past_payments:'100.00'}])
    expect((await db.query('select balance from accounts where id=$1',[source])).rows).toEqual(accountBefore.rows)

    // fn_link_transaction_to_debt_atomic was dropped in migration 032
    await expect(db.query('select fn_link_transaction_to_debt_atomic($1,$2,$3)', [userA, debt, debt])).rejects.toThrow()

    const accountPayment = await db.query<{ result: any }>(
      'select fn_record_payment_atomic($1,$2,$3,$4,$5,$6,$7) as result',
      [userA,'2026-09-17',50,'Hesaptan borç ödeme','Borç Ödemesi',source,debt]
    )
    expect(accountPayment.rows[0].result.success).toBe(true)
    expect((await db.query('select remaining,past_payments from debts where id=$1',[debt])).rows)
      .toEqual([{remaining:'150.00',past_payments:'150.00'}])
    const accountAfter = await db.query<{balance:string}>('select balance from accounts where id=$1',[source])
    expect(Number(accountAfter.rows[0].balance)).toBe(Number((accountBefore.rows[0] as any).balance)-50)

    // Keep later aggregate/pagination tests isolated from this scenario.
    const paymentTxId = accountPayment.rows[0].result.transaction_id
    await db.query('delete from transactions where id=$1',[paymentTxId])
    await db.query('delete from debts where id=$1',[debt])
    await db.query('update accounts set balance=$1 where id=$2',[(accountBefore.rows[0] as any).balance,source])
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
  it('migration 032 successfully dropped legacy bridge columns and functions', async () => {
    await asUser(userA)
    const projA = '33333333-3333-4333-8333-333333333333'
    await db.query(`insert into projects(id, user_id, name, slug) values ('${projA}', '${userA}', 'Pusula Core', 'pusula-core')`)
    await expect(db.query(`insert into projects(id, user_id, name, slug, budget_limit) values ('${projA}-2', '${userA}', 'Pusula Core 2', 'pusula-core-2', 50000)`)).rejects.toThrow()
    await expect(db.query(`select fn_project_finance_summary('${projA}')`)).rejects.toThrow()
    await expect(db.query('select fn_all_projects_direct_costs()')).rejects.toThrow()
    // Insert 2 transactions for userA so subsequent pagination/count tests have expected counts
    await db.query(`insert into transactions (user_id, date, amount, type, analysis_group, description) values
      ('${userA}', '2026-09-01', 2500.00, 'Harcama', 'İş', 'Sunucu Masrafı'),
      ('${userA}', '2026-09-05', 10000.00, 'Gelir', 'İş', 'Lisans Satışı')`)
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

    // Verify CARD_PAYMENT statement_date guard:
    // A payment on/before statement_date does NOT reduce current_debt (already reflected in statement),
    // whereas a payment strictly after statement_date reduces current_debt.
    const stmtCard = '88888888-8888-4888-8888-888888888888'
    await db.query(
      'insert into credit_cards(id,user_id,bank,card_name,current_debt,statement_date) values ($1,$2,$3,$4,1000,$5)',
      [stmtCard, userA, 'Akbank', 'Axess', '2026-09-15']
    )
    const cardPayPayload = {
      ...payload,
      idempotency_key: 'db-test-card-stmt-date-guard-v1',
      file_hash: 'db-test-card-stmt-date-guard-hash-v1',
      transactions: [
        {
          ...payload.transactions[0],
          row_index: 0,
          date: '2026-09-10', // before statement_date -> should NOT reduce current_debt
          type: 'Kart Ödemesi',
          action: 'CARD_PAYMENT',
          target_card_id: stmtCard,
          amount: 300,
          analysis_group: 'Hariç',
          classification_status: 'HIGH_CONFIDENCE',
          external_reference: 'BANK-REF-CARD-OLD-1',
          source_fingerprint: 'strong-fp-card-old-1',
          weak_fingerprint: 'weak-fp-card-old-1',
        },
        {
          ...payload.transactions[0],
          row_index: 1,
          date: '2026-09-20', // after statement_date -> SHOULD reduce current_debt by 200
          type: 'Kart Ödemesi',
          action: 'CARD_PAYMENT',
          target_card_id: stmtCard,
          amount: 200,
          analysis_group: 'Hariç',
          classification_status: 'HIGH_CONFIDENCE',
          external_reference: 'BANK-REF-CARD-NEW-1',
          source_fingerprint: 'strong-fp-card-new-1',
          weak_fingerprint: 'weak-fp-card-new-1',
        },
      ],
    }
    const cardPayRes = await db.query<{ result: any }>(
      'select fn_commit_statement_import_atomic($1::jsonb) as result',
      [JSON.stringify(cardPayPayload)]
    )
    expect(cardPayRes.rows[0].result.success).toBe(true)
    // Decoupled architecture: bank statement import does not mutate other credit cards
    const cardAfter = await db.query<{ current_debt: string }>('select current_debt from credit_cards where id=$1', [stmtCard])
    expect(Number(cardAfter.rows[0].current_debt)).toBe(1000)
    await db.query('select rollback_statement_import($1::uuid,$2::uuid)', [cardPayRes.rows[0].result.import_id, userA])
    const cardRestored = await db.query<{ current_debt: string }>('select current_debt from credit_cards where id=$1', [stmtCard])
    expect(Number(cardRestored.rows[0].current_debt)).toBe(1000)

    // Summary-only mode: updates card statement & debt without inserting any transactions, and rolls back cleanly
    const summaryCardPayload = {
      user_id: userA,
      idempotency_key: 'db-test-summary-only-card-v1',
      parser_version: 'db-test-parser-v1',
      file_name: 'ozet-kart.pdf',
      file_hash: 'db-test-summary-only-card-hash-v1',
      import_type: 'credit_card',
      summary_only: true,
      observed_date: '2026-10-15',
      bank: 'Akbank',
      card_id: stmtCard,
      statement_date: '2026-10-15',
      due_date: '2026-10-25',
      statement_debt: 2450,
      minimum_payment: 490,
      interest_fees: 0,
      transactions: [],
    }
    const summaryCardRes = await db.query<{ result: any }>(
      'select fn_commit_statement_import_atomic($1::jsonb) as result',
      [JSON.stringify(summaryCardPayload)]
    )
    expect(summaryCardRes.rows[0].result.success).toBe(true)
    expect(summaryCardRes.rows[0].result.inserted_transactions).toBe(0)
    const cardSummaryAfter = await db.query<{ current_debt: string; statement_debt: string }>(
      'select current_debt, statement_debt from credit_cards where id=$1',
      [stmtCard]
    )
    expect(Number(cardSummaryAfter.rows[0].current_debt)).toBe(2450)
    expect(Number(cardSummaryAfter.rows[0].statement_debt)).toBe(2450)
    await db.query('select rollback_statement_import($1::uuid,$2::uuid)', [summaryCardRes.rows[0].result.import_id, userA])
    const cardSummaryRestored = await db.query<{ current_debt: string }>(
      'select current_debt from credit_cards where id=$1',
      [stmtCard]
    )
    expect(Number(cardSummaryRestored.rows[0].current_debt)).toBe(1000)

    const foreignAccount = '77777777-7777-4777-8777-777777777777'
    await asUser(userB)
    await db.query(
      'insert into accounts(id,user_id,name,type,balance) values ($1,$2,$3,$4,100)',
      [foreignAccount, userB, 'Foreign Account', 'vadesiz']
    )
    await asUser(userA)
    const crossTenantPayload = {
      ...payload,
      account_id: foreignAccount,
      idempotency_key: 'db-test-cross-tenant-v1',
      file_hash: 'db-test-cross-tenant-file-v1',
    }
    await expect(db.query(
      'select fn_commit_statement_import_atomic($1::jsonb)',
      [JSON.stringify(crossTenantPayload)]
    )).rejects.toThrow(/Hedef hesap bulunamadı/)
  })

  it('debt unlink and investment link/unlink complete as atomic RPCs', async () => {
    await asUser(userA)
    const debt='12121212-1212-4212-8212-121212121212'
    const investment='13131313-1313-4313-8313-131313131313'
    const debtTx='14141414-1414-4414-8414-141414141414'
    const investmentTx='15151515-1515-4515-8515-151515151515'
    await db.query(`insert into debts(id,user_id,type,person_or_entity,principal,remaining) values($1,$2,'Borç','Atomic',100,100)`,[debt,userA])
    await db.query(`insert into investments(id,user_id,name,category,quantity,unit_cost,current_price) values($1,$2,'Fund','Diğer',10,20,20)`,[investment,userA])
    await db.query(`insert into transactions(id,user_id,date,type,description,amount) values($1,$2,current_date,'Harcama','Debt',25),($3,$2,current_date,'Harcama','Investment',60)`,[debtTx,userA,investmentTx])

    // In migration 032, legacy linking RPCs have been dropped
    await expect(db.query('select fn_link_transaction_to_debt_atomic($1,$2,$3)', [userA, debtTx, debt])).rejects.toThrow()
    await expect(db.query('select fn_unlink_transaction_from_debt_atomic($1,$2)', [userA, debtTx])).rejects.toThrow()
    await expect(db.query('select fn_link_transaction_to_investment_atomic($1,$2,$3,$4,$5)', [userA, investmentTx, investment, 2, 30])).rejects.toThrow()
    await expect(db.query('select fn_unlink_transaction_from_investment_atomic($1,$2)', [userA, investmentTx])).rejects.toThrow()
  })

  it('idea promotion is all-or-nothing and idempotent', async () => {
    await asUser(userA)
    const idea='16161616-1616-4616-8616-161616161616'
    await db.query(`insert into ideas(id,user_id,title,description) values($1,$2,'Atomic idea','Description')`,[idea,userA])
    const first=await db.query<{result:any}>('select fn_promote_idea_to_project_atomic($1,$2,$3) result',[userA,idea,'atomic-idea'])
    expect(first.rows[0].result.success).toBe(true)
    const second=await db.query<{result:any}>('select fn_promote_idea_to_project_atomic($1,$2,$3) result',[userA,idea,'different-slug'])
    expect(second.rows[0].result.already_promoted).toBe(true)
    expect((await db.query('select count(*)::int count from projects where id=$1',[first.rows[0].result.project_id])).rows).toEqual([{count:1}])
  })

  it('vault replace rolls cleanup back when any restored row is invalid', async () => {
    await asUser(userA)
    const before=await db.query('select name,balance from accounts where id=$1',[source])
    const invalid={ accounts:[{id:source,user_id:userA,name:null}], credit_cards:[], transactions:[], debts:[], debt_installments:[], subscriptions:[], incomes:[], statement_imports:[], merchant_mappings:[], investments:[], projects:[], ideas:[], agenda_items:[], dreams:[], routines:[], routine_logs:[], journal_entries:[], credentials:[], card_statements:[] }
    await expect(db.query('select fn_restore_vault_replace_atomic($1::jsonb)',[JSON.stringify(invalid)])).rejects.toThrow()
    expect((await db.query('select name,balance from accounts where id=$1',[source])).rows).toEqual(before.rows)
  })

  it('vault replace backward compatibility: restores legacy backup containing dropped bridge columns', async () => {
    await asUser(userA)
    const legacyData = {
      accounts: [{ id: source, user_id: userA, name: 'Main Account', balance: 1000, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' }],
      credit_cards: [],
      transactions: [{
        id: '99999999-9999-4999-8999-999999999999',
        user_id: userA,
        date: '2026-10-01',
        type: 'Harcama',
        description: 'Legacy Transaction',
        amount: 150,
        analysis_group: 'Kişisel',
        project_id: '88888888-8888-4888-8888-888888888888',
        source_account_id: source,
        target_account_id: null,
        related_debt_id: null,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      debts: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: userA,
        person_or_entity: 'Legacy Friend',
        type: 'Borç',
        principal: 500,
        remaining: 500,
        past_payments: 0,
        status: 'Açık',
        linked_account_id: source,
        project_id: null,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      debt_installments: [],
      subscriptions: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        user_id: userA,
        service: 'Old Tool',
        group_type: 'İş',
        model: 'Aylık',
        amount: 100,
        currency: 'TRY',
        period: 'Aylık',
        status: 'Aktif',
        decision: 'Devam',
        project_id: null,
        payment_card_id: null,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      incomes: [{
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        user_id: userA,
        title: 'Legacy Contract',
        category: 'Freelance & Danışmanlık',
        amount: 10000,
        status: 'Aktif',
        income_type: 'Sabit',
        period: 'Aylık',
        currency: 'TRY',
        project_id: null,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      statement_imports: [],
      merchant_mappings: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        user_id: userA,
        raw_pattern: 'OLDSHOP',
        merchant_name: 'Old Shop',
        default_group: 'Kişisel',
        default_project_id: null,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      investments: [],
      projects: [{
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        user_id: userA,
        name: 'Legacy Project',
        slug: 'legacy-project',
        status: 'Planlama',
        budget_limit: 10000,
        created_at: '2026-10-29T00:00:00Z',
        updated_at: '2026-10-29T00:00:00Z',
      }],
      ideas: [],
      agenda_items: [],
      dreams: [],
      routines: [],
      routine_logs: [],
      journal_entries: [],
      credentials: [],
      card_statements: []
    }

    const restoreRes = await db.query<{ result: { success: boolean } }>('select fn_restore_vault_replace_atomic($1::jsonb) as result', [JSON.stringify(legacyData)])
    expect(restoreRes.rows[0].result.success).toBe(true)
    const restoredProjects = await db.query('select name, slug from projects where id=$1', ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'])
    expect(restoredProjects.rows).toEqual([{ name: 'Legacy Project', slug: 'legacy-project' }])
  })

  it('vault replace successfully restores incomes and debt_installments atomically', async () => {
    await asUser(userA)
    const testIncomeId = '31313131-3131-4131-8131-313131313131'
    const testDebtId = '32323232-3232-4232-8232-323232323232'
    const testInstId = '33333333-3333-4333-8333-333333333333'

    const validData = {
      accounts: [{ id: source, user_id: userA, name: 'Main Account', balance: 1000, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' }],
      credit_cards: [],
      transactions: [],
      debts: [{ id: testDebtId, user_id: userA, person_or_entity: 'Bank', type: 'Borç', principal: 1000, remaining: 1000, past_payments: 0, status: 'Açık', created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' }],
      debt_installments: [{ id: testInstId, debt_id: testDebtId, user_id: userA, installment_no: 1, due_date: '2026-12-01', amount: 500, status: 'Bekliyor', created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' }],
      subscriptions: [],
      incomes: [{ id: testIncomeId, user_id: userA, title: 'Freelance Design', category: 'Freelance & Danışmanlık', amount: 25000, status: 'Aktif', income_type: 'Sabit', period: 'Aylık', currency: 'TRY', created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' }],
      statement_imports: [],
      merchant_mappings: [],
      investments: [],
      projects: [],
      ideas: [],
      agenda_items: [],
      dreams: [],
      routines: [],
      routine_logs: [],
      journal_entries: [],
      credentials: [],
      card_statements: []
    }

    const restoreRes = await db.query<{ result: { success: boolean } }>('select fn_restore_vault_replace_atomic($1::jsonb) as result', [JSON.stringify(validData)])
    expect(restoreRes.rows[0].result.success).toBe(true)

    // Verify restored rows
    const restoredIncome = await db.query('select title, amount from incomes where id=$1 and user_id=$2', [testIncomeId, userA])
    expect(restoredIncome.rows).toEqual([{ title: 'Freelance Design', amount: '25000.00' }])

    const restoredInst = await db.query('select installment_no, amount from debt_installments where id=$1 and user_id=$2', [testInstId, userA])
    expect(restoredInst.rows).toEqual([{ installment_no: 1, amount: '500.00' }])
  })

  it('notification triggers schema: isolates push_subscriptions and preferences across users', async () => {
    // 1. User A inserts push subscription and preferences
    await asUser(userA)
    const endpointA = 'https://fcm.googleapis.com/fcm/send/device-user-a'
    await db.query(
      `insert into push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, 'key-a', 'auth-a', 'Chrome')`,
      [userA, endpointA]
    )
    await db.query(
      `insert into notification_preferences(user_id, email, morning_enabled, evening_enabled, weekly_finance_enabled)
       values ($1, 'user-a@example.com', true, true, true)`,
      [userA]
    )

    // User A can read own subscription and preferences
    const subsA = await db.query('select endpoint from push_subscriptions')
    expect(subsA.rows).toEqual([{ endpoint: endpointA }])
    const prefsA = await db.query('select email from notification_preferences')
    expect(prefsA.rows).toEqual([{ email: 'user-a@example.com' }])

    // 2. User B cannot read, update, or delete User A's push subscriptions or preferences
    await asUser(userB)
    const subsB = await db.query('select endpoint from push_subscriptions')
    expect(subsB.rows).toEqual([])
    const prefsB = await db.query('select email from notification_preferences')
    expect(prefsB.rows).toEqual([])

    // User B cannot delete User A's subscription
    await db.query('delete from push_subscriptions where endpoint = $1', [endpointA])
    // User B cannot update User A's preferences
    await db.query(`update notification_preferences set email = 'hacked@example.com' where user_id = $1`, [userA])

    // 3. User A's data remains untouched
    await asUser(userA)
    const checkSubs = await db.query('select endpoint from push_subscriptions')
    expect(checkSubs.rows).toEqual([{ endpoint: endpointA }])
    const checkPrefs = await db.query('select email, last_morning_sent_date from notification_preferences')
    expect(checkPrefs.rows).toEqual([{ email: 'user-a@example.com', last_morning_sent_date: null }])

    // Update idempotency field works for owner
    await db.query(`update notification_preferences set last_morning_sent_date = '2026-10-16' where user_id = $1`, [userA])
    const updatedPrefs = await db.query('select last_morning_sent_date from notification_preferences where user_id = $1', [userA])
    expect(updatedPrefs.rows).toEqual([{ last_morning_sent_date: '2026-10-16' }])
  })

  it('migration 031: accounts table supports yield, rate, withholdings, reserve, and maturity columns', async () => {
    await asUser(userA)
    const accId = '33333333-3333-4333-8333-333333333333'
    await db.query(
      `insert into accounts(id, user_id, name, type, balance, interest_rate, withholding_tax_rate, reserved_base_amount, maturity_date, last_yield_applied_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [accId, userA, 'VakıfBank ARI', 'gunluk_birikim', 50000, 49.00, 10.00, 2500.00, '2026-12-31', '2026-11-05']
    )

    const row = await db.query(
      `select name, type, balance, interest_rate, withholding_tax_rate, reserved_base_amount, maturity_date::text, last_yield_applied_at::text
       from accounts where id = $1`,
      [accId]
    )

    expect(row.rows).toEqual([
      {
        name: 'VakıfBank ARI',
        type: 'gunluk_birikim',
        balance: '50000.00',
        interest_rate: '49.00',
        withholding_tax_rate: '10.00',
        reserved_base_amount: '2500.00',
        maturity_date: '2026-12-31',
        last_yield_applied_at: '2026-11-05',
      },
    ])

    // Apply yield via fn_record_income_atomic and update last_yield_applied_at
    const incomeRes = await db.query<{ result: { success: boolean; transaction_id: string } }>(
      'select fn_record_income_atomic($1, $2, $3, $4, $5, $6, $7) as result',
      [userA, '2026-11-06', 57.39, 'VakıfBank ARI — Günlük Birikim Getirisi (Damla)', 'Kişisel', 'Mevduat / Faiz Getirisi', accId]
    )
    expect(incomeRes.rows[0].result.success).toBe(true)

    await db.query('update accounts set last_yield_applied_at = $1 where id = $2 and user_id = $3', ['2026-11-06', accId, userA])

    const updatedRow = await db.query(
      `select balance, last_yield_applied_at::text from accounts where id = $1`,
      [accId]
    )
    expect(updatedRow.rows).toEqual([
      {
        balance: '50057.39',
        last_yield_applied_at: '2026-11-06',
      },
    ])

    // RLS: User B cannot modify User A's yield fields or account
    await asUser(userB)
    const updateAttempt = await db.query(
      `update accounts set interest_rate = 0 where id = $1`,
      [accId]
    )
    expect(updateAttempt.affectedRows).toBe(0)
  })
})


