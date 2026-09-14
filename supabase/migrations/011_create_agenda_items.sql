-- Migration: 011_create_agenda_items.sql
-- Description: Ajanda (Focus Desk & Time Tracker) table for daily plans, focus blocks, and project effort tracking

create table if not exists public.agenda_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  plan_date date not null default current_date,
  plan_time text, -- Opsiyonel planlanan saat formatı: '09:30', '14:00'
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'missed', 'cancelled')),
  duration_seconds integer not null default 0, -- Seans(lar) sonucu harcanan toplam saniye
  timer_mode text not null default 'stopwatch' check (timer_mode in ('stopwatch', 'pomodoro')),
  pomodoro_target_minutes integer default 25,
  notes text, -- Seans sonunda ne yapıldığına dair kısa not
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- İndeksler
create index if not exists idx_agenda_user_date on public.agenda_items(user_id, plan_date);
create index if not exists idx_agenda_project on public.agenda_items(project_id);
create index if not exists idx_agenda_status on public.agenda_items(status);
create index if not exists idx_agenda_created_at on public.agenda_items(created_at);

-- RLS Güvenliği
alter table public.agenda_items enable row level security;

create policy "Users can manage own agenda_items"
  on public.agenda_items for all
  using (auth.uid() = user_id);
