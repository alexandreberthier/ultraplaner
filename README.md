# UltraPlaner

Ultracycling-Routenplanung mit Versorgungspunkten, Höhenprofil, ETA und Spickzettel.

**Live:** https://ultraplaner.com

**Regionen:** AT, CH, LI, DE, DK, IT, SK, SI, CZ, HU, LU, BE, NL, HR, ES (inkl. Balearen/Kanaren), PT, PL, GB, NO, SE, FI, EE, LV, LT, RO, IE, NI, IS, GR, CY, MT, AD, BG, RS, BA, ME, AL, MK, XK, FR (Metropole)

## Schnellstart

```bash
npm install
cp .env.example .env
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ORS_API_KEY eintragen
npm run dev
```

## Deploy

```bash
npm run deploy
```

Deploy = `build` → **Prerender** (Landing DE/EN/ES/FR) → Firebase Hosting.  
Prerender ist soft: schlägt es fehl, wird nur gewarnt und trotzdem deployed. Strikt: `PRERENDER_STRICT=1 npm run prerender`.  
Einmalig Browser: `npx playwright install chromium`

Nach Schema-Änderungen an Share-Maps einmal `supabase/maps.sql` im Supabase SQL Editor ausführen (Write-Token / Rate-Limits).

Anonyme Seitenbesuche: einmal `supabase/page_stats.sql` im Supabase SQL Editor ausführen (Tabelle `page_stats_daily` + RPC `record_page_session`). Lesen nur mit Service-Role: `npm run page-stats`.

## POI-Import

```bash
npm run import-dach-pois-pbf -- --region ES
npm run import-status
```

Siehe `.env.example` für alle Variablen. `.env` und `data/` sind gitignored.
