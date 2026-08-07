-- =============================================================================
-- SentryCity — Migration 0006: Incident Creator + Report Uniqueness
-- ---------------------------------------------------------------------------
-- 1. Adiciona created_by em incidents (quem criou o incidente)
-- 2. Constraint única em incident_reports: (incident_id, user_id, type)
--    impede o mesmo usuário de confirmar/negar/resolver múltiplas vezes o mesmo incidente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. created_by em incidents
-- -----------------------------------------------------------------------------
alter table public.incidents
add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_incidents_created_by on public.incidents(created_by);

comment on column public.incidents.created_by is 'Usuário que criou/registrou o incidente (para impedir auto-confirmação).';

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
-- 3. Ajuste de RLS: inserção passa a exigir autenticação (já feito em 0004,
--    mas reforça que a constraint única cuida de duplicatas).
-- -----------------------------------------------------------------------------
-- A policy "reports_insert_auth" de 0004 já exige auth.uid() is not null.
-- A constraint única no nível do banco bloqueia duplicatas automaticamente.