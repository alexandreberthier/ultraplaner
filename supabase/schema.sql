-- OnRoute POI tiles on Supabase
-- Run in Supabase SQL Editor once per project.

create table if not exists tiles (
  geohash text primary key,
  pois jsonb not null default '[]'::jsonb,
  poi_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists import_progress (
  id text primary key,
  region text,
  poi_count int default 0,
  source text,
  imported_at timestamptz default now()
);

create table if not exists import_meta (
  id text primary key default 'poiImport',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table tiles enable row level security;
alter table import_progress enable row level security;
alter table import_meta enable row level security;

-- Public read for the Vue app (anon key). Writes use service_role only.
drop policy if exists "tiles_public_read" on tiles;
create policy "tiles_public_read" on tiles for select using (true);

drop policy if exists "import_meta_public_read" on import_meta;
create policy "import_meta_public_read" on import_meta for select using (true);

-- import_progress: no anon access (admin/import only via service_role)

-- Saved maps: see maps.sql for secure RLS + RPCs (create_shared_map / update_shared_map)
-- Page stats (optional / unused by app): see page_stats.sql
