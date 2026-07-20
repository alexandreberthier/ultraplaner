-- Saved maps (share URLs) — run once in Supabase SQL Editor after schema.sql

create table if not exists maps (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists maps_expires_at_idx on maps (expires_at);

alter table maps enable row level security;

drop policy if exists "maps_public_read" on maps;
create policy "maps_public_read" on maps for select using (true);

drop policy if exists "maps_anon_insert" on maps;
create policy "maps_anon_insert" on maps for insert with check (true);

drop policy if exists "maps_anon_update" on maps;
create policy "maps_anon_update" on maps for update using (true) with check (true);
