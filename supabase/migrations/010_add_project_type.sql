-- Migration 010: Add project_type to projects
-- Allows categorizing projects into 'saas' (Kendi Girişimim/SaaS), 'workplace' (Çalıştığım Firma/İşyeri), 'client' (Müşteri/Kurumsal Web), or 'internal' (Dahili Araç)

alter table public.projects 
  add column if not exists project_type text default 'saas' 
  check (project_type in ('saas', 'workplace', 'client', 'internal'));

-- Auto-categorize known client projects like Sarıoğlu
update public.projects 
set project_type = 'client' 
where slug ilike '%sarioglu%' or name ilike '%sarıoğlu%';
