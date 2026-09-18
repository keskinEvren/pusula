import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

const fixture = process.env.QA_SUPABASE_URL || 'http://127.0.0.1:54321'
const routes = ['/', '/accounts', '/agenda', '/cards', '/credentials', '/debts', '/dreams', '/ideas', '/import', '/imports', '/investments', '/journal', '/projects', '/projects/qa-project', '/routines', '/settings', '/subscriptions', '/transactions', '/vault']
const account = { id: '22222222-2222-4222-8222-222222222222', user_id: '11111111-1111-4111-8111-111111111111', name: 'QA Bank', type: 'vadesiz', balance: 1000, currency: 'TRY' }
const project = { id: '33333333-3333-4333-8333-333333333333', user_id: account.user_id, name: 'QA Project', slug: 'qa-project', status: 'Planlama', project_type: 'saas', budget_limit: 10000, description: 'QA document' }
async function reset(request: APIRequestContext, tables = {}) { await request.post(`${fixture}/__qa/reset`, { data: { tables } }) }
async function state(request: APIRequestContext) { return (await request.get(`${fixture}/__qa/state`)).json() }
async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-posta adresi', { exact: true }).fill('qa@example.test')
  await page.getByLabel('Şifre', { exact: true }).fill('QA-password-123!')
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/')
}
test.beforeEach(async ({ context, request }) => {
  await reset(request)
  // Deny ALL non-loopback browser traffic, including accidental production calls.
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
  })
})

test('auth: all protected routes redirect anonymous visitors', async ({ page }) => {
  for (const path of routes) { await page.goto(path); await expect(page).toHaveURL(/\/login$/) }
  await page.goto('/auth/callback'); await expect(page).toHaveURL(/\/login\?message=/)
})
test('login: empty, invalid password, visibility, theme, signup navigation', async ({ page, request }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click()
  expect((await state(request)).requests.filter((r: any) => r.path === '/auth/v1/token')).toHaveLength(0)
  await page.getByLabel('E-posta adresi', { exact: true }).fill('qa@example.test')
  await page.getByLabel('Şifre', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Şifreyi göster' }).click()
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Açık temaya geç' }).click()
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click()
  await expect(page.getByText('Invalid login credentials', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Kayıt Ol' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await page.goBack(); await expect(page).toHaveURL(/\/login$/)
  await page.goForward(); await expect(page).toHaveURL(/\/signup$/)
})

for (const width of [1440, 768, 390]) {
  test(`all screens render without crash or horizontal overflow at ${width}px`, async ({ page, request }, testInfo) => {
    test.setTimeout(180000)
    await reset(request, { accounts: [account], projects: [project] })
    const errors: string[] = [], network: string[] = [], warnings: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()) })
    page.on('response', r => { if (r.status() >= 400) network.push(`${r.status()} ${r.url()}`) })
    await page.setViewportSize({ width, height: 1000 })
    await login(page)
    for (const path of routes) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForTimeout(350)
      await expect(page.locator('body')).not.toContainText('Application error')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect.soft(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1)
      expect.soft(errors, `${path} runtime errors`).toEqual([])
    }
    await testInfo.attach('console-network', { body: JSON.stringify({ errors, network, warnings }, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: `test-results/screens-${width}.png`, fullPage: true })
  })
}

