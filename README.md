# OnRoute Firebase — Ultra-Fast DACH POI-Karte

Web-App für Ultracycling-Routenplanung mit vorgeladenen OSM-Versorgungspunkten (POIs) entlang der GPX-Strecke.

**Region v1:** DACH (AT, DE, CH, LI) · **Hosting:** Firebase Spark (gratis)

## Schnellstart

```bash
npm install
cp .env.example .env
# Firebase-Web-App-Credentials in .env eintragen
npm run dev
```

## Firebase einrichten

1. [Firebase Console](https://console.firebase.google.com/) → neues Projekt (Spark Plan)
2. Web-App anlegen → Config in `.env` kopieren
3. Firestore aktivieren (Testmodus oder Rules deployen)
4. `firebase login` und `firebase use <project-id>` in `.firebaserc`

```bash
firebase deploy --only firestore:rules
firebase deploy --only hosting   # nach npm run build
```

## Lade-Flow

1. GPX hochladen → clientseitig parsen + DACH-Validierung
2. Geohash-5-Kacheln entlang Route → parallele Firestore-Reads (`tiles/{id}`)
3. Korridor-Filter 500 m → POIs in Pinia Store
4. **mapReady erst wenn POIs da** → Karte + Höhenprofil + Liste gleichzeitig
5. Hintergrund: `maps/{id}` mit POI-Snapshot speichern → Share-URL `/map/:id`

Dev-Logs: `[perf] gpx=… tiles=… fetch=… filter=… total=…`

## POI-Import (einmalig — vor dem ersten Einsatz unterwegs)

Die Web-App lädt **keine** POIs von Overpass. Alles muss vorher in Firestore liegen.

### 1. Service Account anlegen

1. [Firebase Console](https://console.firebase.google.com/project/ultracycling-8bd56/settings/serviceaccounts/adminsdk) → **Dienstkonten**
2. **Neuen privaten Schlüssel generieren** → JSON speichern als `service-account.json` im Projektroot
3. Datei **nicht** committen (steht in `.gitignore`)

### 2. Testlauf (3 Kacheln, ~2 Minuten)

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS=".\service-account.json"
npm run import-dach-pois -- --region AT --limit 3
```

Danach in der Firebase Console unter `tiles/` sollten Geohash-Dokumente erscheinen (z. B. `u09tv`).

### 3. Vollständiger DACH-Import (~115 Kacheln, mehrere Stunden)

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS=".\service-account.json"
npm run import-dach-pois
```

- Läuft **nur lokal** auf deinem PC
- **Resume-fähig**: bei Abbruch einfach erneut starten — fertige Kacheln werden übersprungen (`importProgress/`)
- Fortschritt: `importProgress/AT_47_13` etc.
- Ergebnis: `tiles/{geohash5}` mit POI-Arrays (~5 km Kacheln)

Optional nur eine Region:
```powershell
npm run import-dach-pois -- --region DE
```

### 4. Prüfen

- Firestore → `meta/poiImport` → `tileCount`, `poiCount`
- App: GPX aus der importierten Region hochladen → POIs in wenigen Sekunden

## Projektstruktur

- `src/services/gpx.ts` — GPX parsen, DACH-Check
- `src/services/poiQuery.ts` — Geohash-Kacheln + Firestore-Fetch
- `src/services/poiFilter.ts` — 500 m Korridor-Filter
- `src/stores/mapStore.ts` — Lade-Flow (POIs vor mapReady)
- `scripts/import-dach-pois.ts` — DACH-Import-Pipeline

## Limits v1

- GPX max. 5 MB, Route max. 1000 km
- Nur DACH (>80 % der Punkte in Bbox)
- Kein Overpass zur Laufzeit, kein Auth
