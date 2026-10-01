-- Periodic storage cleanup for UltraPlaner (run in Supabase SQL Editor)
--
-- Client-side: npm run db:cleanup  (expired rows + slim share payloads)
-- This file: VACUUM + optional pg_cron schedule for expired maps/exports.
--
-- After npm run db:cleanup (or large deletes), reclaim disk:

vacuum (analyze) maps;
vacuum (analyze) route_exports;
vacuum (analyze) import_progress;

-- Optional: daily cleanup via pg_cron (enable extension in Dashboard → Database → Extensions)
-- create extension if not exists pg_cron with schema extensions;
--
-- select cron.schedule(
--   'ultraplaner-cleanup-expired',
--   '15 3 * * *',  -- 03:15 UTC daily
--   $$
--     select public.cleanup_expired_maps();
--     select public.cleanup_expired_route_exports();
--   $$
-- );
--
-- List jobs:   select * from cron.job;
-- Unschedule:  select cron.unschedule('ultraplaner-cleanup-expired');
