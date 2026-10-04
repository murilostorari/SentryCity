-- =============================================================================
-- SentryCity — Migration 0018: Lifecycle config (novos tipos) + UI de timeline
-- ---------------------------------------------------------------------------
-- 1. incident_visibility_config: linhas para os novos tipos de incidente
--    (crawler v2.6 passou a emitir traffic_accident, motorcycle_accident,
--    power_outage, fire, flood, infrastructure_damage, road_closure, violence...)
-- 2. Normaliza comentários antigos de relatos do crawler para 'Via crawler: ...'
-- 3. bump_incident_activity: renova o timer em QUALQUER clique de "Confirmar
--    ativo" (antes: on conflict do nothing → 2º clique não renovava).
-- 4. RPC get_profile_names(): expõe apenas id+name de profiles (bypassa RLS)
--    para a timeline unificada mostrar nome em vez de id de usuário.
-- =============================================================================

-- 1. Config por tipo (upsert idempotente — mesmos valores do frontend)
insert into public.incident_visibility_config (incident_type, resolved_visibility_hours, auto_resolve_hours)
values
  ('traffic_accident',      48, 72),
  ('motorcycle_accident',   48, 72),
  ('power_outage',          48, 72),
  ('fire',                  48, 48),
  ('flood',                 24, 48),
  ('infrastructure_damage',168,168),
  ('road_closure',          24, 48),
  ('violence',              48, 72)
on conflict (incident_type) do update
  set resolved_visibility_hours = excluded.resolved_visibility_hours,
      auto_resolve_hours        = excluded.auto_resolve_hours;

-- 2. Normaliza comentários antigos do crawler para 'Via crawler: ...'
update public.incident_reports
set comment = 'Via crawler: ' || substring(comment from ':\s*(.*)$')
where comment like 'Notícia relacionada via crawler:%';

-- 3. bump_incident_activity: renova o timer em QUALQUER clique de
--    "Confirmar ativo". Antes usava `do nothing`, então o segundo clique do
--    mesmo usuário não inseria nada e o countdown não reiniciava.
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

  -- Insere/atualiza o relato 'confirm' — created_at = now() renova o TTL
  insert into public.incident_reports (incident_id, user_id, type, comment)
  values (p_incident_id, auth.uid(), 'confirm', 'Confirmado ativo via app')
  on conflict (incident_id, user_id, type)
  do update set created_at = excluded.created_at,
                comment    = excluded.comment;

  perform public.recalculate_incident_confidence(p_incident_id);
end;
$$;

comment on function public.bump_incident_activity(uuid)
  is 'Insere/atualiza um relato confirm (created_at=now) para renovar o TTL do incidente. Usuário autenticado.';

-- 4. Nomes de perfil para a timeline (apenas id + name; RLS de profiles é
--    restrito a próprio/staff, então este RPC é security definer)
create or replace function public.get_profile_names(p_ids uuid[])
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from public.profiles p
  where p.id = any(p_ids);
$$;

grant execute on function public.get_profile_names(uuid[]) to anon, authenticated;

comment on function public.get_profile_names(uuid[]) IS
  'Retorna id+name de profiles para exibição na timeline (bypassa RLS, expõe apenas nome).';
