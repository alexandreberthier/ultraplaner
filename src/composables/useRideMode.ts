import { ref } from 'vue'

const RIDE_KEY = 'ultraplaner-ride-mode'

/** Drop legacy sticky flag so chrome (toolbar/export) stays visible after reload. */
function clearPersistedRideMode() {
  try {
    localStorage.removeItem(RIDE_KEY)
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  clearPersistedRideMode()
}

const rideMode = ref(false)

/**
 * Mobile ride / cockpit mode — max map, min chrome.
 * Not persisted: a stuck “on” hid toolbar, export, elevation and mobile nav.
 */
export function useRideMode() {
  function setRideMode(on: boolean) {
    rideMode.value = on
  }

  function toggleRideMode() {
    setRideMode(!rideMode.value)
  }

  return { rideMode, setRideMode, toggleRideMode }
}
