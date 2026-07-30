-- Secure shared maps (run in Supabase SQL Editor)
-- - Public read of map payload (share links)
-- - Create/update only via RPCs with write_token (never in the share URL)
-- - Payload size + rate limits against abuse
-- - write_token stored only as SHA-256 hash
--
-- Note: On Supabase, pgcrypto lives in schema "extensions".
-- digest() needs convert_to(...) so the argument types resolve.

create extension if not exists pgcrypto with schema extensions;

create table if not exists maps (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  write_token_hash text
);

alter table maps add column if not exists write_token_hash text;

-- Existing rows: random hash → permanently read-only (no client has the token)
update maps
set write_token_hash = encode(
  extensions.digest(convert_to(gen_random_uuid()::text, 'UTF8'), 'sha256'),
  'hex'
)
where write_token_hash is null or write_token_hash = '';

alter table maps alter column write_token_hash set not null;

create index if not exists maps_expires_at_idx on maps (expires_at);
create index if not exists maps_created_at_idx on maps (created_at);

alter table maps enable row level security;

-- No direct table writes for anon/authenticated
drop policy if exists "maps_anon_insert" on maps;
drop policy if exists "maps_anon_update" on maps;
drop policy if exists "maps_public_read" on maps;

create policy "maps_public_read" on maps
  for select
  using (expires_at > now());

-- Hide token hash from API responses (defense in depth)
revoke all on table maps from anon, authenticated;
grant select (id, name, created_at, expires_at, payload) on table maps to anon, authenticated;

create or replace function public._maps_validate_payload(p_payload jsonb)
returns void
language plpgsql
as $$
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  if octet_length(p_payload::text) > 3000000 then
    raise exception 'payload too large';
  end if;
  if coalesce(jsonb_array_length(p_payload->'pois'), 0) > 8000 then
    raise exception 'too many pois';
  end if;
  if coalesce(jsonb_array_length(p_payload->'routePoints'), 0) > 40000 then
    raise exception 'too many route points';
  end if;
  if coalesce(jsonb_array_length(p_payload->'routeCoords'), 0) > 40000 then
    raise exception 'too many route coords';
  end if;
  if coalesce(jsonb_array_length(p_payload->'favorites'), 0) > 2000 then
    raise exception 'too many favorites';
  end if;
  if coalesce(jsonb_array_length(p_payload->'categories'), 0) > 32 then
    raise exception 'too many categories';
  end if;
end;
$$;

create or replace function public.create_shared_map(
  p_id text,
  p_name text,
  p_expires_at timestamptz,
  p_payload jsonb,
  p_write_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  recent int;
  clean_name text;
begin
  if p_id is null or p_id !~ '^[a-z0-9]{12}$' then
    raise exception 'invalid id';
  end if;
  if p_write_token is null or length(p_write_token) < 32 or length(p_write_token) > 128 then
    raise exception 'invalid token';
  end if;

  clean_name := left(trim(both from coalesce(p_name, '')), 200);
  if clean_name = '' then
    raise exception 'invalid name';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '181 days' then
    raise exception 'invalid expiry';
  end if;

  perform public._maps_validate_payload(p_payload);

  -- Global burst limit (anon abuse / storage flood)
  select count(*)::int into recent
  from maps
  where created_at > now() - interval '10 minutes';
  if recent >= 40 then
    raise exception 'rate limit';
  end if;

  insert into maps (id, name, created_at, expires_at, payload, write_token_hash)
  values (
    p_id,
    clean_name,
    now(),
    p_expires_at,
    p_payload,
    encode(extensions.digest(convert_to(p_write_token, 'UTF8'), 'sha256'), 'hex')
  );
end;
$$;

create or replace function public.update_shared_map(
  p_id text,
  p_write_token text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated int;
begin
  if p_id is null or p_id !~ '^[a-z0-9]{12}$' then
    raise exception 'invalid id';
  end if;
  if p_write_token is null or length(p_write_token) < 32 then
    raise exception 'invalid token';
  end if;

  perform public._maps_validate_payload(p_payload);

  update maps
  set payload = p_payload
  where id = p_id
    and expires_at > now()
    and write_token_hash = encode(
      extensions.digest(convert_to(p_write_token, 'UTF8'), 'sha256'),
      'hex'
    );

  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'forbidden';
  end if;
end;
$$;

create or replace function public.cleanup_expired_maps()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  deleted int;
begin
  delete from maps where expires_at <= now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public._maps_validate_payload(jsonb) from public;
revoke all on function public.create_shared_map(text, text, timestamptz, jsonb, text) from public;
revoke all on function public.update_shared_map(text, text, jsonb) from public;
revoke all on function public.cleanup_expired_maps() from public;

grant execute on function public.create_shared_map(text, text, timestamptz, jsonb, text)
  to anon, authenticated;
grant execute on function public.update_shared_map(text, text, jsonb)
  to anon, authenticated;
-- cleanup: service_role only (default after revoke from public)

comment on function public.create_shared_map is
  'Create share map; client keeps write_token locally, never in URL.';
comment on function public.update_shared_map is
  'Update share map payload only with matching write_token.';
