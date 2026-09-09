-- Migration: 005_create_dreams.sql
-- Description: Creates 'dreams' table for Life Vision, Horizons, and Goals without financial overhead.

create table if not exists public.dreams (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  title text not null,
  description text,
  identity_persona text,
  motivation_why text,
  horizon text default 'horizon_1_3y' not null check (horizon in ('horizon_1y', 'horizon_1_3y', 'horizon_3_5y', 'horizon_lifetime')),
  category text default 'Yaşam Tarzı & Deneyim' not null,
  status text default 'active' not null check (status in ('active', 'incubating', 'achieved', 'archived')),
  next_focus_note text,
  cover_image_url text,
  target_year text,
  achieved_at timestamptz,
  achieved_note text,
  achieved_image_url text,
  order_index integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes for optimal performance
create index if not exists idx_dreams_user_id on public.dreams(user_id);
create index if not exists idx_dreams_status on public.dreams(status);
create index if not exists idx_dreams_horizon on public.dreams(horizon);

-- RLS Enablement
alter table public.dreams enable row level security;

-- Policies
create policy "Users can view their own dreams"
  on public.dreams for select
  using (auth.uid()::text = user_id or user_id = 'local');

create policy "Users can insert their own dreams"
  on public.dreams for insert
  with check (auth.uid()::text = user_id or user_id = 'local');

create policy "Users can update their own dreams"
  on public.dreams for update
  using (auth.uid()::text = user_id or user_id = 'local');

create policy "Users can delete their own dreams"
  on public.dreams for delete
  using (auth.uid()::text = user_id or user_id = 'local');
