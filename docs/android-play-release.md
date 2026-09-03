# Android Play Release (AAB)

Kurz: Release-Keystore lokal anlegen, `keystore.properties` füllen, dann `npm run android:bundle`.

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

Das synct die Web-App nach Android und führt `bundleRelease` über den Gradle-Wrapper aus (Windows: `gradlew.bat`, sonst `./gradlew`).

## 4. Wo liegt die AAB?

```
android/app/build/outputs/bundle/release/app-release.aab
```

Diese Datei in der [Google Play Console](https://play.google.com/console) unter dem Release-Track hochladen.
