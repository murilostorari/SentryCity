-- =============================================================================
-- SentryCity — Migration inicial
-- Plataforma de monitoramento urbano com OSINT, IA e geoprocessamento.
--
-- Este script é idempotente o suficiente para rodar no SQL Editor do Supabase.
-- Ordem: extensões -> tipos -> função utilitária -> tabelas -> índices ->
--        triggers -> RLS -> policies -> comentários.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensões necessárias
-- -----------------------------------------------------------------------------
-- pgcrypto  -> gen_random_uuid() para chaves primárias UUID
-- postgis   -> tipo GEOGRAPHY e funções espaciais
create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- -----------------------------------------------------------------------------
-- 2. Tipos enumerados
--    Padronizam os valores de domínio e evitam dados inconsistentes.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'incident_severity') then
    create type incident_severity as enum ('low', 'medium', 'high', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'incident_status') then
    create type incident_status as enum ('pending', 'active', 'resolved', 'dismissed');
  end if;

  if not exists (select 1 from pg_type where typname = 'source_type') then
    create type source_type as enum ('news', 'social', 'gov', 'blog', 'forum', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_type') then
    create type media_type as enum ('image', 'video', 'audio', 'document');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'analyst', 'viewer');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Função utilitária para trigger de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 4. Tabelas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 profiles
