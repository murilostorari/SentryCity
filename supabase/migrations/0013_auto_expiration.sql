-- =============================================================================
-- SentryCity — Migration 0013: Auto-Expiration & Lifecycle TTL
-- ---------------------------------------------------------------------------
-- Regra de ciclo de vida automático:
--   - incidentes 'active'/'pending' sem novas interações por N horas
--     (configurado por tipo em incident_visibility_config.auto_resolve_hours)
--     são automaticamente marcados como 'resolved'.
--   - usuários autenticados podem "confirmar ainda ativo" para renovar o timer.
--   - staff pode resolver manualmente via RPC resolve_incident().
--   - resolved mantém visibilidade no mapa por resolved_visibility_hours (já 24h),
--     depois some do mapa (useFilters.isVisibleOnMap) e vai pro histórico.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nova coluna: horas de inatividade antes de auto-resolver (por tipo)
-- -----------------------------------------------------------------------------
alter table public.incident_visibility_config
  add column if not exists auto_resolve_hours integer default 24;

comment on column public.incident_visibility_config.auto_resolve_hours
  is 'Se o incidente ficar sem novos relatos por N horas, é auto-resolvido. Default 24h.';

-- -----------------------------------------------------------------------------
-- 2. Janelas por tipo (upsert idempotente)
--    auto_resolve_hours: quantas horas sem atividade → resolve
--    resolved_visibility_hours: quantas horas como resolved aparece no mapa
-- -----------------------------------------------------------------------------
insert into public.incident_visibility_config (incident_type, resolved_visibility_hours, auto_resolve_hours)
values
  ('accident',    48, 72),   -- acidento: 72h sem atividade → resolve; 48h visível como resolvido
  ('power',       48, 72),   -- falta de energia
  ('weather',     24, 48),   -- clima
  ('pothole',    168, 168),  -- buraco: persistente, 7 dias
  ('show',       72, 168),   -- show/evento: 3 dias visível, 7 dias para auto-resolver
  ('party',      24, 48),    -- festa
  ('noise',      24, 48),    -- barulho
  ('inauguration',12, 24),   -- inauguração: evento pontual, 12h visível, 24h resolve
  ('other',      24, 24)
on conflict (incident_type) do update
  set resolved_visibility_hours = excluded.resolved_visibility_hours,
      auto_resolve_hours        = excluded.auto_resolve_hours;

-- -----------------------------------------------------------------------------
-- 3. Função: obtém o TTL de auto-resolução por tipo (default 24h)
-- -----------------------------------------------------------------------------
create or replace function public.get_auto_resolve_hours(p_type text)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select auto_resolve_hours from public.incident_visibility_config where incident_type = p_type),
    24
  );
$$;

comment on function public.get_auto_resolve_hours(text)
  is 'Retorna as horas de inatividade antes de auto-resolver um incidente do tipo (default 24h).';

-- -----------------------------------------------------------------------------
-- 4. Função: resolve incidentes inativos automaticamente
--    Chamada por: pg_cron (hourly) ou Edge Function scheduler.
--    Resolve incidentes 'active'/'pending' que não receberam relatos novos
--    em mais do que auto_resolve_hours horas.
-- -----------------------------------------------------------------------------
create or replace function public.auto_resolve_inactive_incidents()
returns integer  -- retorna quantos incidentes foram resolvidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_resolved integer := 0;
  r          record;
  v_cutoff   timestamptz;
  v_has_activity boolean;
begin
  for r in
    select i.id, i.type, i.created_at
    from public.incidents i
    where i.status in ('active', 'pending')
  loop
    -- TTL baseado no tipo (ou created_at + horas configuradas)
    v_cutoff := r.created_at + (public.get_auto_resolve_hours(r.type) || ' hours')::interval;
    if v_cutoff > v_now then
      continue;  -- ainda dentro do TTL, pula
    end if;

    -- Verifica se teve algum relato recente (últimas auto_resolve_hours horas)
    select exists (
      select 1 from public.incident_reports rep
      where rep.incident_id = r.id
        and rep.created_at > v_now - (public.get_auto_resolve_hours(r.type) || ' hours')::interval
    ) into v_has_activity;

    if not v_has_activity then
      -- Nenhuma atividade recente → resolve
      update public.incidents
      set status = 'resolved'
      where id = r.id;

      insert into public.incident_timeline (incident_id, event_type, description)
      values (r.id, 'auto_resolved',
        'Incidente resolvido automaticamente por inatividade ('
        || public.get_auto_resolve_hours(r.type) || 'h sem novos relatos).');

      v_resolved := v_resolved + 1;
    end if;
  end loop;

  return v_resolved;
end;
$$;

comment on function public.auto_resolve_inactive_incidents()
  is 'Resolve incidentes inativos automaticamente. Retorna o número resolvido. Call via pg_cron ou Edge Function.';

-- -----------------------------------------------------------------------------
-- 5. Função: usuário confirma que o incidente ainda está ativo (renova timer)
--    Inserção de um relato 'confirm' impede a auto-resolução.
--    Acessível a qualquer usuário autenticado (auth.uid() not null).
-- -----------------------------------------------------------------------------
create or replace function public.bump_incident_activity(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (select 1 from public.incidents where id = p_incident_id) then
    raise exception 'Incidente não encontrado';
  end if;

  -- Insere um relato de confirmação (upsert na constraint unique)
  insert into public.incident_reports (incident_id, user_id, type, comment)
  values (p_incident_id, auth.uid(), 'confirm', 'Confirmado ativo via app')
  on conflict (incident_id, user_id, type) do nothing;

  -- Atualiza a confiança (usa reputação ponderada)
  perform public.recalculate_incident_confidence(p_incident_id);
end;
$$;

comment on function public.bump_incident_activity(uuid)
  is 'Insere/atualiza um relato confirm para renovar o TTL do incidente. Usuário autenticado.';

-- -----------------------------------------------------------------------------
-- 6. Função: staff resolve manualmente (admin/analyst)
-- -----------------------------------------------------------------------------
create or replace function public.resolve_incident(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Permissão negada: apenas staff pode resolver';
  end if;

  update public.incidents
  set status = 'resolved'
  where id = p_incident_id;

  if not found then
    raise exception 'Incidente não encontrado';
  end if;

  insert into public.incident_timeline (incident_id, event_type, description)
  values (p_incident_id, 'manually_resolved',
    'Incidente resolvido manualmente.');

  -- Gativa triggers existentes: resolved_at, expires_at (trigger 0008)
  -- e reputação (trigger 0005)
end;
$$;

comment on function public.resolve_incident(uuid)
  is 'Marca o incidente como resolved (staff only). Ativa triggers de resolved_at/expires_at.';

-- -----------------------------------------------------------------------------
-- 7. Índice auxiliar para a query do auto-resolve
-- -----------------------------------------------------------------------------
create index if not exists idx_incidents_status_created
  on public.incidents (status, created_at)
  where status in ('active', 'pending');
