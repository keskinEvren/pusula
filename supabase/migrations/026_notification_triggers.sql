-- ==============================================================================
-- 🧭 PUSULA — Migration 026: Push Subscriptions & Notification Preferences
-- ==============================================================================
-- Daily Morning Briefing & Evening Check-in notification trigger infrastructure

-- 1. Web Push Bildirim Abonelikleri (PWA)
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now() not null
);

create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage own push_subscriptions" on public.push_subscriptions;
create policy "Users can manage own push_subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Bildirim Tercihleri ve Zamanlama Ayarları
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  morning_enabled boolean not null default true,
  morning_time text not null default '08:30',
  evening_enabled boolean not null default true,
  evening_time text not null default '21:30',
  weekly_finance_enabled boolean not null default true,
  last_morning_sent_date text,
  last_evening_sent_date text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can manage own notification_preferences" on public.notification_preferences;
create policy "Users can manage own notification_preferences"
  on public.notification_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- İzinler
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
