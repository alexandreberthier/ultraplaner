# UltraPlaner

Ultracycling-Routenplanung mit Versorgungspunkten, Höhenprofil, ETA und Spickzettel.

**Live:** https://ultracycling-8bd56.web.app

**Regionen:** AT, CH, LI, DE, DK, IT, SK, SI, CZ, HU, LU, BE, NL, HR, ES, FR (Metropole)

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

## POI-Import

```bash
npm run import-dach-pois-pbf -- --region ES
npm run import-status
```

Siehe `.env.example` für alle Variablen. `.env` und `data/` sind gitignored.
