-- Anonymous page-session counter (no cookies, no third-party analytics).
-- Run once in Supabase SQL Editor after schema.sql.

create table if not exists page_stats_daily (
  day date primary key,
  sessions int not null default 0,
  paths jsonb not null default '{}'::jsonb
);

alter table page_stats_daily enable row level security;

-- No public read — view stats in Supabase dashboard or via service_role script.

create or replace function public.record_page_session(p_path_bucket text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket text;
  allowed text[] := array['home', 'map', 'supply', 'privacy', 'imprint', 'wahoo_callback', 'other'];
begin
  bucket := left(trim(coalesce(p_path_bucket, '')), 32);
  if bucket = '' or not (bucket = any (allowed)) then
    bucket := 'other';
  end if;

  insert into page_stats_daily (day, sessions, paths)
  values (
    current_date,
    1,
    jsonb_build_object(bucket, 1)
  )
  on conflict (day) do update
  set
    sessions = page_stats_daily.sessions + 1,
    paths = jsonb_set(
      page_stats_daily.paths,
      array[bucket],
      to_jsonb(coalesce((page_stats_daily.paths ->> bucket)::int, 0) + 1),
      true
    );
end;
$$;

revoke all on function public.record_page_session(text) from public;
grant execute on function public.record_page_session(text) to anon, authenticated;
