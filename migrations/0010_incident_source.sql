-- -----------------------------------------------------------------------------
-- 0010: Coluna source em incidents
-- -----------------------------------------------------------------------------
-- Fonte real do incidente (ex.: "G1", "UOL", "Manual"). Preenchida pela
-- ingestão de notícias (campo Fonte) ou pelo modal de novo evento.
alter table public.incidents
  add column if not exists source text;

comment on column public.incidents.source is 'Fonte real do incidente (portal, manual etc).';