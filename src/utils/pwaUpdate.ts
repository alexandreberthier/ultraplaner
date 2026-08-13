import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/** Brief non-blocking toast before forced reload. */
export const pwaUpdating = ref(false)

const UPDATE_CHECK_MS = 60_000

let refreshing = false
let started = false

function reloadForNewSw() {
  if (refreshing) return
  refreshing = true
  window.location.reload()
}

/**
 * Force-fetch SW updates on boot / tab focus and activate immediately.
 * Complements registerType: 'autoUpdate' + workbox skipWaiting/clientsClaim.
 */
export function initPwaUpdates() {
  if (started || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  started = true

  // Reload only on *updates* (page already had a controller), not first SW install
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      reloadForNewSw()
      return
    }
    hadController = true
  })

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pwaUpdating.value = true
      // Activate waiting worker now (autoUpdate path); controllerchange reloads
      void updateSW(true)
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        void registration.update().catch(() => {
          /* offline / blocked — ignore */
        })
      }

      checkForUpdate()
      window.setInterval(checkForUpdate, UPDATE_CHECK_MS)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)

      // Already waiting from a prior install before this page ran
      if (registration.waiting) {
        pwaUpdating.value = true
        void updateSW(true)
      }
    },
  })
}
