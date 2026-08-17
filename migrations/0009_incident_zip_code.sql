-- -----------------------------------------------------------------------------
-- 0009: Coluna zip_code em incidents
-- -----------------------------------------------------------------------------
-- Adiciona o CEP aos incidentes (preenchido pela ingestão de notícias e pelo
-- modal de novo evento, via ViaCEP ou geocoding).
alter table public.incidents
  add column if not exists zip_code text;

comment on column public.incidents.zip_code is 'CEP do endereço do incidente (00000-000).';