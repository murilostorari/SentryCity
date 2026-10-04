-- =============================================================================
-- SentryCity — Migration 0019: Permissões de relato
-- ---------------------------------------------------------------------------
-- 1. Trigger: o criador de um incidente NÃO pode inserir relatos 'confirm'
--    ou 'deny' no próprio incidente (só pode informar 'resolved'/'update').
--    Vale para a API (insert direto) e para RPCs security definer (bump).
-- 2. Crawler/ingestão inserem user_id NULL → não são afetados.
-- =============================================================================

create or replace function public.enforce_report_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if new.user_id is null then
    return new;  -- relatos do sistema/crawler
  end if;

  select created_by into v_creator
  from public.incidents
  where id = new.incident_id;

  if v_creator is not null
     and v_creator = new.user_id
     and new.type in ('confirm', 'deny') then
    raise exception 'Criador do incidente não pode confirmar nem negar a própria ocorrência'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_report_permissions on public.incident_reports;
create trigger trg_report_permissions
  before insert on public.incident_reports
  for each row
  execute function public.enforce_report_permissions();

comment on function public.enforce_report_permissions() IS
  'Impede que o criador do incidente confirme/negue a própria ocorrência (só resolved/update).';

-- -----------------------------------------------------------------------------
-- Índice único de garantia (caso a constraint tenha sido perdida em algum
-- ambiente): uma ação por usuário por incidente (NULLs do crawler livres).
-- -----------------------------------------------------------------------------
create unique index if not exists incident_reports_unique_user_type
  on public.incident_reports (incident_id, user_id, type);