-- Perfil de usuário da aplicação, estende auth.users do Supabase Auth.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  role       user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.2 sources
-- Fontes OSINT monitoradas (portais de notícia, redes sociais, órgãos etc.).
-- trust_score expressa a confiabilidade da fonte (0.0 a 1.0).
-- -----------------------------------------------------------------------------
create table if not exists public.sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text,
  type        source_type not null default 'other',
  trust_score numeric(3,2) not null default 0.50
              check (trust_score >= 0 and trust_score <= 1),
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.3 incidents
-- Incidentes urbanos consolidados exibidos no mapa.
-- location é derivada de latitude/longitude e usada para consultas espaciais.
-- -----------------------------------------------------------------------------
create table if not exists public.incidents (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  type             text not null,
  severity         incident_severity not null default 'low',
  status           incident_status not null default 'pending',
  latitude         double precision not null,
  longitude        double precision not null,
  location         geography(Point, 4326),
  address          text,
  city             text,
  state            text,
  confidence_score numeric(4,3) not null default 0.000
                   check (confidence_score >= 0 and confidence_score <= 1),
  reported_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Preenche automaticamente a coluna location a partir de lat/lng.
create or replace function public.incidents_set_location()
returns trigger
language plpgsql
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location = ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4.4 raw_reports
-- Conteúdo bruto coletado das fontes antes do processamento por IA.
-- processed indica se o relato já gerou análise/incidente.
-- -----------------------------------------------------------------------------
create table if not exists public.raw_reports (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.sources (id) on delete set null,
  original_text text,
  original_url  text,
  published_at  timestamptz,
  processed     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.5 ai_analysis
-- Resultado da extração feita pelos modelos de IA para cada incidente.
-- raw_response guarda a resposta completa do modelo em JSONB.
-- -----------------------------------------------------------------------------
create table if not exists public.ai_analysis (
  id                 uuid primary key default gen_random_uuid(),
  incident_id        uuid references public.incidents (id) on delete cascade,
  model_name         text not null,
  prompt_version     text,
  extracted_type     text,
  extracted_location text,
  extracted_severity incident_severity,
  confidence         numeric(4,3) check (confidence >= 0 and confidence <= 1),
  raw_response       jsonb,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.6 incident_timeline
-- Histórico cronológico de eventos de um incidente (auditoria / rastreamento).
-- -----------------------------------------------------------------------------
create table if not exists public.incident_timeline (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  event_type  text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.7 incident_confirmations
-- Confirmações cruzadas de um incidente por diferentes fontes.
-- similarity_score mede o quão semelhante é o relato ao incidente.
-- -----------------------------------------------------------------------------
create table if not exists public.incident_confirmations (
  id               uuid primary key default gen_random_uuid(),
  incident_id      uuid not null references public.incidents (id) on delete cascade,
  source_id        uuid references public.sources (id) on delete set null,
  confirmed        boolean not null default false,
  similarity_score numeric(4,3) check (similarity_score >= 0 and similarity_score <= 1),
  created_at       timestamptz not null default now(),
  unique (incident_id, source_id)
);

-- -----------------------------------------------------------------------------
-- 4.8 incident_media
-- Mídias (imagens, vídeos etc.) associadas a um incidente.
-- -----------------------------------------------------------------------------
create table if not exists public.incident_media (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  file_url    text not null,
  type        media_type not null default 'image',
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 5. Índices de performance
-- =============================================================================

-- Índice espacial GIST para consultas por proximidade/bounding box.
create index if not exists idx_incidents_location on public.incidents using gist (location);

-- Filtros e ordenações mais comuns na listagem de incidentes.
create index if not exists idx_incidents_severity   on public.incidents (severity);
create index if not exists idx_incidents_type        on public.incidents (type);
create index if not exists idx_incidents_status      on public.incidents (status);
create index if not exists idx_incidents_created_at  on public.incidents (created_at desc);
create index if not exists idx_incidents_city_state  on public.incidents (city, state);

-- Relacionamentos e filtros nas tabelas dependentes.
create index if not exists idx_raw_reports_source_id      on public.raw_reports (source_id);
create index if not exists idx_raw_reports_processed       on public.raw_reports (processed);
create index if not exists idx_raw_reports_published_at    on public.raw_reports (published_at desc);

create index if not exists idx_ai_analysis_incident_id     on public.ai_analysis (incident_id);
create index if not exists idx_ai_analysis_model_name      on public.ai_analysis (model_name);

create index if not exists idx_timeline_incident_id        on public.incident_timeline (incident_id);
create index if not exists idx_timeline_created_at         on public.incident_timeline (created_at desc);

create index if not exists idx_confirmations_incident_id   on public.incident_confirmations (incident_id);
create index if not exists idx_confirmations_source_id     on public.incident_confirmations (source_id);

create index if not exists idx_media_incident_id           on public.incident_media (incident_id);

-- =============================================================================
-- 6. Triggers
-- =============================================================================

-- updated_at automático em incidents.
drop trigger if exists trg_incidents_updated_at on public.incidents;
create trigger trg_incidents_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

-- location automático em incidents (insert e update de lat/lng).
drop trigger if exists trg_incidents_set_location on public.incidents;
create trigger trg_incidents_set_location
  before insert or update of latitude, longitude on public.incidents
  for each row execute function public.incidents_set_location();

-- =============================================================================
-- 7. Row Level Security
-- =============================================================================

alter table public.profiles              enable row level security;
alter table public.sources               enable row level security;
alter table public.incidents             enable row level security;
alter table public.raw_reports           enable row level security;
alter table public.ai_analysis           enable row level security;
alter table public.incident_timeline     enable row level security;
alter table public.incident_confirmations enable row level security;
alter table public.incident_media        enable row level security;

-- Função auxiliar: verifica se o usuário atual tem papel de admin ou analyst.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'analyst')
  );
$$;

-- ---------- profiles ----------
-- Cada usuário lê/atualiza o próprio perfil; admins veem todos.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- incidents ----------
-- Leitura pública (dados de monitoramento urbano); escrita apenas para staff.
drop policy if exists "incidents_select_all" on public.incidents;
create policy "incidents_select_all" on public.incidents
  for select using (true);

drop policy if exists "incidents_write_staff" on public.incidents;
create policy "incidents_write_staff" on public.incidents
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- sources ----------
drop policy if exists "sources_select_all" on public.sources;
create policy "sources_select_all" on public.sources
  for select using (true);

drop policy if exists "sources_write_staff" on public.sources;
create policy "sources_write_staff" on public.sources
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- raw_reports (dados sensíveis de coleta: apenas staff) ----------
drop policy if exists "raw_reports_staff_only" on public.raw_reports;
create policy "raw_reports_staff_only" on public.raw_reports
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- ai_analysis (leitura pública, escrita staff) ----------
drop policy if exists "ai_analysis_select_all" on public.ai_analysis;
create policy "ai_analysis_select_all" on public.ai_analysis
  for select using (true);

drop policy if exists "ai_analysis_write_staff" on public.ai_analysis;
create policy "ai_analysis_write_staff" on public.ai_analysis
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- incident_timeline ----------
drop policy if exists "timeline_select_all" on public.incident_timeline;
create policy "timeline_select_all" on public.incident_timeline
  for select using (true);

drop policy if exists "timeline_write_staff" on public.incident_timeline;
create policy "timeline_write_staff" on public.incident_timeline
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- incident_confirmations ----------
drop policy if exists "confirmations_select_all" on public.incident_confirmations;
create policy "confirmations_select_all" on public.incident_confirmations
  for select using (true);

drop policy if exists "confirmations_write_staff" on public.incident_confirmations;
create policy "confirmations_write_staff" on public.incident_confirmations
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------- incident_media ----------
drop policy if exists "media_select_all" on public.incident_media;
create policy "media_select_all" on public.incident_media
  for select using (true);

drop policy if exists "media_write_staff" on public.incident_media;
create policy "media_write_staff" on public.incident_media
  for all using (public.is_staff()) with check (public.is_staff());

-- =============================================================================
-- 8. Comentários (documentação das tabelas)
-- =============================================================================
comment on table public.profiles              is 'Perfis de usuários da aplicação; estende auth.users.';
comment on table public.sources               is 'Fontes OSINT monitoradas com pontuação de confiabilidade.';
comment on table public.incidents             is 'Incidentes urbanos consolidados exibidos no mapa.';
comment on table public.raw_reports           is 'Conteúdo bruto coletado das fontes antes do processamento por IA.';
comment on table public.ai_analysis           is 'Resultados de extração dos modelos de IA por incidente.';
comment on table public.incident_timeline     is 'Histórico cronológico de eventos de cada incidente.';
comment on table public.incident_confirmations is 'Confirmações cruzadas de incidentes por diferentes fontes.';
comment on table public.incident_media        is 'Mídias associadas aos incidentes.';

comment on column public.incidents.location         is 'Ponto geográfico (SRID 4326) derivado de latitude/longitude via trigger.';
comment on column public.incidents.confidence_score is 'Confiança agregada do incidente (0.0 a 1.0).';
comment on column public.sources.trust_score        is 'Confiabilidade da fonte (0.0 a 1.0).';
comment on column public.ai_analysis.raw_response    is 'Resposta completa do modelo de IA em JSONB.';
