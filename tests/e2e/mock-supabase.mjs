// Deliberately local, disposable HTTP fixture. This is NOT PostgreSQL/RLS.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'QA User' }, created_at: '2026-01-01T00:00:00Z' }
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated' })).toString('base64url')}.qa-signature`
let tables = {}, failures = [], requests = []
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54321')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.end()
  let raw = ''; for await (const chunk of req) raw += chunk
  let body; try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
  const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)) }
  if (url.pathname === '/__qa/reset') { tables = body.tables || {}; failures = []; requests = []; return send({ ok: true }) }
  if (url.pathname === '/__qa/state') return send({ tables, requests })
  if (url.pathname === '/__qa/fail') { failures.push(body); return send({ ok: true }) }
  requests.push({ method: req.method, path: url.pathname, query: url.search, body })
  const failure = failures.find(f => url.pathname.includes(f.path) && (!f.method || f.method === req.method))
  if (failure) return send({ message: 'QA injected failure', code: 'QA_FAILURE' }, failure.status || 500)
  if (url.pathname === '/auth/v1/token') {
    if (body.password !== 'QA-password-123!') return send({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }, 400)
    return send({ access_token: token, refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user })
  }
  if (url.pathname === '/auth/v1/user') return send(user)
  if (url.pathname === '/auth/v1/signup') return send({ user, session: null })
  if (url.pathname === '/auth/v1/logout') return send({})
  if (url.pathname === '/rest/v1/rpc/fn_add_card_statement_atomic') {
    const row = { id: randomUUID(), ...body.p_statement }
    const card = tables.credit_cards?.find(c => c.id === row.card_id)
    if (!card) return send({ message: 'Card missing' }, 400)
    tables.card_statements ||= []; tables.card_statements.push(row)
    Object.assign(card, { current_debt: row.period_debt, statement_debt: row.period_debt, statement_date: row.statement_date })
    return send({ success: true, statement: row })
  }
  if (url.pathname === '/rest/v1/rpc/fn_record_expense_atomic' || url.pathname === '/rest/v1/rpc/fn_record_income_atomic') {
    const acc = tables.accounts?.find(a => a.id === body.p_account_id)
    if (!acc) return send({ success: false, error: 'Hesap bulunamadı.' })
    const isExpense=url.pathname.includes('expense')
    const row = { id: randomUUID(), user_id: body.p_user_id, account_id: acc.id, project_id: body.p_project_id, amount: body.p_amount, type: isExpense?'Harcama':'Gelir', date: body.p_date, description: body.p_description, analysis_group: body.p_analysis_group }
    tables.transactions ||= []; tables.transactions.push(row); acc.balance += (isExpense?-1:1)*row.amount
    return send({ success: true, transaction_id: row.id })
  }
  if (url.pathname === '/rest/v1/rpc/fn_delete_transaction_atomic') {
    const row = tables.transactions?.find(t=>t.id===body.p_tx_id)
    if (!row) return send({success:false,error:'İşlem bulunamadı.'})
    if (row.type === 'Harcama') {
      const acc = tables.accounts?.find(a=>a.id===row.account_id)
      if (acc) acc.balance += row.amount
      const card = tables.credit_cards?.find(c=>c.id===row.card_id)
      if (card) card.current_debt = Math.max(0, card.current_debt - row.amount)
    } else if (row.type === 'Gelir') {
      const acc = tables.accounts?.find(a=>a.id===row.account_id)
      if (acc) acc.balance -= row.amount
    } else if (row.type === 'Kart Ödemesi') {
      const acc = tables.accounts?.find(a=>a.id===row.account_id)
      if (acc) acc.balance += row.amount
      const card = tables.credit_cards?.find(c=>c.id===row.card_id)
      if (card) card.current_debt += row.amount
    } else if (row.type === 'Transfer') {
      const src = tables.accounts?.find(a=>a.id===row.source_account_id)
      if (src) src.balance += row.amount
      const tgt = tables.accounts?.find(a=>a.id===row.target_account_id)
      if (tgt) tgt.balance -= row.amount
    }
    tables.transactions=tables.transactions.filter(t=>t.id!==row.id)
    return send({success:true})
  }
  if (url.pathname === '/rest/v1/rpc/fn_record_transfer_atomic') {
    const source=tables.accounts?.find(a=>a.id===body.p_source_account_id)
    const target=tables.accounts?.find(a=>a.id===body.p_target_account_id)
    if (!source || !target || source.id===target.id) return send({success:false,error:'Hesap bulunamadı.'})
    const row={id:randomUUID(),user_id:body.p_user_id,type:'Transfer',amount:body.p_amount,date:body.p_date,description:body.p_description,merchant:body.p_description,source_account_id:source.id,target_account_id:target.id}
    source.balance-=row.amount; target.balance+=row.amount; tables.transactions||=[]; tables.transactions.push(row)
    return send({success:true,transaction_id:row.id})
  }
  if (url.pathname === '/rest/v1/rpc/fn_record_payment_atomic') {
    const acc=tables.accounts?.find(a=>a.id===body.p_account_id)
    const card=tables.credit_cards?.find(c=>c.id===body.p_target_id)
    if (!acc || !card) return send({success:false,error:'Ödeme hedefi bulunamadı.'})
    const row={id:randomUUID(),user_id:body.p_user_id,type:body.p_type,amount:body.p_amount,date:body.p_date,description:body.p_description,merchant:body.p_description,account_id:acc.id,card_id:card.id}
    acc.balance-=row.amount; card.current_debt-=row.amount; tables.transactions||=[]; tables.transactions.push(row)
    return send({success:true,transaction_id:row.id})
  }
  if (url.pathname === '/rest/v1/rpc/fn_transactions_stats') {
    const txs = tables.transactions || []
    const count = txs.length
    const volume = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const spent = txs.reduce((sum, t) => {
      if (t.analysis_group === 'Hariç' || t.type === 'Gelir' || t.type === 'Tahsilat') return sum
      if (t.type === 'İade') return sum - Number(t.amount || 0)
      return sum + Number(t.amount || 0)
    }, 0)
    return send({ total_count: count, total_volume: volume, total_spent: spent })
  }
  if (url.pathname === '/rest/v1/rpc/fn_project_finance_summary') {
    const txs = (tables.transactions || []).filter(t => t.project_id === body.p_project_id)
    const total = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const expense = txs.filter(t => t.type === 'Harcama').reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const revenue = txs.filter(t => t.type === 'Gelir').reduce((sum, t) => sum + Number(t.amount || 0), 0)
    return send({ direct_cost_total: total, direct_expense: expense, direct_revenue: revenue, total_count: txs.length })
  }
  if (url.pathname === '/rest/v1/rpc/fn_all_projects_direct_costs') {
    const map = {}
    for (const t of tables.transactions || []) {
      if (t.project_id) map[t.project_id] = (map[t.project_id] || 0) + Number(t.amount || 0)
    }
    return send(map)
  }
  if (url.pathname === '/rest/v1/rpc/fn_transactions_page') {
    let txs = (tables.transactions || []).filter(t => {
      if (body.p_search) {
        const q = body.p_search.toLowerCase()
        const m = (t.description || '').toLowerCase().includes(q) || (t.merchant || '').toLowerCase().includes(q) || (t.account_or_card || '').toLowerCase().includes(q)
        if (!m) return false
      }
      if (body.p_group && body.p_group !== 'ALL' && t.analysis_group !== body.p_group) return false
      if (body.p_type && body.p_type !== 'ALL' && t.type !== body.p_type) return false
      if (body.p_project_id && t.project_id !== body.p_project_id) return false
      if (body.p_month && body.p_month !== 'ALL' && !String(t.date || '').startsWith(body.p_month)) return false
      if (body.p_import_id && body.p_import_id !== 'ALL' && String(t.import_id || '') !== body.p_import_id) return false
      if (body.p_segment_tab === 'cards') {
        if (!t.card_id && t.type === 'Gelir') return false
        if (t.account_id && t.type !== 'Harcama') return false
      } else if (body.p_segment_tab === 'accounts') {
        if (t.card_id && !t.account_id && t.type === 'Harcama') return false
      }
      if (body.p_entity_id && body.p_entity_id !== 'ALL') {
        const matchCard = t.card_id === body.p_entity_id || (t.account_or_card || '').includes(body.p_entity_id)
        const matchAccount = t.account_id === body.p_entity_id || (t.account_or_card || '').includes(body.p_entity_id)
        if (!matchCard && !matchAccount) return false
      }
      return true
    })

    const isAmount = body.p_sort_field === 'amount'
    const isAsc = body.p_sort_order === 'asc'

    txs.sort((a, b) => {
      let valA = isAmount ? Number(a.amount || 0) : String(a.date || '')
      let valB = isAmount ? Number(b.amount || 0) : String(b.date || '')
      if (valA !== valB) {
        const cmp = valA > valB ? 1 : -1
        return isAsc ? cmp : -cmp
      }
      const idCmp = String(a.id || '').localeCompare(String(b.id || ''))
      return isAsc ? idCmp : -idCmp
    })

    if (body.p_cursor_id) {
      const idx = txs.findIndex(t => {
        if (isAmount) {
          const aAmt = Number(t.amount || 0)
          const cAmt = Number(body.p_cursor_amount || 0)
          if (isAsc) return aAmt > cAmt || (aAmt === cAmt && String(t.id) > String(body.p_cursor_id))
          return aAmt < cAmt || (aAmt === cAmt && String(t.id) < String(body.p_cursor_id))
        } else {
          const aDate = String(t.date || '')
          const cDate = String(body.p_cursor_date || '')
          if (isAsc) return aDate > cDate || (aDate === cDate && String(t.id) > String(body.p_cursor_id))
          return aDate < cDate || (aDate === cDate && String(t.id) < String(body.p_cursor_id))
        }
      })
      txs = idx >= 0 ? txs.slice(idx) : []
    }

    const limit = body.p_limit || 51
    return send(txs.slice(0, limit))
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) return send({ message: 'RPC not installed in fixture', code: 'PGRST202' }, 404)
  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.split('/').pop(); tables[table] ||= []
    const matches = row => [...url.searchParams].every(([key, value]) => {
      if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') return true
      if (key === 'or') return true // Keyset cursor slice handled below
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
      if (value.startsWith('in.(')) return value.slice(4,-1).split(',').includes(String(row[key]))
      if (value.startsWith('gte.')) return row[key] >= value.slice(4)
      if (value.startsWith('lt.')) return row[key] < value.slice(3)
      if (value.startsWith('ilike.')) return String(row[key] ?? '').toLowerCase().includes(value.slice(6).replace(/%/g, '').toLowerCase())
      return true
    })
    let result = tables[table].filter(matches)
    if (req.method === 'POST') {
      result = (Array.isArray(body) ? body : [body]).map(row => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }))
      for (const row of result) { const index = tables[table].findIndex(r => r.id === row.id); if (index >= 0 && req.headers.prefer?.includes('merge-duplicates')) tables[table][index] = row; else tables[table].push(row) }
    }
    if (req.method === 'PATCH') {
      tables[table].forEach(row => { if (matches(row)) Object.assign(row, body) })
      result = tables[table].filter(matches)
    }
    if (req.method === 'DELETE') tables[table] = tables[table].filter(row => !matches(row))
    if (req.method === 'GET') {
      const orderParam = url.searchParams.get('order')
      if (orderParam) {
        const parts = orderParam.split(',').map(p => {
          const [field, dir] = p.trim().split('.')
          return { field, isDesc: dir === 'desc' }
        })
        result.sort((a, b) => {
          for (const { field, isDesc } of parts) {
            let valA = a[field], valB = b[field]
            if (field === 'amount') { valA = Number(valA || 0); valB = Number(valB || 0) }
            else { valA = String(valA ?? ''); valB = String(valB ?? '') }
            if (valA !== valB) {
              const cmp = valA > valB ? 1 : -1
              return isDesc ? -cmp : cmp
            }
          }
          return 0
        })
      }
      const orParam = url.searchParams.get('or')
      if (orParam && table === 'transactions') {
        const cleanedOr = orParam.replace(/^\(|\)$/g, '')
        if (cleanedOr.includes('.ilike.')) {
          const terms = cleanedOr.split(',').map(part => {
            const [field, val] = part.split('.ilike.')
            return { field: field.trim(), term: (val || '').replace(/%/g, '').toLowerCase().trim() }
          })
          result = result.filter(r =>
            terms.some(({ field, term }) => String(r[field] ?? '').toLowerCase().includes(term))
          )
        } else {
          // e.g. date.lt.2026-09-01,and(date.eq.2026-09-01,id.lt.xxx)
          const dateMatch = cleanedOr.match(/date\.(lt|gt)\.([^,]+)/)
          const amountMatch = cleanedOr.match(/amount\.(lt|gt)\.([^,]+)/)
          if (dateMatch) {
            const [, op, dt] = dateMatch
            const idMatch = cleanedOr.match(/id\.(lt|gt)\.([^)]+)/)
            const curId = idMatch ? idMatch[2] : ''
            result = result.filter(r => {
              if (op === 'lt') return r.date < dt || (r.date === dt && r.id < curId)
              return r.date > dt || (r.date === dt && r.id > curId)
            })
          } else if (amountMatch) {
            const [, op, amtStr] = amountMatch
            const amt = Number(amtStr)
            const idMatch = cleanedOr.match(/id\.(lt|gt)\.([^)]+)/)
            const curId = idMatch ? idMatch[2] : ''
            result = result.filter(r => {
              const rAmt = Number(r.amount || 0)
              if (op === 'lt') return rAmt < amt || (rAmt === amt && r.id < curId)
              return rAmt > amt || (rAmt === amt && r.id > curId)
            })
          }
        }
      }
      const limit = Number(url.searchParams.get('limit') || 1000)
      result = result.slice(0, limit)
    }
    if (req.headers.accept?.includes('vnd.pgrst.object')) return result.length ? send(result[0]) : send({ message: 'No rows', code: 'PGRST116' }, 406)
    return send(result, req.method === 'POST' ? 201 : 200)
  }
  send({ message: 'Unknown fixture endpoint' }, 404)
}).listen(54321, '127.0.0.1', () => console.log('QA fixture listening on 127.0.0.1:54321'))
