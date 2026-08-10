-- =============================================================================
-- SentryCity — Migration 0008: Incident Lifecycle (Expiration)
-- ---------------------------------------------------------------------------
-- Regras de ciclo de vida dos incidentes:
--   - Nunca deletar incidentes do banco.
--   - resolved_at: preenchido automaticamente quando o incidente vira resolved.
--   - expires_at: quando o incidente deixa de ser exibido no mapa
--     (resolvidos ficam visíveis por 24h e depois vão apenas para o histórico).
--   - Estrutura preparada para janelas de exibição diferentes por tipo de
--     evento (tabela incident_visibility_config).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Novas colunas em incidents
-- -----------------------------------------------------------------------------
alter table public.incidents
  add column if not exists resolved_at timestamptz,
  add column if not exists expires_at timestamptz;

create index if not exists idx_incidents_expires_at on public.incidents(expires_at);

comment on column public.incidents.resolved_at is 'Quando o incidente foi marcado como resolvido.';
comment on column public.incidents.expires_at is 'Quando o incidente deixa de aparecer no mapa (histórico).';

-- -----------------------------------------------------------------------------
-- 2. Config de visibilidade por tipo de evento (estrutura futura)
--    Agora todos usam o default (24h). No futuro pode-se inserir linhas como:
--    ('accident', 12), ('weather', 48) etc.
-- -----------------------------------------------------------------------------
create table if not exists public.incident_visibility_config (
  incident_type            text primary key,
  resolved_visibility_hours integer not null default 24
);

comment on table public.incident_visibility_config
is 'Janela de exibição de incidentes resolvidos por tipo (horas). Default 24h.';

-- -----------------------------------------------------------------------------
-- 3. Função: horas de visibilidade de um tipo (default 24h)
-- -----------------------------------------------------------------------------
create or replace function public.get_resolved_visibility_hours(p_type text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select resolved_visibility_hours from public.incident_visibility_config where incident_type = p_type),
    24
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Trigger: ciclo de vida automático ao mudar status
--    - status -> resolved : preenche resolved_at e expires_at
--    - status deixa de ser resolved : limpa resolved_at e expires_at
-- -----------------------------------------------------------------------------
create or replace function public.trg_incident_lifecycle()
returns trigger
language plpgsql
as $$
begin
  -- Virou resolvido
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.expires_at := new.resolved_at + (public.get_resolved_visibility_hours(new.type) || ' hours')::interval;

  -- Deixou de ser resolvido (reativado, etc.)
  elsif old.status = 'resolved' and new.status is distinct from 'resolved' then
    new.resolved_at := null;
    new.expires_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incident_lifecycle on public.incidents;
create trigger trg_incident_lifecycle
  before update of status on public.incidents
  for each row execute function public.trg_incident_lifecycle();

-- -----------------------------------------------------------------------------
-- 5. Backfill: incidentes já resolvidos ganham resolved_at/expires_at
-- -----------------------------------------------------------------------------
update public.incidents
set resolved_at = coalesce(resolved_at, updated_at),
    expires_at  = coalesce(expires_at, updated_at + (public.get_resolved_visibility_hours(type) || ' hours')::interval)
where status = 'resolved';

-- -----------------------------------------------------------------------------
-- 6. Comentários
-- -----------------------------------------------------------------------------
comment on function public.get_resolved_visibility_hours(text) is 'Retorna as horas de visibilidade de um tipo de incidente resolvido (default 24h).';
comment on function public.trg_incident_lifecycle() is 'Preenche resolved_at/expires_at automaticamente conforme mudanças de status.';
