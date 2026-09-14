# Android Play Release (AAB)

Kurz: Release-Keystore lokal anlegen, `keystore.properties` füllen, Brand aktualisieren, dann `npm run android:bundle`.

Launcher, Splash und Play-Grafiken (512-Icon + Feature Graphic 1024×500) liegen unter `scripts/assets/` bzw. `android/app/src/main/res/`. Neu erzeugen:

```bash
npm run android:brand
```

## 1. Keystore erzeugen

Im Ordner `android/` (einmalig; Passwort und Alias selbst wählen und sicher speichern):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Unter Windows (PowerShell), aus dem Repo-Root:

```powershell
cd android
keytool -genkeypair -v -storetype PKCS12 -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` liegt in der JDK-Installation (`bin/keytool`). Ohne JDK: Android Studio → Settings → Build → Gradle JDK prüfen.

**Wichtig:** Keystore und Passwörter nie committen und nicht verlieren — ohne denselben Key kannst du Updates in Play Console nicht mehr signieren.

## 2. `keystore.properties` anlegen

```bash
cp android/keystore.properties.example android/keystore.properties
```

Dann in `android/keystore.properties` die Platzhalter ersetzen (`storePassword`, `keyAlias`, `keyPassword`).  
`storeFile` ist relativ zum Ordner `android/` (z. B. `upload-keystore.jks`).

Ohne diese Datei bleibt Debug-Build möglich; Release-Signing greift nur, wenn die Properties-Datei existiert.

## 3. AAB bauen

Aus dem Repo-Root:

```bash
npm run android:bundle
```

Das synct die aktuelle Web-App nach Android und führt `bundleRelease` über den Gradle-Wrapper aus (Windows: `gradlew.bat`, sonst `./gradlew`).

## 4. Wo liegt die AAB?

```
android/app/build/outputs/bundle/release/app-release.aab
```

Diese Datei in der [Google Play Console](https://play.google.com/console) zuerst unter **interner Test** oder **Closed Testing** hochladen (nicht direkt Produktion).

## 5. Store-Listing (Copy zum Einfügen)

**Datenschutz-URL:** https://ultraplaner.com/datenschutz/

**App-Kategorie:** Gesundheit und Fitness (oder Maps & Navigation)

**Grafiken**
- Hochauflösendes Icon: `scripts/assets/play-store-icon-512.png`
- Feature Graphic: `scripts/assets/play-feature-graphic-1024x500.png`
- Screenshots: mind. 2 Handy-Screens (9:16), z. B. Start (GPX), Karte mit POIs — am Gerät oder Emulator aufnehmen, nachdem die App einmal mit aktuellem Bundle läuft.

### DE — Kurzbeschreibung (max. 80 Zeichen)

```
Ultracycling-Routen mit Versorgung, ETA und Spickzettel planen.
```

### DE — Vollbeschreibung

```
UltraPlaner ist eine kostenlose App für Ultracycling: GPX laden, Route zeichnen oder Umgebung scannen — Versorgungspunkte entlang der Strecke, Kontrollpunkte, Höhenprofil, ETA mit Öffnungszeiten und Export zu Wahoo, Garmin oder COROS.

• Tankstellen, Supermärkte, Trinkwasser, Gastro und mehr aus OpenStreetMap
• Filter nach Radius und „offen zur ETA“
• Favoriten und Kontrollpunkte (CP/Sleep)
• Höhenprofil mit Versorgungslücken
• Wetter entlang der geplanten Ankunft
• Export: Wahoo-Cloud, GPX, FIT/Course Points, Spickzettel, QR aufs Handy

Standort wird nur genutzt, wenn du Fahrt oder den Fahrtmodus startest — kein Bewegungsprofil, keine Werbung. Daten: OpenStreetMap / Geofabrik.

Web: https://ultraplaner.com
```

### EN — Short description

```
Plan ultracycling routes with supply points, ETA and a cheat sheet.
```

### EN — Full description

```
UltraPlaner is a free app for ultracycling: load GPX, draw a route or scan nearby — supply points along the track, control points, elevation, ETA with opening hours, and export to Wahoo, Garmin or COROS.

• Fuel, shops, drinking water, food and more from OpenStreetMap
• Radius and “open at ETA” filters
• Favourites and control points (CP/Sleep)
• Elevation profile with supply gaps
• Weather along your planned arrival
• Export: Wahoo cloud, GPX, FIT/course points, cheat sheet, QR to your phone

Location is used only when you start Ride or ride mode — no movement profile, no ads. Data: OpenStreetMap / Geofabrik.

Web: https://ultraplaner.com
```

## 6. Datensicherheit (Play Console)

Zum Abhaken in der Console, passend zur Datenschutzerklärung:

- **Werbung / Tracking:** nein. Kein Ads-SDK, Advertising-ID ist im Manifest entfernt (`AD_ID` `tools:node="remove"`)
- **Standort ungefähr + genau:** erhoben, **nicht** geteilt, Zweck App-Funktion (Umgebung / Fahrt / Fahrtmodus). Optional (Permission). Nicht im Hintergrund
- **App-Aktivität:** anonyme Sitzungszählung nach grobem Seitentyp (Start/Karte), siehe Datenschutz — nicht werblich
- **Konten:** keine UltraPlaner-Anmeldung. Wahoo-Tokens nur lokal, wenn der Nutzer Cloud-Export verbindet
- **Datenverkauf / Datenweitergabe an Dritte zu Werbung:** nein
- **Sicherheitspraktiken:** Daten verschlüsselt in Übertragung (HTTPS). Nutzer können Standort verweigern

**Datenschutz-URL in der Console:** https://ultraplaner.com/datenschutz/

**Support-Kontakt:** dieselbe E-Mail wie im Impressum (https://ultraplaner.com/impressum/)

## 7. Was noch lokal / in der Play Console bleibt

Das Repo liefert Hülle, Branding und Listing-Copy. Einreichen kannst du erst, wenn diese Punkte bei dir liegen:

1. **Upload-Keystore** einmalig anlegen (`android/upload-keystore.jks` + `android/keystore.properties`) — nie committen
2. **AAB bauen:** `npm run android:bundle` → `android/app/build/outputs/bundle/release/app-release.aab`
3. **Handy-Screenshots** (Play verlangt mind. 2, 9:16, JPEG/PNG ohne Alpha): Emulator oder Gerät nach `npm run android`, z. B. Start (GPX) und Karte mit POIs. Web-Desktop-Shots nimmt Play nicht
4. Play Console: App `com.ultraplaner.app` anlegen, **interner Test** oder Closed Testing zuerst, Content-Rating, Zielgruppe, Datensicherheit, Store-Listing (Copy + Icon + Feature Graphic aus Abschnitt 5)
5. Content-Rating: Fitness / Navigation, keine UGC-Feeds, keine In-App-Käufe, keine Werbung
