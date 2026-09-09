-- ==============================================================================
-- 🧭 PUSULA — Migration 004: Investments & Portfolio Management
-- ==============================================================================

create table if not exists public.investments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,                           -- Örn: "Türk Hava Yolları", "Gram Altın"
  symbol text,                                  -- Örn: "THYAO", "GRAM_ALTIN", "BTC", "USD"
  category text not null,                       -- 'Hisse Senedi (BIST)', 'Emtia & Altın', 'Yatırım Fonu (TEFAS)', 'Döviz', 'Kripto Para', 'BES / Emeklilik', 'Diğer'
  institution text,                             -- Örn: "Midas", "Garanti BBVA", "Binance", "Fiziki Kasa", "Ziraat"
  quantity numeric(18, 6) default 0 not null,   -- Adet / Gram / Lot (ondalıklı miktar)
  unit_cost numeric(14, 4) default 0 not null,  -- Ortalama Alış Maliyeti
  current_price numeric(14, 4) default 0 not null, -- Güncel Birim Fiyat
  currency text default 'TRY' not null,         -- TRY, USD, EUR
  last_price_updated_at timestamptz default now(),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Satır Düzeyi Güvenlik (Row Level Security - RLS)
alter table public.investments enable row level security;

create policy "Users can view own investments"
  on public.investments for select
  using (auth.uid() = user_id);

create policy "Users can insert own investments"
  on public.investments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own investments"
  on public.investments for update
  using (auth.uid() = user_id);

create policy "Users can delete own investments"
  on public.investments for delete
  using (auth.uid() = user_id);

-- Performans İndeksleri
create index if not exists idx_investments_user_id on public.investments(user_id);
create index if not exists idx_investments_category on public.investments(category);
create index if not exists idx_investments_symbol on public.investments(symbol);
