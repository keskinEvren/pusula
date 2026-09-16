# QA uygulama haritası ve test matrisi

2026-09-16. Kaynak envanteri; aşağıdaki planlanan kontrollerin varlığı PASS anlamına gelmez. Çalıştırılmış senaryolar ve sonuçları QA_REPORT.md içindedir.

## Mimari

Next.js App Router; tarayıcıdan Supabase Auth + PostgREST + PostgreSQL RPC. Ayrı yönetici rolü bulunmadı; kullanıcı sahipliği user_id ve RLS ile sınırlandırılıyor. JWT/cookie doğrulaması src/proxy.ts; PKCE callback /auth/callback. Harici servisler: Supabase, Yahoo Finance, CoinGecko, Google Fonts, hedef görselleri. Kasa: PBKDF2/AES-GCM, yerel önbellek + bulut.

## Ekran / endpoint matrisi

| Route | Veri tabloları | Handler / işlem noktaları | Planlanan kontroller |
|---|---|---|---|
| /accounts | accounts, transactions | handleTxCreated, loadData, handleOpenAddModal, handleOpenEditModal, handleSaveAccount, confirmDeleteAccount | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /agenda | agenda_items, projects | loadData, handleQuickAdd, handleModalAdd, handleToggleStatus, handleDeleteItem, handleMoveToToday, handleMoveAllToToday, handleCompleteActiveTimer, handleCalendarDayClick, handlePrevMonth, handleNextMonth, handleGoToCurrentMonth | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /api/market-prices |  | fetchJson | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /auth/callback |  |  | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /cards | credit_cards, card_statements | loadCardsAndStatements, handleAddCard, handleOpenEditModal, handleEditCard, handleAddStatement, confirmDeleteCard | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /credentials | credentials | handleStartResetCountdown, handleCancelReset, handleExecuteWipe, handleLock, handleSetupMasterPassword, handleUnlock, loadCredentialsAndDecrypt, handleCopy, handleDeleteItem, handleSaveItem, handleChangeMasterPassword | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /debts | debts, accounts, transactions | handleDebtSort, handleClearDebtFilters, loadData, handleOpenDeduct, handleProcessDeduction, handleDeductFromBankTx, handleOpenAdd, handleSaveAdd, handleOpenEdit, handleSaveEdit, confirmDeleteDebt | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /dreams | dreams | loadDreams, handleOpenAddModal, handleOpenEditModal, handleSaveDream, confirmDeleteDream, handleOpenCelebration, handleConfirmCelebration, handlePromoteToActive, handleDemoteToIncubating, handleKeyDown, handleOpenZenMode | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /ideas | ideas, projects | loadIdeas, handleAddIdea, handleOpenIdeaDetail, handleSaveIdeaDetail, handleOpenPromoteModal, handleExecutePromote, handleStatusChange, confirmDeleteIdea | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /import | projects, credit_cards, debts, accounts, merchant_mappings, statement_imports | handleSwitchMode, confirmSwitchMode, confirmClearQueue, loadMetadata, handleIncomingFiles, handleRemoveQueueItem, handleToggleExpand, handleCardChange, handleAccountChange, handleToggleFileSelectAll, handleRowFieldChange, handleActionChange, handleBulkCommit | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /imports |  | loadBatches, handleInspect, confirmRollback, confirmDeletePermanently | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /investments | investments | loadInvestments, handleRefreshAllPrices, handleFetchLivePrice, handleOpenAddModal, handleOpenEditModal, handleNameChange, handleSymbolChange, handleSelectCatalogItem, handleOpenDcaModal, handleSaveDca, handlePresetSelect, handleSaveInvestment, confirmDeleteItem, handleSaveQuickPrice | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /journal | journal_entries, routines, routine_logs, transactions | loadData, handleKeyDown, handleSelectEntry, handleCreateNewEntry, handleApplyTemplate, handleSaveEntry, confirmDeleteEntry, handleAddTag, handleRemoveTag | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /login |  | handleLogin | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| / | accounts, credit_cards, debts, transactions, subscriptions, projects, investments | loadDashboardData, handleTxCreated, handleCancelVaultReset | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /projects | projects, transactions, subscriptions | loadProjectsAndCosts, handleAddProject, handleStatusChange | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /projects/[slug] | projects, transactions, subscriptions, accounts, agenda_items | handleQuickExpense, loadProjectData, handleMarkdownChange, handleSaveProjectDoc, handleOpenProjectEdit, handleUpdateProject | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /routines | routines, routine_logs, dreams | loadData, handleToggleRoutine, handleSaveNote, handleOpenCreateModal, handleOpenEditModal, handleSaveRoutine, confirmDeleteRoutine, handleStartTimer | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /settings | accounts, merchant_mappings, projects | loadSettingsData, handleAddAccount, handleUpdateAccountBalance, confirmDeleteAccount, handleAddMapping, confirmDeleteMapping | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /signup |  | handleSignup | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /subscriptions | subscriptions, projects, transactions | loadData, handleOpenCreateModal, handleOpenEditModal, handleSaveSubscription, handleQuickDecision, confirmDeleteSub, handleSelectTransactionForSub | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /transactions | subscriptions, transactions, projects, credit_cards, accounts, debts, investments | handleSort, handleClearFilters, handleOpenRecurringModal, handleSaveRecurring, handleTxCreated, loadTransactions, handleOpenLinkModal, handleConfirmLink, handleUnlinkFromDebt, handleOpenInvestmentLinkModal, handleTargetInvChange, handleConfirmInvestmentLink, handleUnlinkFromInvestment, handleAddTransaction, handleDelete | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |
| /vault | credentials, transactions, routine_logs, card_statements, statement_imports, ideas, agenda_items, subscriptions, debts, routines, journal_entries, merchant_mappings, investments, dreams, projects, credit_cards, accounts | fetchAllRows, fetchAllVaultData, handleExportVault, handleFileProcess, handleDecryptAndValidate, handleExecuteRestore, confirmAndExecuteRestore | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |

