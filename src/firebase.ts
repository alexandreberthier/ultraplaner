import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let analytics: Analytics | null = null

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  }
  return db
}

export function isFirebaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID)
}

/** Analytics only in the browser when supported and after consent (not during prerender). */
export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (analytics) return analytics
  if (typeof window === 'undefined') return null
  if (!isFirebaseConfigured() || !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null
  if (!(await isSupported())) return null

  analytics = getAnalytics(getFirebaseApp())
  return analytics
}
