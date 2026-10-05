-- =============================================================================
-- SentryCity — Migration 0020: Resolução por consenso + timer honesto
-- ---------------------------------------------------------------------------
-- Problemas corrigidos:
--   1. "Informar resolução" contava como atividade e REINICIAVA o timer de
--      auto-resolução — dizer que o incidente acabou mantinha ele vivo por
--      mais N horas (bug: resolved não deveria renovar o timer).
--   2. Relato 'resolved' valia +1 fixo no user score da confiança, enquanto
--      'confirm' é ponderado por reputação (reputação/100).
--   3. Só staff (resolve_incident) ou o TTL lento (24h–168h) tiravam um
--      incidente de 'active' — a comunidade não tinha caminho próprio de
--      resolver.
--
-- Regras novas:
--   - Timer: apenas confirm/deny/update renovam (resolved NÃO renova).
--   - Consenso: >= 2 usuários distintos informaram resolução, a última
--     palavra é uma resolução (mais recente que o último confirm/deny) e
--     o voto mais recente tem >= 1h de carência (janela para contestar)
--     -> resolve na próxima rodada do cron horário, com evento na timeline
--     e +5 de reputação para quem informou resolução (trigger 0005).
--   - Confiança: 'resolved' passa a ser ponderado por reputação, igual a
--     'confirm' (novo RPC get_incident_report_weights para o frontend).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Função: resolve incidentes automaticamente (reescrita)
--    Chamada por: pg_cron (hourly).
-- -----------------------------------------------------------------------------
create or replace function public.auto_resolve_inactive_incidents()
returns integer  -- retorna quantos incidentes foram resolvidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now           timestamptz := now();
  v_resolved      integer := 0;
  r               record;
  v_cutoff        timestamptz;
  v_has_activity  boolean;
  v_votes         integer := 0;
  v_last_resolved timestamptz;
  v_last_contest  timestamptz;
begin
  for r in
    select i.id, i.type, i.created_at
    from public.incidents i
    where i.status in ('active', 'pending')
  loop
    -- (a) Consenso de resolução — caminho rápido, independente do TTL
    select
      count(distinct rep.user_id) filter (
        where rep.type = 'resolved' and rep.user_id is not null
      ),
      max(rep.created_at) filter (where rep.type = 'resolved'),
      max(rep.created_at) filter (where rep.type in ('confirm', 'deny'))
    into v_votes, v_last_resolved, v_last_contest
    from public.incident_reports rep
    where rep.incident_id = r.id;

    if v_votes >= 2
       and v_last_resolved is not null
       and v_last_resolved <= v_now - interval '1 hour'
       and (v_last_contest is null or v_last_contest < v_last_resolved)
    then
      update public.incidents
      set status = 'resolved'
      where id = r.id and status in ('active', 'pending');

      if found then
        insert into public.incident_timeline (incident_id, event_type, description)
        values (r.id, 'resolved_by_consensus',
          'Resolvido por consenso: ' || v_votes
          || ' usuários informaram resolução e ninguém contestou após o último voto (1h de carência).');
        v_resolved := v_resolved + 1;
      end if;
      continue;
    end if;

    -- (b) TTL por inatividade — 'resolved' NÃO conta como atividade
    v_cutoff := r.created_at + (public.get_auto_resolve_hours(r.type) || ' hours')::interval;
    if v_cutoff > v_now then
      continue;  -- ainda dentro do TTL, pula
    end if;

    select exists (
      select 1 from public.incident_reports rep
      where rep.incident_id = r.id
        and rep.type <> 'resolved'
        and rep.created_at > v_now - (public.get_auto_resolve_hours(r.type) || ' hours')::interval
    ) into v_has_activity;

    if not v_has_activity then
      -- Sem atividade (confirm/deny/update) recente -> resolve
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
  is 'Resolve por consenso (>=2 resolvidos, 1h de carência, sem contestação recente) ou por inatividade (resolved NÃO renova o timer). Call via pg_cron.';

-- -----------------------------------------------------------------------------
-- 2. Confiança: 'resolved' ponderado por reputação (igual a 'confirm')
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
  v_resolved_weight   numeric := 0;
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

  -- 2. Contar relatos + soma dos pesos (reputação/100) de confirms e resolved
  select
    count(*) filter (where r.type = 'confirm'),
    count(*) filter (where r.type = 'deny'),
    count(*) filter (where r.type = 'resolved'),
    coalesce(sum(least(greatest(p.reputation_score::numeric, 0), 100) / 100.0) filter (where r.type = 'confirm'), 0),
    coalesce(sum(least(greatest(p.reputation_score::numeric, 0), 100) / 100.0) filter (where r.type = 'resolved'), 0)
  into v_user_confirms, v_user_denies, v_user_resolved, v_confirm_weight, v_resolved_weight
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

  -- User score ponderado: (peso_confirms + peso_resolved - denies) / total, -1..1 -> 0..1
  if (v_user_confirms + v_user_denies + v_user_resolved) = 0 then
    v_user_score := 0.5;
  else
    v_user_score := ((v_confirm_weight + v_resolved_weight - v_user_denies)::numeric / (v_user_confirms + v_user_denies + v_user_resolved) + 1) / 2;
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
-- 3. RPC: pesos de reputação de TODOS os relatos de um incidente (confirm,
--    deny, resolved, update) — frontend calcula pesos ponderados sem N chamadas.
--    SECURITY DEFINER porque RLS de profiles restringe a leitura ao próprio dono.
-- -----------------------------------------------------------------------------
create or replace function public.get_incident_report_weights(p_incident_id uuid)
returns table (type text, reputation_score numeric(4,2))
language sql
security definer
set search_path = public
stable
as $$
  select r.type::text, p.reputation_score
  from public.incident_reports r
  join public.profiles p on p.id = r.user_id
  where r.incident_id = p_incident_id
    and r.user_id is not null;
$$;

grant execute on function public.get_incident_report_weights(uuid) to anon, authenticated;

comment on function public.get_incident_report_weights(uuid) is
  'Retorna tipo + reputação dos usuários que relataram um incidente (ponderação da confiança).';
