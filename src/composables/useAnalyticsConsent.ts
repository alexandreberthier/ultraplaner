import { computed, ref } from 'vue'
import { initFirebaseAnalytics } from '../firebase'

export type AnalyticsConsent = 'granted' | 'denied'

export const ANALYTICS_CONSENT_KEY = 'ultraplaner-analytics-consent'

const consent = ref<AnalyticsConsent | null>(null)
const ready = ref(false)

function readStored(): AnalyticsConsent | null {
  try {
    const raw = localStorage.getItem(ANALYTICS_CONSENT_KEY)
    if (raw === 'granted' || raw === 'denied') return raw
  } catch {
    /* ignore */
  }
  return null
}

function persist(next: AnalyticsConsent) {
  consent.value = next
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, next)
  } catch {
    /* ignore */
  }
}

export function initAnalyticsConsent() {
  if (typeof window === 'undefined') return
  const stored = readStored()
  consent.value = stored
  ready.value = true
  if (stored === 'granted') void initFirebaseAnalytics()
}

export function useAnalyticsConsent() {
  const needsPrompt = computed(() => ready.value && consent.value === null)
  const isGranted = computed(() => consent.value === 'granted')

  function accept() {
    persist('granted')
    void initFirebaseAnalytics()
  }

  function decline() {
    persist('denied')
  }

  return { consent, ready, needsPrompt, isGranted, accept, decline }
}
