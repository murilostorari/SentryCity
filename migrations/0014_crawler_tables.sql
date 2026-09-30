-- =============================================================================
-- SentryCity — Migration 0014: OSINT Crawler Tables
-- ---------------------------------------------------------------------------
-- Tabelas para gerenciar feeds RSS e logs de crawls automatizados.
-- Trabalha em conjunto com o Edge Function `news-crawler` e a Edge Function
-- `auto-resolve` (migration 0013) para ciclo de vida completo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela de feeds RSS monitorados
--    Configurada via Supabase Dashboard (ou inserção manual).
--    Cada feed é checado periodicamente pelo crawler.
-- -----------------------------------------------------------------------------
create table if not exists public.crawler_feeds (
  id              uuid primary key default gen_random_uuid(),
  url             text not null unique,
  name            text,
  category        text,
  is_active       boolean not null default true,
  last_fetched_at timestamptz,
  last_guid       text,
  last_success    boolean,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.crawler_feeds
  is 'Feeds de notícias (RSS) monitorados pelo crawler OSINT autônomo.';

-- -----------------------------------------------------------------------------
-- 2. Tabela de logs de execução do crawler
--    Um registro por run, com stats de processamento.
-- -----------------------------------------------------------------------------
create table if not exists public.crawler_logs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  feeds_checked     integer default 0,
  articles_found    integer default 0,
  articles_relevant integer default 0,
  incidents_created integer default 0,
  incidents_merged  integer default 0,
  errors            jsonb,
  duration_ms       integer,
  status            text not null default 'running' check (status in ('running', 'success', 'error'))
);

comment on table public.crawler_logs
  is 'Histórico de execuções do crawler OSINT (stats por run).';

-- -----------------------------------------------------------------------------
-- 3. Coluna de hash de URL em raw_reports (para deduplicação rápida)
--    Evita extrair/reanalizar o mesmo artigo em runs consecutivos.
-- -----------------------------------------------------------------------------
alter table public.raw_reports
  add column if not exists url_hash text;

create index if not exists idx_raw_reports_url_hash on public.raw_reports(url_hash);

-- Remove duplicate original_url entries BEFORE creating unique index
-- (existing data may have duplicates from before this migration)
delete from public.raw_reports
where ctid IN (
  select ctid
  from (
    select ctid, row_number() over (
      partition by original_url
       order by created_at desc nulls last, id desc
    ) as rn
    from public.raw_reports
    where original_url is not null
  ) t
  where rn > 1
);

-- Now safe to create unique index
create unique index if not exists idx_raw_reports_original_url
  on public.raw_reports(original_url)
  where original_url is not null;

comment on column public.raw_reports.url_hash
  is 'SHA-256 do URL — usado para deduplicação antes de processar.';

-- -----------------------------------------------------------------------------
-- 4. Trigger updated_at para crawler_feeds
-- -----------------------------------------------------------------------------
create or replace function public.set_crawler_feeds_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_crawler_feeds_updated_at on public.crawler_feeds;
create trigger trg_crawler_feeds_updated_at
  before update on public.crawler_feeds
  for each row execute function public.set_crawler_feeds_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Feeds RSS padrão (insert idempotente)
--    Foco em fontes brasileiras de notícias urbanas
-- -----------------------------------------------------------------------------
insert into public.crawler_feeds (url, name, category) values
  ('https://g1.globo.com/rss/g1/', 'G1 - Principal', 'general'),
  ('https://g1.globo.com/rss/g1/cidades/', 'G1 - Cidades', 'urban'),
  ('https://g1.globo.com/rss/g1/transito/', 'G1 - Trânsito', 'traffic'),
  ('https://g1.globo.com/rss/g1/sp/sao-paulo/', 'G1 - São Paulo', 'regional'),
  ('https://g1.globo.com/rss/g1/rj/rio-de-janeiro/', 'G1 - Rio de Janeiro', 'regional'),
  ('https://rss.uol.com.br/feed/noticias.xml', 'UOL - Notícias', 'general'),
  ('https://oglobo.globo.com/rss.xml', 'O Globo - Principal', 'general'),
  ('https://oglobo.globo.com/ultimas/rss.xml', 'O Globo - Últimas', 'general'),
  ('https://www.cartacapital.com.br/feed/', 'Carta Capital', 'independent')
on conflict (url) do nothing;
