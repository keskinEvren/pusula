-- Migration: 012_create_credentials_table.sql
-- Description: Zero-Knowledge Encrypted Credentials & Keychain table for passwords, gaming accounts, PINs, Wi-Fi, identity docs, and licenses

create table if not exists public.credentials (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text not null check (category in ('login', 'gaming', 'card_pin', 'wifi', 'identity', 'license', 'note')),
  email text,
  username text,
  url text,
  is_favorite boolean not null default false,
  encrypted_payload text not null, -- AES-GCM-256 Base64 (primary_secret, secondary_secret, custom_fields, secret_notes)
  encryption_iv text not null,     -- 12-byte Base64 IV
  encryption_salt text not null,   -- 16-byte Base64 Salt
  notes text,                      -- Düz metin genel etiket/açıklama (opsiyonel)
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indeksler
create index if not exists idx_credentials_user_category on public.credentials(user_id, category);
create index if not exists idx_credentials_user_email on public.credentials(user_id, email);
create index if not exists idx_credentials_user_favorite on public.credentials(user_id, is_favorite);
create index if not exists idx_credentials_created_at on public.credentials(created_at);

-- RLS Guvenligi
alter table public.credentials enable row level security;

create policy "Users can manage own credentials"
  on public.credentials for all
  using (auth.uid() = user_id);
