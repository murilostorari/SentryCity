-- =============================================================================
-- SentryCity — Migration 0007: Fix RLS Recursion + Clean Duplicate Reports
-- ---------------------------------------------------------------------------
-- 1. Remove duplicatas de incident_reports (mantém a mais recente por usuário/tipo)
-- 2. Adiciona constraint única (incident_id, user_id, type)
-- 3. Corrige recursão infinita nas policies RLS usando is_staff()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Limpar duplicatas em incident_reports
--    Para cada (incident_id, user_id, type), mantém apenas a mais recente.
-- -----------------------------------------------------------------------------
delete from public.incident_reports a
where exists (
  select 1 from public.incident_reports b
  where b.incident_id = a.incident_id
    and b.user_id = a.user_id
    and b.type = a.type
    and b.created_at > a.created_at
);

-- -----------------------------------------------------------------------------
-- 2. Constraint única: um usuário só pode ter um relato de cada tipo por incidente
-- -----------------------------------------------------------------------------
alter table public.incident_reports
drop constraint if exists incident_reports_unique_user_type;

alter table public.incident_reports
add constraint incident_reports_unique_user_type
unique (incident_id, user_id, type);

comment on constraint incident_reports_unique_user_type on public.incident_reports
is 'Um usuário só pode confirmar/negar/informar resolução uma vez por incidente.';

-- -----------------------------------------------------------------------------
-- 3. Corrigir policies RLS recursivas usando is_staff()
--    O problema: policies consultavam public.profiles dentro da própria tabela profiles.
--    Solução: usar a função is_staff() (SECURITY DEFINER) que já existe.
-- -----------------------------------------------------------------------------

-- profiles: select
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_staff()
  );

-- profiles: insert (já ok, só checa id = auth.uid())

-- profiles: update (já ok)

-- incident_reports: update
drop policy if exists "reports_update_own_or_staff" on public.incident_reports;
create policy "reports_update_own_or_staff" on public.incident_reports
  for update using (
    user_id = auth.uid()
    or public.is_staff()
  ) with check (
    user_id = auth.uid()
    or public.is_staff()
  );

-- incident_reports: delete
drop policy if exists "reports_delete_own_or_staff" on public.incident_reports;
create policy "reports_delete_own_or_staff" on public.incident_reports
  for delete using (
    user_id = auth.uid()
    or public.is_staff()
  );

-- -----------------------------------------------------------------------------
-- 4. Ajuste fino: is_staff() já lê profiles com SECURITY DEFINER, 
--    então não há recursão. Mas garantimos que ela existe e está correta.
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'analyst')
  );
$$;