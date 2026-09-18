-- ==============================================================================
-- 🧭 PUSULA — PostgreSQL Database Schema & Security Architecture
-- ==============================================================================

-- 1. Profiles (Kullanıcı Profilleri)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  currency text default 'TRY',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Accounts (Hazır Para / Vadesiz / Nakit Hesaplar)
create table if not exists public.accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text default 'vadesiz',
  balance numeric(12, 2) default 0.00 not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Projects (Proje Portföyü)
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  slug text not null,
  name text not null,
  description text,
  status text default 'Planlama' check (status in ('Fikir', 'Planlama', 'Geliştirmede', 'Canlı', 'Arşiv')),
  budget_limit numeric(12, 2) default null, -- Opsiyonel bütçe tavanı
  repo_url text,
  live_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, slug)
);

-- 4. Credit Cards (Kredi Kartları)
create table if not exists public.credit_cards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  bank text not null,
  card_name text not null,
  last_four text,
  current_debt numeric(12, 2) default 0.00 not null,
  statement_debt numeric(12, 2) default 0.00 not null,
  minimum_payment numeric(12, 2) default 0.00 not null,
  interest_fees numeric(12, 2) default 0.00 not null,
  statement_date date,
  due_date date,
  status_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Card Statements (Ekstre Geçmişi & Değişim Trendleri)
create table if not exists public.card_statements (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references public.credit_cards(id) on delete cascade not null,
  statement_date date not null,
  period_debt numeric(12, 2) default 0.00 not null,
  minimum numeric(12, 2) default 0.00 not null,
  payments numeric(12, 2) default 0.00 not null,
  spending numeric(12, 2) default 0.00 not null,
  cash_advance numeric(12, 2) default 0.00 not null,
  interest_fees numeric(12, 2) default 0.00 not null,
  due_date date,
  prev_debt numeric(12, 2),
  change_amount numeric(12, 2),
  change_pct numeric(8, 4),
  created_at timestamptz default now()
);

-- 6. Debts & Receivables (Borçlar & Kesin Alacaklar)
create table if not exists public.debts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('Borç', 'Alacak')),
  category text default 'Genel',
  person_or_entity text not null,
  description text,
  principal numeric(12, 2) default 0.00 not null,
  past_payments numeric(12, 2) default 0.00 not null,
  remaining numeric(12, 2) default 0.00 not null,
  status text default 'Açık' check (status in ('Açık', 'Kapatıldı')),
  linked_account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. Subscriptions (Abonelikler & Planlı Yük)
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  service text not null,
  group_type text default 'İş' check (group_type in ('Kişisel', 'İş')),
  model text default 'Tekrarlayan',
  amount numeric(12, 2) default 0.00 not null,
  currency text default 'TRY',
  period text default 'Aylık',
  end_date date,
  decision text default 'Devam' check (decision in ('Devam', 'İptal Et', 'Kararsız')),
  payment_method text,
  status text default 'Aktif' check (status in ('Aktif', 'İptal', 'Donduruldu')),
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. Statement Imports (Yüklenen Ekstre Dosyaları)
create table if not exists public.statement_imports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  bank text,
  card_id uuid references public.credit_cards(id) on delete set null,
  statement_date date,
  due_date date,
  total_transactions integer default 0,
  total_amount numeric(12, 2) default 0.00,
  raw_text text,
  created_at timestamptz default now()
);

-- 9. Transactions (Ana İşlem Defteri)
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  account_or_card text,
  type text not null check (type in ('Harcama', 'Kart Ödemesi', 'Gelir', 'Tahsilat', 'Finansman/Masraf', 'İade', 'Borç Ödemesi', 'Nakit Avans', 'Transfer')),
  description text not null,
  amount numeric(12, 2) default 0.00 not null,
  analysis_group text default 'Kişisel' check (analysis_group in ('Kişisel', 'İş', 'Finansman', 'Hariç')),
  merchant text,
  recurrence text,
  statement_date date,
  card_id uuid references public.credit_cards(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null, -- KÖPRÜ (Bridge)
  import_id uuid references public.statement_imports(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 10. Project Tasks (Görevler & Epics)
create table if not exists public.project_tasks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text default 'Görev' check (category in ('Epics', 'Görev', 'Bug', 'Fikir')),
  status text default 'Yapılacak' check (status in ('Yapılacak', 'Sürüyor', 'Tamamlandı')),
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 11. Ideas (Fikir Kuluçka Havuzu)
create table if not exists public.ideas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  status text default 'inbox' check (status in ('inbox', 'maybe', 'decided', 'killed', 'promoted')),
  score numeric(4, 1),
  tags text[],
  promoted_project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 12. Merchant Mappings (Otomatik İşyeri Eşleştirme Kuralları)
create table if not exists public.merchant_mappings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  raw_pattern text not null,
  merchant_name text not null,
  default_group text default 'Kişisel' check (default_group in ('Kişisel', 'İş', 'Finansman', 'Hariç')),
  default_project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz default now()
);

-- ==============================================================================
-- 🔒 ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.credit_cards enable row level security;
alter table public.card_statements enable row level security;
alter table public.debts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.statement_imports enable row level security;
alter table public.transactions enable row level security;
alter table public.project_tasks enable row level security;
alter table public.ideas enable row level security;
alter table public.merchant_mappings enable row level security;

-- Profiles Policy
create policy "Users can manage own profile" on public.profiles
  for all using (auth.uid() = id);

-- Standard User ID Ownership Policies
create policy "Users can manage own accounts" on public.accounts
  for all using (auth.uid() = user_id);

create policy "Users can manage own projects" on public.projects
  for all using (auth.uid() = user_id);

create policy "Users can manage own credit_cards" on public.credit_cards
  for all using (auth.uid() = user_id);

create policy "Users can manage own card_statements" on public.card_statements
  for all using (
    exists (
      select 1 from public.credit_cards
      where credit_cards.id = card_statements.card_id
      and credit_cards.user_id = auth.uid()
    )
  );

create policy "Users can manage own debts" on public.debts
  for all using (auth.uid() = user_id);

create policy "Users can manage own subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id);

create policy "Users can manage own statement_imports" on public.statement_imports
  for all using (auth.uid() = user_id);

create policy "Users can manage own transactions" on public.transactions
  for all using (auth.uid() = user_id);

create policy "Users can manage own project_tasks" on public.project_tasks
  for all using (auth.uid() = user_id);

create policy "Users can manage own ideas" on public.ideas
  for all using (auth.uid() = user_id);

create policy "Users can manage own merchant_mappings" on public.merchant_mappings
  for all using (auth.uid() = user_id);

-- ==============================================================================
-- ⚡ TRIGGERS & FUNCTIONS
-- ==============================================================================

-- Trigger: Automatically create profile on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger: Auto-update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger set_profiles_updated_at before update on public.profiles for each row execute procedure set_updated_at();
create or replace trigger set_accounts_updated_at before update on public.accounts for each row execute procedure set_updated_at();
create or replace trigger set_projects_updated_at before update on public.projects for each row execute procedure set_updated_at();
create or replace trigger set_credit_cards_updated_at before update on public.credit_cards for each row execute procedure set_updated_at();
create or replace trigger set_debts_updated_at before update on public.debts for each row execute procedure set_updated_at();
create or replace trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute procedure set_updated_at();
create or replace trigger set_transactions_updated_at before update on public.transactions for each row execute procedure set_updated_at();
create or replace trigger set_project_tasks_updated_at before update on public.project_tasks for each row execute procedure set_updated_at();
create or replace trigger set_ideas_updated_at before update on public.ideas for each row execute procedure set_updated_at();