## Ortak bileşenler

AppShell, Sidebar, Header, BottomNav; QuickCaptureSheet; Modal/ConfirmDialog (Escape, focus trap, kapatma, mobil taşma); MarkdownEditor/Preview (dosya, biçimlendirme, kaydetme, XSS); DashboardRoutineStrip; StatementGuideSheet; TimerProvider; ToastProvider.

## PostgreSQL tabloları

- profiles — supabase/migrations/001_initial_schema.sql
- accounts — supabase/migrations/001_initial_schema.sql
- projects — supabase/migrations/001_initial_schema.sql
- credit_cards — supabase/migrations/001_initial_schema.sql
- card_statements — supabase/migrations/001_initial_schema.sql
- debts — supabase/migrations/001_initial_schema.sql
- subscriptions — supabase/migrations/001_initial_schema.sql
- statement_imports — supabase/migrations/001_initial_schema.sql
- transactions — supabase/migrations/001_initial_schema.sql
- project_tasks — supabase/migrations/001_initial_schema.sql
- ideas — supabase/migrations/001_initial_schema.sql
- merchant_mappings — supabase/migrations/001_initial_schema.sql
- investments — supabase/migrations/004_create_investments.sql
- dreams — supabase/migrations/005_create_dreams.sql
- routines — supabase/migrations/006_create_routines_and_logs.sql
- routine_logs — supabase/migrations/006_create_routines_and_logs.sql
- journal_entries — supabase/migrations/007_create_journal_entries.sql
- agenda_items — supabase/migrations/011_create_agenda_items.sql
- credentials — supabase/migrations/012_create_credentials_table.sql

## Kalıcılık doğrulama sınırları

HTTP fixture: aynı süreçte create/update/delete sonrası bağımsız backend state sorgusu ve tarayıcı refresh. Disk/PostgreSQL kalıcılığı veya RLS değildir. Gömülü PostgreSQL testleri ayrı SQL/RLS doğrulamasıdır; dağıtılmış Supabase kurulumu değildir. Gerçek test hesabı/servisi olmadan production Supabase kullanılmaz.

## Ek manuel/entegrasyon kontrol kuyruğu

- Auth: email confirmation, expiry, iki kullanıcı, logout, bozuk cookie, callback error.
- Finans: harcama/gelir/transfer/kart ödeme/borç ödeme/tahsilat/silme/borç ve yatırım eşleştirme; tutar 0/negatif/NaN/çok büyük; yetkisiz FK; eşzamanlılık.
- İçe aktarım: PDF/CSV/XLSX, duplicate, boş/bozuk dosya, seçim, kart/hesap eşleştirme, commit, rollback ve kalıcı silme.
- Kasa: tam/eksik fetch, şifreli export, yanlış parola, merge/replace, ara hata, credential anahtarları, büyük tablo pagination.
- Kişisel: rutin CRUD/tamamlama/not/sayaç/tarih; günlük CRUD/arama/şablon/pin; hedef CRUD/horizon/başarı; credential oluştur/kilitle/aç/kopyala/parola değiştir.
- Navigasyon: menü/link/geri/ileri, mobil hızlı kayıt, modal focus ve Escape, tüm filtreler/arama/sıralama.