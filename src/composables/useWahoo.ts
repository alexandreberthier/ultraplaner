import { computed, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { tGlobal } from '../i18n'
import {
  beginWahooConnect,
  clearWahooTokens,
  isWahooConnected,
  wahooConfigured,
} from '../services/wahooAuth'
import { routeElevationStats, uploadWahooRoute } from '../services/wahooRoutes'

const connected = ref(false)
const busy = ref(false)
const lastError = ref('')

function syncConnected() {
  connected.value = isWahooConnected()
}

function externalIdForMap(savedMapId: string | null, routeName: string, totalKm: number): string {
  // Suffix "-m" = distance sent in metres (fixes older uploads that stored km as metres).
  if (savedMapId) return `up-${savedMapId}-m`
  const slug = routeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  return `up-local-${slug || 'route'}-${Math.round(totalKm * 10)}-m`
}

export function useWahoo() {
  syncConnected()

  const store = useMapStore()
  const configured = computed(() => wahooConfigured())

  async function connect() {
    lastError.value = ''
    if (!configured.value) {
      lastError.value = tGlobal('wahoo.notConfigured')
      alert(lastError.value)
      return
    }
    busy.value = true
    try {
      await beginWahooConnect()
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      alert(tGlobal('wahoo.connectFailed'))
      busy.value = false
    }
  }

  function disconnect() {
    clearWahooTokens()
    connected.value = false
    lastError.value = ''
  }

  async function sendRoute() {
    syncConnected()
    lastError.value = ''
    if (!configured.value) {
      lastError.value = tGlobal('wahoo.notConfigured')
      alert(lastError.value)
      return
    }
    if (!connected.value) {
      await connect()
      return
    }
    if (store.routePoints.length < 2) {
      alert(tGlobal('wahoo.needRoute'))
      return
    }
    if (store.exportStops.length === 0) {
      alert(tGlobal('export.noFavorites'))
      return
    }

    busy.value = true
    try {
      const { buildFitCourseExport, MAX_FIT_COURSE_POINTS } = await import('../services/fitCourse')
      const name =
        store.routeName
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 48) || 'Route'
      const pois = store.exportStops.map(({ label: _l, note: _n, ...poi }) => poi)
      if (pois.length > MAX_FIT_COURSE_POINTS) {
        alert(tGlobal('export.fitPointLimit', { max: MAX_FIT_COURSE_POINTS, count: pois.length }))
      }
      const fitBytes = buildFitCourseExport(name, store.routePoints, pois)
      const { ascentM, descentM } = routeElevationStats(store.routePoints)
      // distanceFromStart is km (same as totalKm); Wahoo expects metres
      const distanceM = Math.round(store.totalKm * 1000)

      await uploadWahooRoute({
        name,
        description: 'UltraPlaner',
        externalId: externalIdForMap(store.savedMapId, name, store.totalKm),
        fitBytes,
        routePoints: store.routePoints,
        distanceM,
        ascentM,
        descentM,
      })
      const kmLabel = (distanceM / 1000).toFixed(1)
      alert(tGlobal('wahoo.sendOk', { km: kmLabel }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      if (/401|not connected|token/i.test(msg)) {
        clearWahooTokens()
        connected.value = false
        alert(tGlobal('wahoo.sessionExpired'))
      } else {
        alert(tGlobal('wahoo.sendFailed'))
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
