-- Migration: 006_create_routines_and_logs.sql
-- Description: Habits, Daily Rituals, Constellation Logs and Calendar Matrix

create table if not exists public.routines (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  title text not null,
  icon text not null default '✨',
  time_block text not null default 'morning' check (time_block in ('morning', 'afternoon', 'evening', 'night')),
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays', 'weekends', 'custom')),
  target_days integer[] default '{1,2,3,4,5,6,7}',
  target_duration_minutes integer default 15,
  minimum_effective_dose text,
  dream_id uuid references public.dreams(id) on delete set null,
  identity_persona text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.routine_logs (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  routine_id uuid not null references public.routines(id) on delete cascade,
  log_date date not null default current_date,
  status text not null default 'completed' check (status in ('completed', 'micro_dose', 'kintsugi_repaired', 'skipped', 'frozen')),
  note text,
  duration_minutes integer default 0,
  completed_at timestamptz default now() not null,
  constraint unique_routine_log_per_day unique (routine_id, log_date)
);

-- İndeksler
create index if not exists idx_routines_user_active on public.routines(user_id, is_active);
create index if not exists idx_routines_time_block on public.routines(time_block);
create index if not exists idx_routine_logs_user_date on public.routine_logs(user_id, log_date);
create index if not exists idx_routine_logs_routine on public.routine_logs(routine_id);

-- RLS Güvenliği
alter table public.routines enable row level security;
alter table public.routine_logs enable row level security;

create policy "Users can manage their own routines"
  on public.routines for all
  using (auth.uid()::text = user_id or user_id = 'local');

create policy "Users can manage their own routine logs"
  on public.routine_logs for all
  using (auth.uid()::text = user_id or user_id = 'local');
