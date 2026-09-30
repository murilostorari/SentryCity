-- =============================================================================
-- SentryCity — Migration 0015: Search Source Type for OSINT Crawler
-- ---------------------------------------------------------------------------
-- Adds support for web-search-based sources (Jina Search API) in crawler_feeds.
-- This allows monitoring news for specific cities WITHOUT RSS feeds — just a
-- search query stored in the `url` column.
--
-- source_type values:
--   'rss'         → url is an RSS feed URL (existing behavior)
--   'jina_search' → url is a Jina Search query (s.jina.ai)
--
-- Works with the news-crawler Edge Function which supports deduplication,
-- AI relevance filtering, Jina Reader extraction, full LLM analysis,
-- geocoding, and incident creation/merge.
-- =============================================================================

-- 1. Add source_type column to crawler_feeds
alter table public.crawler_feeds
  add column if not exists source_type text not null default 'rss'
  check (source_type in ('rss', 'jina_search'));

comment on column public.crawler_feeds.source_type
  is 'rss = url is an RSS feed; jina_search = url is a Jina Search query';

-- 2. Index for efficient querying by source type and active status
create index if not exists idx_crawler_feeds_source_type
  on public.crawler_feeds(source_type, is_active);

-- 3. Default search queries for Adamantina (SP) — testing only
--    Jina Search finds recent news about accidents/incidents in Adamantina.
--    The crawler extracts URLs from search results and processes them through
--    the full pipeline (dedup → AI filter → Jina Reader → LLM → geocode → incident).
insert into public.crawler_feeds (url, name, category, source_type, is_active) values
  ('acidente Adamantina SP transito colisao', 'Jina Search: Acidentes Adamantina', 'traffic', 'jina_search', true),
  ('incendio Adamantina SP', 'Jina Search: Incêndios Adamantina', 'emergency', 'jina_search', true)
on conflict (url) do nothing;
