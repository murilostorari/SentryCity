-- =============================================================================
-- SentryCity — Migration 0004: Auth & Profiles
-- - Novos campos de reputação/estatísticas em profiles
-- - Criação automática de profile ao cadastrar em auth.users
-- - Integração de user_id nos incident_reports
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Novos campos em profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reputation_score numeric(4,2) not null default 50.00,
  add column if not exists reports_count integer not null default 0,
  add column if not exists confirmed_reports integer not null default 0,
  add column if not exists resolved_reports integer not null default 0;

comment on column public.profiles.reputation_score is 'Pontuação de reputação do usuário (0 a 100, default 50).';
comment on column public.profiles.reports_count is 'Total de relatos enviados pelo usuário.';
comment on column public.profiles.confirmed_reports is 'Quantidade de confirmações enviadas.';
comment on column public.profiles.resolved_reports is 'Quantidade de resoluções informadas.';

-- -----------------------------------------------------------------------------
-- 2. Criação automática de profile ao criar usuário em auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. Atualização automática de estatísticas do profile ao criar incident_report
-- -----------------------------------------------------------------------------
create or replace function public.trg_incident_reports_profile_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set reports_count = reports_count + 1,
        confirmed_reports = confirmed_reports + case when new.type = 'confirm' then 1 else 0 end,
        resolved_reports  = resolved_reports  + case when new.type = 'resolved' then 1 else 0 end
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_incident_reports_profile_stats on public.incident_reports;
create trigger trg_incident_reports_profile_stats
  after insert on public.incident_reports
  for each row execute function public.trg_incident_reports_profile_stats();

-- -----------------------------------------------------------------------------
-- 4. RLS — profiles
--    O usuário lê o próprio profile e admins veem todos (já existente).
--    Ajusta insert para permitir apenas o próprio usuário e staff.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5. RLS — incident_reports
--    Inserção passa a exigir usuário autenticado (auth.uid() not null).
--    Atualização/deleção apenas para o dono do relato ou staff.
-- -----------------------------------------------------------------------------
drop policy if exists "reports_insert_any" on public.incident_reports;
create policy "reports_insert_auth" on public.incident_reports
  for insert with check (auth.uid() is not null);

drop policy if exists "reports_update_own_or_staff" on public.incident_reports;
create policy "reports_update_own_or_staff" on public.incident_reports
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  ) with check (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  );

drop policy if exists "reports_delete_own_or_staff" on public.incident_reports;
create policy "reports_delete_own_or_staff" on public.incident_reports
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'analyst'))
  );

-- -----------------------------------------------------------------------------
-- 6. Comentários
-- -----------------------------------------------------------------------------
comment on function public.handle_new_user() is 'Cria profile automaticamente quando um usuário se cadastra em auth.users.';
comment on function public.trg_incident_reports_profile_stats() is 'Atualiza reports_count e contadores de confirmação/resolução no profile do autor.';
