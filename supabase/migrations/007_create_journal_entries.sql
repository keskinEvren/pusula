-- Migration: 007_create_journal_entries.sql
-- Description: Seyir Defteri (The Captain's Log / Journal) for Pusula Life OS

create table if not exists public.journal_entries (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  entry_date date not null default current_date,
  title text not null,
  content text not null,
  mood text not null default 'calm' check (mood in ('high_energy', 'calm', 'low_energy', 'stormy', 'reflective')),
  template_type text default 'freeform' check (template_type in ('freeform', 'stoic', 'gratitude_victory', 'weekly_retro')),
  tags text[] default '{}',
  weather_note text,
  pinned boolean default false,
  word_count integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- İndeksler
create index if not exists idx_journal_user_date on public.journal_entries(user_id, entry_date);
create index if not exists idx_journal_mood on public.journal_entries(mood);
create index if not exists idx_journal_created_at on public.journal_entries(created_at);

-- RLS Güvenliği
alter table public.journal_entries enable row level security;

create policy "Users can manage their own journal entries"
  on public.journal_entries for all
  using (auth.uid()::text = user_id or user_id = 'local');
