import { computed, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { tGlobal } from '../i18n'
import {
  beginGarminConnect,
  clearGarminTokens,
  deregisterGarminUser,
  garminConfigured,
  isGarminConnected,
} from '../services/garminAuth'
import { uploadGarminCourse } from '../services/garminCourses'

const connected = ref(false)
const busy = ref(false)
const lastError = ref('')

function syncConnected() {
  connected.value = isGarminConnected()
}

export function useGarmin() {
  syncConnected()

  const store = useMapStore()
  const configured = computed(() => garminConfigured())

  async function connect() {
    lastError.value = ''
    if (!configured.value) {
      lastError.value = tGlobal('garmin.notConfigured')
      alert(lastError.value)
      return
    }
    busy.value = true
    try {
      await beginGarminConnect()
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      alert(tGlobal('garmin.connectFailed'))
      busy.value = false
    }
  }

  async function disconnect() {
    busy.value = true
    try {
      await deregisterGarminUser()
    } catch {
      clearGarminTokens()
    } finally {
      connected.value = false
      busy.value = false
      lastError.value = ''
    }
  }

  async function sendRoute() {
    syncConnected()
    lastError.value = ''
    if (!configured.value) {
      lastError.value = tGlobal('garmin.notConfigured')
      alert(lastError.value)
      return
    }
    if (!connected.value) {
      await connect()
      return
    }
    if (store.routePoints.length < 2) {
      alert(tGlobal('garmin.needRoute'))
      return
    }

    busy.value = true
    try {
      const name =
        store.routeName
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 48) || 'Route'
      const pois = store.exportStops.map(({ label: _l, note: _n, ...poi }) => poi)
      await uploadGarminCourse({
        name,
        description: 'UltraPlaner',
        routePoints: store.routePoints,
        waypoints: pois,
      })
      alert(tGlobal('garmin.sendOk', { km: store.totalKm.toFixed(1) }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      if (/401|not connected|token/i.test(msg)) {
        clearGarminTokens()
        connected.value = false
        alert(tGlobal('garmin.sessionExpired'))
      } else if (/412/.test(msg)) {
        alert(tGlobal('garmin.permissionDenied'))
      } else {
        alert(tGlobal('garmin.sendFailed'))
      }
    } finally {
      busy.value = false
    }
  }

  return {
    configured,
    connected,
    busy,
    lastError,
    connect,
    disconnect,
    sendRoute,
  }
}
