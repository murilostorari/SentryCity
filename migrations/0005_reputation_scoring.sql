-- =============================================================================
-- SentryCity — Migration 0005: Reputation Scoring & Weighted Confidence
-- ---------------------------------------------------------------------------
-- Regras de reputação:
--   - Confirmar ocorrência          -> +1 na hora (+1 confirmed_reports)
--   - Incidente vira "resolved"     -> quem informou resolução ganha +5
--   - Incidente vira "dismissed"    -> quem confirmou (incidente falso) perde -5
--
-- Confiança ponderada por reputação:
--   user_score = (Σ peso(confirms) + resolved - denies) / total
--   peso(confirm) = clamp(reputação / 100, 0, 1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ajuste do trigger de stats: confirm também dá +1 de reputação.
--    resolved_reports passa a ser incrementado apenas quando a resolução é
--    confirmada (incidente vira resolved), não no envio do relato.
-- -----------------------------------------------------------------------------
create or replace function public.trg_incident_reports_profile_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set reports_count = reports_count + 1,
        confirmed_reports = confirmed_reports + case when new.type = 'confirm' then 1 else 0 end,
        reputation_score  = reputation_score + case when new.type = 'confirm' then 1 else 0 end
    where id = new.user_id;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger de reputação baseado em mudança de status do incidente.
-- -----------------------------------------------------------------------------
create or replace function public.trg_incident_status_reputation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Incidente resolvido: recompensa quem informou resolução
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    update public.profiles p
    set reputation_score = p.reputation_score + 5,
        resolved_reports  = p.resolved_reports + 1
    where p.id in (
      select distinct r.user_id
      from public.incident_reports r
      where r.incident_id = new.id
        and r.type = 'resolved'
        and r.user_id is not null
    );
  end if;

  -- Incidente descartado como falso: penaliza quem confirmou
  if new.status = 'dismissed' and old.status is distinct from 'dismissed' then
    update public.profiles p
    set reputation_score = p.reputation_score - 5
    where p.id in (
      select distinct r.user_id
      from public.incident_reports r
      where r.incident_id = new.id
        and r.type = 'confirm'
        and r.user_id is not null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incident_status_reputation on public.incidents;
create trigger trg_incident_status_reputation
  after update of status on public.incidents
  for each row execute function public.trg_incident_status_reputation();

-- -----------------------------------------------------------------------------
-- 3. RPC: pesos de reputação das confirmações de um incidente.
--    SECURITY DEFINER para permitir que usuários leiam a reputação de outros
--    participantes (RLS restringe profiles ao próprio dono).
-- -----------------------------------------------------------------------------
create or replace function public.get_incident_confirm_weights(p_incident_id uuid)
returns table (user_id uuid, reputation_score numeric(4,2))
language sql
security definer
set search_path = public
stable
as $$
  select r.user_id, p.reputation_score
  from public.incident_reports r
  join public.profiles p on p.id = r.user_id
  where r.incident_id = p_incident_id and r.type = 'confirm'
$$;

-- -----------------------------------------------------------------------------
-- 4. Recálculo de confiança com confirmações ponderadas por reputação.
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_incident_confidence(p_incident_id uuid)
returns numeric(4,3)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_trust      numeric(3,2) := 0.5;
  v_user_confirms     int := 0;
  v_user_denies       int := 0;
  v_user_resolved     int := 0;
  v_confirm_weight    numeric := 0;
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

  -- 2. Contar relatos + soma dos pesos (reputação/100) das confirmações
  select
    count(*) filter (where r.type = 'confirm'),
    count(*) filter (where r.type = 'deny'),
    count(*) filter (where r.type = 'resolved'),
    coalesce(sum(least(greatest(p.reputation_score::numeric, 0), 100) / 100.0) filter (where r.type = 'confirm'), 0)
  into v_user_confirms, v_user_denies, v_user_resolved, v_confirm_weight
  from public.incident_reports r
  left join public.profiles p on p.id = r.user_id
  where r.incident_id = p_incident_id;

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

  -- User score ponderado: (peso_confirms + resolved - denies) / total, -1..1 -> 0..1
  if (v_user_confirms + v_user_denies + v_user_resolved) = 0 then
    v_user_score := 0.5;
  else
    v_user_score := ((v_confirm_weight + v_user_resolved - v_user_denies)::numeric / (v_user_confirms + v_user_denies + v_user_resolved) + 1) / 2;
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
-- 5. Comentários
-- -----------------------------------------------------------------------------
comment on function public.trg_incident_status_reputation() is 'Aplica recompensas/penalidades de reputação quando o status do incidente muda (resolved/dismissed).';
comment on function public.get_incident_confirm_weights(uuid) is 'Retorna user_id e reputação dos usuários que confirmaram um incidente (para ponderar confiança).';
comment on function public.recalculate_incident_confidence(uuid) is 'Recalcula confidence_score com confirmações ponderadas por reputação (reputação/100).';
