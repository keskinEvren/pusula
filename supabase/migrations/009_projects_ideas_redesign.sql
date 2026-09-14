-- Migration 009: Projects & Ideas Module Redesign
-- 1. Drop project_tasks table (Tasks & Epics removal)
-- 2. Remove 'Fikir' from projects status and add 'decided' to ideas status

-- ============================================================
-- 1. Drop project_tasks table
-- ============================================================
drop policy if exists "Users can manage own project_tasks" on public.project_tasks;
drop trigger if exists set_project_tasks_updated_at on public.project_tasks;
drop table if exists public.project_tasks cascade;

-- ============================================================
-- 2. Update projects status constraint — remove 'Fikir'
-- ============================================================
-- First migrate any projects currently in 'Fikir' status to 'Planlama'
update public.projects set status = 'Planlama' where status = 'Fikir';

-- Drop and recreate constraint
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check 
  check (status in ('Planlama', 'Geliştirmede', 'Canlı', 'Arşiv'));

-- ============================================================
-- 3. Update ideas status constraint — add 'decided'
-- ============================================================
alter table public.ideas drop constraint if exists ideas_status_check;
alter table public.ideas add constraint ideas_status_check 
  check (status in ('inbox', 'maybe', 'decided', 'killed', 'promoted'));
