-- =============================================================================
-- SentryCity — Migration 0011: URL Ingestion Support
-- ---------------------------------------------------------------------------
-- 1. location_precision em ai_analysis (precisão da localização extraída)
-- 2. source_name e title em raw_reports (metadados da URL extraída)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. location_precision em ai_analysis
-- -----------------------------------------------------------------------------
-- Classifica a precisão da localização extraída pela IA:
--   exact, street, neighborhood, city, unknown
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'location_precision'
  ) then
    create type location_precision as enum ('exact', 'street', 'neighborhood', 'city', 'unknown');
  end if;
end $$;

alter table public.ai_analysis
  add column if not exists location_precision location_precision not null default 'unknown';

comment on column public.ai_analysis.location_precision
  is 'Precisão da localização extraída: exact, street, neighborhood, city, unknown.';

-- -----------------------------------------------------------------------------
-- 2. source_name e title em raw_reports
-- -----------------------------------------------------------------------------
-- source_name: domínio/fonte do artigo (ex: "g1.globo.com")
-- title: título original da notícia
alter table public.raw_reports
  add column if not exists source_name text,
  add column if not exists title text;

comment on column public.raw_reports.source_name
  is 'Domínio ou fonte de onde veio a notícia (ex: g1.globo.com).';
comment on column public.raw_reports.title
  is 'Título original da notícia extraído da URL.';
