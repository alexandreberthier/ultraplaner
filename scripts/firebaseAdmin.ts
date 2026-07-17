import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const CREDENTIALS_PATH_FILE = '.credentials-path'

function resolveCredentialsPath(): string {
  const candidates: string[] = []

  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (fromEnv) candidates.push(fromEnv)

  const pathFile = resolve(CREDENTIALS_PATH_FILE)
  if (existsSync(pathFile)) {
    const fromFile = readFileSync(pathFile, 'utf8').trim()
    if (fromFile) candidates.push(fromFile)
  }

  candidates.push(
    resolve('service-account.json'),
    join(homedir(), 'Downloads', 'ultracycling-8bd56-firebase-adminsdk-fbsvc-4cdacb4fc6.json')
  )

  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (existsSync(path)) return path
  }

  throw new Error(
    'Service Account nicht gefunden.\n\n' +
      'Einmalig einrichten:\n' +
      '  npm run setup-credentials\n\n' +
      'Oder PowerShell (nur diese Sitzung):\n' +
      '  $env:GOOGLE_APPLICATION_CREDENTIALS="Pfad\\zur\\service-account.json"'
  )
}

export function initAdminDb(): Firestore {
  if (getApps().length) return getFirestore()

  const credPath = resolveCredentialsPath()
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
  const app: App = initializeApp({ credential: cert(serviceAccount) })
  return getFirestore(app)
}
