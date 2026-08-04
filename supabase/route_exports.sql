-- Temporary phone-transfer exports (GPX/FIT via QR → /routes/import/:id)
-- Run in Supabase SQL Editor after deploy if not applied yet.
-- Public read-by-id (unguessable UUID); insert only via RPC. TTL ~24h.

create extension if not exists pgcrypto with schema extensions;

create table if not exists route_exports (
  id text primary key,
  name text not null,
  filename text not null,
  mime_type text not null,
  encoding text not null default 'utf8',
  kind text not null default 'gpx',
  target text,
  content text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists route_exports_expires_at_idx on route_exports (expires_at);
create index if not exists route_exports_created_at_idx on route_exports (created_at);

alter table route_exports enable row level security;

drop policy if exists "route_exports_public_read" on route_exports;

create policy "route_exports_public_read" on route_exports
  for select
  using (expires_at > now());

revoke all on table route_exports from anon, authenticated;
grant select (
  id, name, filename, mime_type, encoding, kind, target, content, created_at, expires_at
) on table route_exports to anon, authenticated;

create or replace function public.create_route_export(
  p_id text,
  p_name text,
  p_filename text,
  p_mime_type text,
  p_encoding text,
  p_kind text,
  p_target text,
  p_content text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  recent int;
  clean_name text;
  clean_filename text;
begin
  if p_id is null or p_id !~ '^[a-f0-9]{32}$' then
    raise exception 'invalid id';
  end if;

  clean_name := left(trim(both from coalesce(p_name, '')), 200);
  if clean_name = '' then
    raise exception 'invalid name';
  end if;

  clean_filename := left(trim(both from coalesce(p_filename, '')), 120);
  if clean_filename = '' then
    raise exception 'invalid filename';
  end if;

  if p_mime_type is null or length(p_mime_type) < 3 or length(p_mime_type) > 120 then
    raise exception 'invalid mime type';
  end if;

  if p_encoding is null or p_encoding not in ('utf8', 'base64') then
    raise exception 'invalid encoding';
  end if;

  if p_kind is null or p_kind not in ('gpx', 'fit') then
    raise exception 'invalid kind';
  end if;

  if p_target is not null and p_target not in ('coros') then
    raise exception 'invalid target';
  end if;

  if p_content is null or length(p_content) < 1 or length(p_content) > 4000000 then
    raise exception 'invalid content';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '25 hours' then
    raise exception 'invalid expiry';
  end if;

  select count(*)::int into recent
  from route_exports
  where created_at > now() - interval '10 minutes';
  if recent >= 60 then
    raise exception 'rate limit';
  end if;

  insert into route_exports (
    id, name, filename, mime_type, encoding, kind, target, content, created_at, expires_at
  )
  values (
    p_id,
    clean_name,
    clean_filename,
    p_mime_type,
    p_encoding,
    p_kind,
    p_target,
    p_content,
    now(),
    p_expires_at
  );
end;
$$;

create or replace function public.cleanup_expired_route_exports()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  deleted int;
begin
  delete from route_exports where expires_at <= now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.create_route_export(
  text, text, text, text, text, text, text, text, timestamptz
) from public;
revoke all on function public.cleanup_expired_route_exports() from public;

grant execute on function public.create_route_export(
  text, text, text, text, text, text, text, text, timestamptz
) to anon, authenticated;

comment on function public.create_route_export is
  'Create short-lived GPX/FIT export for QR phone transfer; public read by id.';
