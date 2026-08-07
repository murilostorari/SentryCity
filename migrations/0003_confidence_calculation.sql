-- =============================================================================
-- SentryCity — Migration 0003: Confidence Calculation & Source Link
-- Adiciona source_id em incidents e função de recálculo de confidence_score
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adicionar source_id na tabela incidents
-- -----------------------------------------------------------------------------
alter table public.incidents
add column if not exists source_id uuid references public.sources(id) on delete set null;

create index if not exists idx_incidents_source_id on public.incidents(source_id);

comment on column public.incidents.source_id is 'Fonte original que originou este incidente (para cálculo de confiança)';

-- -----------------------------------------------------------------------------
-- 2. Função para recalcular confidence_score de um incidente
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_incident_confidence(p_incident_id uuid)
returns numeric(4,3)
language plpgsql
as $$
declare
  v_source_trust      numeric(3,2) := 0.5;
  v_user_confirms     int := 0;
  v_user_denies       int := 0;
  v_user_resolved     int := 0;
  v_ai_confidence     numeric(4,3);
  v_source_conf_avg   numeric(4,3);
  v_source_conf_count int := 0;
  v_confidence        numeric(4,3);
  v_user_score        numeric;
  v_source_conf_score numeric;
  v_ai_score          numeric;
begin
  -- 1. Trust score da fonte original
  select s.trust_score
  into v_source_trust
  from public.incidents i
  left join public.sources s on i.source_id = s.id
  where i.id = p_incident_id;

  -- 2. Contar relatos de usuários
  select 
    count(*) filter (where type = 'confirm'),
    count(*) filter (where type = 'deny'),
    count(*) filter (where type = 'resolved')
  into v_user_confirms, v_user_denies, v_user_resolved
  from public.incident_reports
  where incident_id = p_incident_id;

  -- 3. Confiança da IA (mais recente)
  select confidence
  into v_ai_confidence
  from public.ai_analysis
  where incident_id = p_incident_id
  order by created_at desc
  limit 1;

  -- 4. Confirmações de fontes (incident_confirmations)
  select 
    avg(similarity_score),
    count(*)
  into v_source_conf_avg, v_source_conf_count
  from public.incident_confirmations
  where incident_id = p_incident_id and confirmed = true;

  -- 5. Calcular confidence_score (mesma lógica do frontend)
  -- Pesos: source=0.30, user=0.35, ai=0.20, source_conf=0.15
  
  -- User score: (confirms + resolved - denies) / total, normalizado -1..1 -> 0..1
  if (v_user_confirms + v_user_denies + v_user_resolved) = 0 then
    v_user_score := 0.5;
  else
    v_user_score := ((v_user_confirms + v_user_resolved - v_user_denies)::numeric / (v_user_confirms + v_user_denies + v_user_resolved) + 1) / 2;
  end if;

  -- Source confirmation score
  if v_source_conf_count = 0 or v_source_conf_avg is null then
    v_source_conf_score := 0.5;
  else
    v_source_conf_score := v_source_conf_avg * least(v_source_conf_count::numeric / 5, 1) + 0.5 * (1 - least(v_source_conf_count::numeric / 5, 1));
  end if;

  -- AI score
  v_ai_score := coalesce(v_ai_confidence, 0.5);

  -- Weighted average
  v_confidence := 
    coalesce(v_source_trust, 0.5) * 0.30 +
    v_user_score * 0.35 +
    v_ai_score * 0.20 +
    v_source_conf_score * 0.15;

  -- Clamp e arredondar
  v_confidence := greatest(0, least(1, v_confidence));
  v_confidence := round(v_confidence * 1000) / 1000;

  -- Atualizar incidente
  update public.incidents
  set confidence_score = v_confidence,
      updated_at = now()
  where id = p_incident_id;

  return v_confidence;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Trigger functions para recalcular automaticamente
-- -----------------------------------------------------------------------------
-- Wrapper trigger function for incident_reports
create or replace function public.trg_incident_reports_confidence_fn()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_incident_confidence(coalesce(NEW.incident_id, OLD.incident_id));
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_incident_reports_confidence on public.incident_reports;
create trigger trg_incident_reports_confidence
  after insert or update or delete on public.incident_reports
  for each row execute function public.trg_incident_reports_confidence_fn();

-- Wrapper trigger function for incident_confirmations
create or replace function public.trg_incident_confirmations_confidence_fn()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_incident_confidence(coalesce(NEW.incident_id, OLD.incident_id));
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_incident_confirmations_confidence on public.incident_confirmations;
create trigger trg_incident_confirmations_confidence
  after insert or update or delete on public.incident_confirmations
  for each row execute function public.trg_incident_confirmations_confidence_fn();

-- Wrapper trigger function for ai_analysis
create or replace function public.trg_ai_analysis_confidence_fn()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_incident_confidence(coalesce(NEW.incident_id, OLD.incident_id));
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_ai_analysis_confidence on public.ai_analysis;
create trigger trg_ai_analysis_confidence
  after insert or update or delete on public.ai_analysis
  for each row execute function public.trg_ai_analysis_confidence_fn();

-- -----------------------------------------------------------------------------
-- 4. Função auxiliar para recalcular todos (útil para backfill)
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_all_incidents_confidence()
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in select id from public.incidents loop
    perform public.recalculate_incident_confidence(r.id);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Comentários
-- -----------------------------------------------------------------------------
comment on function public.recalculate_incident_confidence(uuid) is 'Recalcula confidence_score do incidente baseado em fonte, relatos usuários, IA e confirmações de fontes. Retorna novo score.';
comment on function public.recalculate_all_incidents_confidence() is 'Recalcula confidence_score de todos os incidentes (backfill).';