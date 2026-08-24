-- 0012: Fontes de notícias por incidente
-- Vincula raw_reports ao incidente criado e guarda a imagem do artigo.

alter table public.raw_reports
  add column if not exists incident_id uuid references public.incidents (id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists description text;

create index if not exists idx_raw_reports_incident_id on public.raw_reports (incident_id);

-- View pública: expõe apenas metadados das notícias (sem original_text),
-- para popular os cards de fontes no app. Views no Supabase bypassam o RLS
-- da tabela base (security_invoker = false por padrão).
create or replace view public.incident_news as
  select
    id,
    incident_id,
    source_name,
    title,
    description,
    original_url,
    image_url,
    published_at,
    created_at
  from public.raw_reports
  where incident_id is not null
  order by published_at desc nulls last, created_at desc;

grant select on public.incident_news to authenticated;

comment on view public.incident_news is
  'Metadados públicos das notícias vinculadas a um incidente (cards de fontes).';