test('accounts: create, reload, update, reload, delete, reload with backend assertions', async ({ page, request }) => {
  await login(page); await page.goto('/accounts')
  await page.getByRole('button', { name: /Hesap.*Ekle/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  expect((await state(request)).tables.accounts).toHaveLength(0)
  await page.getByLabel('Hesap / Banka Adı').fill('QA Lifecycle')
  await page.getByLabel('Mevcut Bakiye (₺)').fill('123.45')
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect((await state(request)).tables.accounts[0]).toMatchObject({ name: 'QA Lifecycle', balance: 123.45 })
  await page.reload(); await expect(page.getByText('QA Lifecycle', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /Düzenle/ }).first().click()
  await page.getByLabel('Hesap / Banka Adı').fill('QA Updated')
  await page.getByLabel('Mevcut Bakiye (₺)').fill('222')
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect((await state(request)).tables.accounts[0]).toMatchObject({ name: 'QA Updated', balance: 222 })
  await page.reload(); await expect(page.getByText('QA Updated', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /Sil/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Sil/ }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.accounts).toHaveLength(0)
  await page.reload(); await expect(page.getByText('QA Updated', { exact: true })).toHaveCount(0)
})

test('project expense failure must not report success', async ({ page, request }) => {
  await reset(request, { accounts: [account], projects: [project] })
  await login(page); await page.goto('/projects/qa-project')
  await request.post(`${fixture}/__qa/fail`, { data: { path: '/rest/v1/rpc/fn_record_expense_atomic', method: 'POST' } })
  await page.getByRole('button', { name: /Harcama Ekle/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type=number]').fill('100')
  await dialog.getByLabel('Açıklama', { exact: true }).fill('QA expense failure')
  await dialog.locator('select').selectOption(account.id)
  await dialog.locator('button[type=submit]').click()
  await expect(page.getByText('Harcama projeye başarıyla kaydedildi!')).toHaveCount(0)
  await expect(dialog).toBeVisible()
})

test('agenda: 400/401/403/409/500 mutation errors never create success state', async ({ page, request }) => {
  await login(page)
  for (const status of [400, 401, 403, 409, 500]) {
    await reset(request, { agenda_items: [], projects: [] })
    await request.post(`${fixture}/__qa/fail`, { data: { path: '/rest/v1/agenda_items', method: 'POST', status } })
    await page.goto('/agenda')
    const title = page.getByPlaceholder(/Bugün neye odaklanacaksın/)
    await title.fill(`Agenda failure ${status}`)
    await page.getByRole('button', { name: 'Ekle', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'QA injected failure' })).toBeVisible()
    await expect(title).toHaveValue(`Agenda failure ${status}`)
    expect(((await state(request)).tables.agenda_items || [])).toHaveLength(0)
  }
})

test('investments: 400/401/403/409/500 mutation errors keep modal and backend unchanged', async ({ page, request }) => {
  await login(page)
  for (const status of [400, 401, 403, 409, 500]) {
    await reset(request, { investments: [] })
    await request.post(`${fixture}/__qa/fail`, { data: { path: '/rest/v1/investments', method: 'POST', status } })
    await page.goto('/investments')
    await page.getByRole('button', { name: 'Yeni Varlık' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Varlık / Şirket Adı').fill(`Investment failure ${status}`)
    await dialog.getByLabel('Miktar / Adet').fill('1')
    await dialog.getByLabel('Alış Maliyeti').fill('10')
    await dialog.getByLabel('Güncel Fiyat').fill('10')
    await dialog.getByRole('button', { name: 'Varlığı Ekle' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'QA injected failure' })).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(((await state(request)).tables.investments || [])).toHaveLength(0)
  }
})

test('cards: create edit statement and delete with reload persistence', async ({ page, request }) => {
  await login(page); await page.goto('/cards')
  await page.getByRole('button', { name: 'Yeni Kart Ekle', exact: true }).first().click()
  await page.getByLabel('Banka', { exact: true }).fill('QA Bank')
  await page.getByLabel('Kart Adı / Tipi').fill('QA Card')
  await page.getByLabel('Son 4 Hane').fill('1234')
  await page.getByLabel('Güncel Toplam Borç').fill('200')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.credit_cards[0].current_debt).toBe(200)
  await page.reload()
  await page.getByTitle('Kartı ve Güncel Borcu Düzenle').click()
  await page.getByLabel('Güncel Toplam Borç').fill('300')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.credit_cards[0].current_debt).toBe(300)
  await page.reload()
  await page.getByRole('button', { name: 'Ekstre Kaydı Gir' }).click()
  const cardId = (await state(request)).tables.credit_cards[0].id
  await page.getByLabel('Kredi Kartı', { exact: true }).selectOption(cardId)
  await page.getByLabel('Ekstre Tarihi', { exact: true }).fill('2026-09-01')
  await page.getByLabel('Dönem Borcu', { exact: true }).fill('400')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.card_statements).toHaveLength(1)
  expect((await state(request)).tables.credit_cards[0].current_debt).toBe(400)
  await page.reload()
  await page.getByTitle('Kartı Sil', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Sil/ }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.credit_cards).toHaveLength(0)
  await page.reload(); await expect(page.getByText('QA Card', { exact: true })).toHaveCount(0)
})

test('projects: create search edit and persist document', async ({ page, request }) => {
  await login(page); await page.goto('/projects?new=true')
  await page.getByLabel('Proje Adı', { exact: true }).fill('QA Lifecycle Project')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.projects).toHaveLength(1)
  await page.reload()
  await page.goto('/projects/qa-lifecycle-project')
  await expect(page.getByRole('heading', { name: 'QA Lifecycle Project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Düzenle/ }).first().click()
  await page.getByLabel('Proje Adı', { exact: true }).fill('QA Edited Project')
  await page.getByLabel('URL Slug', { exact: true }).fill('qa-lifecycle-project')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'QA Edited Project', exact: true })).toBeVisible()
  expect((await state(request)).tables.projects[0].name).toBe('QA Edited Project')
})

