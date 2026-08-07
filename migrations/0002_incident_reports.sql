-- =============================================================================
-- SentryCity — Migration 0002: Incident Reports (Relatos Colaborativos)
-- Tabela para armazenar confirmações, negações, resoluções e atualizações de usuários
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipo enumerado para report_type
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_type') then
    create type report_type as enum ('confirm', 'deny', 'resolved', 'update');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Tabela incident_reports
-- -----------------------------------------------------------------------------
create table if not exists public.incident_reports (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  type          report_type not null,
  comment       text,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Índices de performance
-- -----------------------------------------------------------------------------
create index if not exists idx_incident_reports_incident_id on public.incident_reports(incident_id);
create index if not exists idx_incident_reports_type on public.incident_reports(type);
create index if not exists idx_incident_reports_created_at on public.incident_reports(created_at desc);
create index if not exists idx_incident_reports_user_id on public.incident_reports(user_id);

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
-- updated_at não necessário (apenas created_at)

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.incident_reports enable row level security;

-- Leitura pública (qualquer um pode ver os relatos)
drop policy if exists "reports_select_all" on public.incident_reports;
create policy "reports_select_all" on public.incident_reports
  for select using (true);

-- Inserção: permitir usuários autenticados E usuários anônimos (para testes)
-- Futuro: mudar para aut.uid() is not null quando auth estiver pronto
drop policy if exists "reports_insert_any" on public.incident_reports;
create policy "reports_insert_any" on public.incident_reports
  for insert with check (true);

-- Atualização/deleção: apenas o dono do relato ou staff
drop policy if exists "reports_update_own_or_staff" on public.incident_reports;
create policy "reports_update_own_or_staff" on public.incident_reports
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  ) with check (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  );

drop policy if exists "reports_delete_own_or_staff" on public.incident_reports;
create policy "reports_delete_own_or_staff" on public.incident_reports
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  );

-- -----------------------------------------------------------------------------
-- 6. Comentários
-- -----------------------------------------------------------------------------
comment on table public.incident_reports is 'Relatos colaborativos de usuários: confirmações, negações, resoluções e atualizações de incidentes.';
comment on column public.incident_reports.type is 'Tipo do relato: confirm, deny, resolved, update';
comment on column public.incident_reports.user_id is 'Usuário que fez o relato (nullable para compatibilidade pré-auth)';