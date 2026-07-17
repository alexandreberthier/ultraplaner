import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let db: Firestore | null = null
let persistenceEnabled = false

export function getDb(): Firestore {
  if (!db) {
    const app = initializeApp(firebaseConfig)
    db = getFirestore(app)
  }
  return db
}

export async function initFirestorePersistence(): Promise<void> {
  if (persistenceEnabled) return
  try {
    await enableIndexedDbPersistence(getDb())
    persistenceEnabled = true
    console.info('[firebase] IndexedDB-Persistenz aktiviert')
  } catch (err) {
    console.warn('[firebase] Persistenz nicht verfügbar:', err)
  }
}

export function isFirebaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID)
}