test('routines: create edit complete and delete with reload persistence', async ({ page, request }) => {
  await login(page); await page.goto('/routines?new=true')
  await page.getByLabel('Rutin Başlığı').fill('QA Routine')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.routines).toHaveLength(1)
  await page.goto('/routines')
  await page.getByRole('button', { name: '"QA Routine" rutinini düzenle' }).click()
  await page.getByLabel('Rutin Başlığı').fill('QA Edited Routine')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload(); await expect(page.getByText('QA Edited Routine', { exact: true })).toBeVisible()
  expect((await state(request)).tables.routines[0].title).toBe('QA Edited Routine')
  await page.getByRole('button', { name: '"QA Edited Routine" rutinini sil' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Sil/ }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect((await state(request)).tables.routines).toHaveLength(0)
  await page.reload(); await expect(page.getByText('QA Edited Routine', { exact: true })).toHaveCount(0)
})

test('journal: rejected update keeps error state and must not claim saved', async ({ page, request }) => {
  const entry = { id: '66666666-6666-4666-8666-666666666666', user_id: account.user_id, title: 'Original entry', content: 'Original body', entry_date: '2026-09-16', mood: 'calm', template_type: 'freeform', tags: [], pinned: false, word_count: 2 }
  await reset(request, { journal_entries: [entry] })
  await login(page); await page.goto('/journal')
  await page.getByLabel('Günün Başlığı', { exact: true }).fill('Changed entry')
  await request.post(`${fixture}/__qa/fail`, { data: { path: '/rest/v1/journal_entries', method: 'POST' } })
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Kayıt güncellendi.', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/kaydedilemedi/i)).toBeVisible()
  expect((await state(request)).tables.journal_entries[0].title).toBe('Original entry')
})

test('accounts: API failure shows feedback instead of an empty list', async ({ page, request }) => {
  await login(page)
  await request.post(`${fixture}/__qa/fail`, { data: { path: '/rest/v1/accounts', method: 'GET' } })
  await page.goto('/accounts')
  await expect(page.getByText(/yüklenemedi|QA injected failure/i).first()).toBeVisible()
})

