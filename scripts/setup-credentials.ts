import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const pathFile = resolve('.credentials-path')

const candidates = [
  join(homedir(), 'Downloads', 'ultracycling-8bd56-firebase-adminsdk-fbsvc-4cdacb4fc6.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  resolve('service-account.json'),
].filter((p): p is string => !!p && existsSync(p))

if (!candidates.length) {
  console.error(
    'Keine Service-Account-Datei gefunden.\n' +
      'Firebase Console → Projekteinstellungen → Dienstkonten → JSON herunterladen,\n' +
      'dann erneut: npm run setup-credentials'
  )
  process.exit(1)
}

writeFileSync(pathFile, candidates[0] + '\n', 'utf8')
console.log(`Credentials-Pfad gespeichert in .credentials-path`)
console.log(`  → ${candidates[0]}`)
console.log('import-status und import-dach-pois funktionieren jetzt ohne $env:…')