test('transactions: expense transfer card payment and delete persist atomically', async ({ page, request }) => {
  const target={...account,id:'88888888-8888-4888-8888-888888888888',name:'QA Target',balance:200}
  const card={id:'77777777-7777-4777-8777-777777777777',user_id:account.user_id,bank:'QA',card_name:'QA Card',last_four:'1234',current_debt:500}
  await reset(request,{accounts:[account,target],credit_cards:[card]})
  await login(page); await page.goto('/transactions?new=true')
  let dialog=page.getByRole('dialog')
  await dialog.getByLabel('İşlem Tutarı').fill('100')
  await dialog.getByLabel('Hesap / Kart').selectOption({label:'QA Bank'})
  await dialog.getByLabel('İşyeri / Başlık').fill('QA Expense')
  await dialog.getByRole('button',{name:'Kaydet',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  expect((await state(request)).tables.accounts.find((a:any)=>a.id===account.id).balance).toBe(900)

  await page.goto('/transactions?new=true'); dialog=page.getByRole('dialog')
  await dialog.getByRole('tab',{name:'Transfer',exact:true}).click()
  await dialog.getByLabel('İşlem Tutarı').fill('50')
  await dialog.getByLabel('Hesap / Kart').selectOption({label:'QA Bank'})
  await dialog.getByLabel('Hedef Hesap').selectOption(target.id)
  await dialog.getByLabel('İşyeri / Başlık').fill('QA Transfer')
  await dialog.getByRole('button',{name:'Kaydet',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  let backend=await state(request)
  expect(backend.tables.accounts.find((a:any)=>a.id===account.id).balance).toBe(850)
  expect(backend.tables.accounts.find((a:any)=>a.id===target.id).balance).toBe(250)

  await page.goto('/transactions?new=true'); dialog=page.getByRole('dialog')
  await dialog.getByRole('tab',{name:'Kart Ödemesi',exact:true}).click()
  await dialog.getByLabel('İşlem Tutarı').fill('75')
  await dialog.getByLabel('Hesap / Kart').selectOption({label:'QA Bank'})
  await dialog.getByLabel('Ödenecek Kart').selectOption(card.id)
  await dialog.getByLabel('İşyeri / Başlık').fill('QA Card Payment')
  await dialog.getByRole('button',{name:'Kaydet',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  backend=await state(request)
  expect(backend.tables.accounts.find((a:any)=>a.id===account.id).balance).toBe(775)
  await page.goto('/transactions')
  await expect(page.getByRole('table').getByText('QA Card Payment').first()).toBeVisible()
  await page.getByRole('table').locator('tr', { hasText: 'QA Card Payment' }).getByLabel('Hareketi sil').click()
  await page.getByRole('dialog').getByRole('button', { name: /Sil/ }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('table').getByText('QA Card Payment')).toHaveCount(0)
  backend = await state(request)
  expect(backend.tables.accounts.find((a:any)=>a.id===account.id).balance).toBe(850)
  expect(backend.tables.credit_cards[0].current_debt).toBe(500)
})

test('transactions: keyset pagination, filters, sorting, visibilitychange, and CRUD smoke test', async ({ page, request }) => {
  const transactions: any[] = []
  for (let i = 1; i <= 60; i++) {
    const isAugust = i > 55
    const dateStr = isAugust ? '2026-08-15' : '2026-09-16'
    transactions.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      user_id: account.user_id,
      account_id: account.id,
      project_id: i === 1 ? project.id : null,
      amount: i * 10,
      type: 'Harcama',
      date: dateStr,
      description: `Test Islem #${i}`,
      merchant: i === 1 ? 'OzelMigros' : `Market ${i}`,
      analysis_group: 'Kişisel',
      account_or_card: 'QA Bank',
    })
  }

  await reset(request, { accounts: [account], projects: [project], transactions })
  await login(page)

  // 1. Navigate to /transactions
  await page.goto('/transactions')
  await expect(page.locator('main')).toBeVisible()

  // Verify KPI card initially reflects stats (60 transactions)
  await expect(page.getByText(/Listelenen:.*50 \/ 60 hareket/)).toBeVisible()
  await expect(page.getByText('Tüketim Toplamı:')).toBeVisible()

  // 2. Verify initial 50 rows
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(50)

  // 3. Verify Load More button and click to load 51st - 60th record
  const loadMoreBtn = page.getByRole('button', { name: /Daha Fazla Yükle/i })
  await expect(loadMoreBtn).toBeVisible()
  await loadMoreBtn.click()
  await expect(rows).toHaveCount(60)
  await expect(loadMoreBtn).toHaveCount(0)

  // 4. Test date sort toggle
  await page.getByRole('button', { name: 'Tarih' }).first().click()
  await expect(rows.first()).toContainText('15 Ağu 2026')
  await page.getByRole('button', { name: 'Tarih' }).first().click()
  await expect(rows.first()).toContainText('16 Eyl 2026')

  // 5. Test amount sort toggle
  await page.getByRole('button', { name: 'Tutar' }).first().click()
  await expect(rows.first()).toContainText('600')

  // 6. Test debounced search
  const searchInput = page.getByLabel('İşyeri veya açıklama ara').filter({ visible: true })
  await searchInput.fill('OzelMigros')
  await page.waitForTimeout(450)
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('OzelMigros')
  await searchInput.fill('')
  await page.waitForTimeout(450)
  await expect(rows).toHaveCount(50)

  // 7. Test month filter
  const monthSelect = page.getByLabel('Dönem Filtresi').filter({ visible: true })
  await monthSelect.selectOption({ value: '2026-08' })
  await page.waitForTimeout(300)
  await expect(rows).toHaveCount(5)
  await monthSelect.selectOption({ value: 'ALL' })
  await page.waitForTimeout(300)
  await expect(rows).toHaveCount(50)

  // 8. Test project filter
  const projectSelect = page.getByLabel('Proje Filtresi').filter({ visible: true })
  await projectSelect.selectOption({ label: 'QA Project' })
  await page.waitForTimeout(300)
  await expect(rows).toHaveCount(1)
  await projectSelect.selectOption({ value: 'ALL' })
  await page.waitForTimeout(300)
  await expect(rows).toHaveCount(50)

  // 9. Tab switch simulation (visibilitychange)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(rows).toHaveCount(50)

  // 10. Add transaction
  await page.getByRole('button', { name: /Manuel Hareket Ekle/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('İşlem Tutarı').fill('999')
  await dialog.getByLabel('Hesap / Kart').selectOption({ label: 'QA Bank' })
  await dialog.getByLabel('İşyeri / Başlık').fill('Yeni Eklenen İşlem')
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('table').getByText('Yeni Eklenen İşlem').first()).toBeVisible()

  // 11. Delete transaction
  await page.getByRole('table').locator('tr', { hasText: 'Yeni Eklenen İşlem' }).getByLabel('Hareketi sil').click()
  const deleteConfirm = page.getByRole('dialog')
  await deleteConfirm.getByRole('button', { name: /Sil/ }).click()
  await expect(deleteConfirm).not.toBeVisible()
  await expect(page.getByRole('table').getByText('Yeni Eklenen İşlem')).toHaveCount(0)
})

