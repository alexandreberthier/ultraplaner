import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Poi, PoiCategory, RouteCursor, RoutePoint } from '../../shared/types'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { isSupabaseConfigured } from '../supabase'
import { fetchPoisForRoute, loadMap, saveMap } from '../services/maps'
import {
  routePointsFromGpx,
  simplifyCoords,
  validateSupportedRoute,
  validateGpxFile,
} from '../services/gpx'
import { buildRoutePoints, totalRouteKm } from '../utils/route'
import { thinPoisForMap } from '../utils/poiThin'
import { MAX_ROUTE_KM } from '../config/poiCategories'
import {
  DEFAULT_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
  MIN_AVG_SPEED_KMH,
  defaultStartTimeHHmm,
  etaAtKm,
} from '../utils/eta'

export type AppMode = 'landing' | 'loading' | 'map'

const LOAD_TIMEOUT_MS = 30_000
const ETA_SPEED_KEY = 'onroute-avg-speed'
const ETA_START_KEY = 'onroute-start-time'

function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(ETA_SPEED_KEY))
    if (Number.isFinite(v) && v >= MIN_AVG_SPEED_KMH && v <= MAX_AVG_SPEED_KMH) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_AVG_SPEED_KMH
}

function loadStartTime(): string {
  try {
    const v = localStorage.getItem(ETA_START_KEY)
    if (v && /^\d{1,2}:\d{2}$/.test(v)) return v
  } catch {
    /* ignore */
  }
  return defaultStartTimeHHmm()
}

const SUPPORTED_POI_CATEGORIES = new Set(POI_CATEGORY_DEFS.map((c) => c.id))

export const useMapStore = defineStore('map', () => {
  const mode = ref<AppMode>('landing')
  const mapReady = ref(false)
  const loadStatus = ref('')
  const loadSeconds = ref(0)
  const error = ref('')
  const savedMapId = ref<string | null>(null)

  const routeName = ref('Keine Route')
  const routeCoords = ref<[number, number][]>([])
  const routePoints = ref<RoutePoint[]>([])
  const poiRadiusM = ref(DEFAULT_POI_RADIUS_M)
  const activeCategories = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
  const visibleCategories = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
  const poiMap = ref(new Map<string, Poi>())
  const favorites = ref(new Set<string>())
  const selectedPoi = ref<Poi | null>(null)
  const poiFocusTick = ref(0)
  const poiFocusCoords = ref<[number, number] | null>(null)
  const routeCursor = ref<RouteCursor | null>(null)
  const showPoiList = ref(false)
  const avgSpeedKmh = ref(loadSpeed())
  const startTimeHHmm = ref(loadStartTime())

  let loadTimer: ReturnType<typeof setInterval> | null = null

  const allPois = computed(() =>
    Array.from(poiMap.value.values()).sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  )

  const displayPois = computed(() =>
    allPois.value.filter(
      (p) =>
        SUPPORTED_POI_CATEGORIES.has(p.category) &&
        visibleCategories.value.includes(p.category)
    )
  )

  const favoritePois = computed(() =>
    allPois.value.filter(
      (p) => favorites.value.has(p.id) && SUPPORTED_POI_CATEGORIES.has(p.category)
    )
  )

  const categoryCounts = computed(() => {
    const counts = new Map<PoiCategory, number>()
    for (const p of poiMap.value.values()) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    }
    return counts
  })

  const mapPois = computed(() => thinPoisForMap(displayPois.value))

  const totalKm = computed(() => totalRouteKm(routePoints.value))

  function setAvgSpeedKmh(speed: number) {
    const clamped = Math.min(MAX_AVG_SPEED_KMH, Math.max(MIN_AVG_SPEED_KMH, Math.round(speed)))
    avgSpeedKmh.value = clamped
    try {
      localStorage.setItem(ETA_SPEED_KEY, String(clamped))
    } catch {
      /* ignore */
    }
  }

  function setStartTimeHHmm(value: string) {
    startTimeHHmm.value = value
    try {
      localStorage.setItem(ETA_START_KEY, value)
    } catch {
      /* ignore */
    }
  }

  function etaAtRouteKm(km: number) {
    return etaAtKm(km, avgSpeedKmh.value, startTimeHHmm.value)
  }

  function startLoadTimer() {
    loadSeconds.value = 0
    if (loadTimer) clearInterval(loadTimer)
    loadTimer = setInterval(() => {
      loadSeconds.value++
    }, 1000)
  }

  function stopLoadTimer() {
    if (loadTimer) {
      clearInterval(loadTimer)
      loadTimer = null
    }
  }

  function syncVisibleCategories() {
    const cats = new Set<PoiCategory>()
    for (const p of poiMap.value.values()) {
      cats.add(p.category)
    }
    visibleCategories.value = cats.size > 0 ? Array.from(cats) : [...activeCategories.value]
  }

  function resetState() {
    mapReady.value = false
    poiMap.value.clear()
    routeCoords.value = []
    routePoints.value = []
    savedMapId.value = null
    selectedPoi.value = null
    routeCursor.value = null
    favorites.value = new Set()
    visibleCategories.value = [...DEFAULT_POI_CATEGORIES]
    error.value = ''
  }

  async function loadPoisForCoordinates(
    name: string,
    coordinates: [number, number][],
    radiusM: number,
    categories: PoiCategory[],
    elevations?: number[]
  ) {
    validateSupportedRoute(coordinates)
    const points = buildRoutePoints(coordinates, elevations)
    const km = totalRouteKm(points)
    if (km > MAX_ROUTE_KM) {
      throw new Error(`Route zu lang (max. ${MAX_ROUTE_KM} km, ist ${Math.round(km)} km)`)
    }

    routeName.value = name
    routePoints.value = points
    routeCoords.value = simplifyCoords(coordinates)
    poiRadiusM.value = radiusM
    activeCategories.value = categories

    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase nicht konfiguriert — bitte .env mit VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY anlegen'
      )
    }

    loadStatus.value = 'Versorgungspunkte werden geladen…'
    const { pois } = await fetchPoisForRoute(coordinates, points, radiusM, categories)

    for (const p of pois) {
      poiMap.value.set(p.id, p)
    }
    syncVisibleCategories()

    mapReady.value = true
    mode.value = 'map'
    loadStatus.value = ''

    void persistMapInBackground()
  }

  async function runMapLoad(
    status: string,
    loader: () => Promise<void>,
    fallbackError: string
  ) {
    resetState()
    mode.value = 'loading'
    loadStatus.value = status
    startLoadTimer()

    const timeout = setTimeout(() => {
      if (!mapReady.value) {
        error.value =
          'Zeitüberschreitung (> 30 s) — bitte Verbindung prüfen oder später erneut versuchen'
      }
    }, LOAD_TIMEOUT_MS)

    try {
      await loader()
    } catch (err) {
      mapReady.value = false
      mode.value = 'landing'
      loadStatus.value = ''
      error.value = err instanceof Error ? err.message : fallbackError
    } finally {
      clearTimeout(timeout)
      stopLoadTimer()
    }
  }

  async function createMapFromGpx(
    file: File,
    radiusM: number,
    categories: PoiCategory[]
  ) {
    await runMapLoad('Route wird verarbeitet…', async () => {
      const t0 = performance.now()
      const text = await file.text()
      validateGpxFile(file, text)

      const { coordinates, elevations, name } = routePointsFromGpx(text)
      const gpxMs = performance.now() - t0
      console.info(`[perf] gpx=${Math.round(gpxMs)}ms points=${coordinates.length}`)

      await loadPoisForCoordinates(name, coordinates, radiusM, categories, elevations)
    }, 'GPX konnte nicht geladen werden')
  }

  async function createMapFromRoute(
    name: string,
    coordinates: [number, number][],
    radiusM: number,
    categories: PoiCategory[],
    elevations?: number[]
  ) {
    if (coordinates.length < 2) {
      throw new Error('Route hat zu wenige Punkte')
    }

    await runMapLoad('Versorgungspunkte werden geladen…', async () => {
      await loadPoisForCoordinates(name, coordinates, radiusM, categories, elevations)
    }, 'Karte konnte nicht erstellt werden')
  }

  async function persistMapInBackground() {
    if (!isSupabaseConfigured()) return
    try {
      const id = await saveMap({
        name: routeName.value,
        routeCoords: routeCoords.value,
        routePoints: routePoints.value,
        poiRadiusM: poiRadiusM.value,
        categories: activeCategories.value,
        pois: displayPois.value,
        favorites: Array.from(favorites.value),
      })
      savedMapId.value = id
    } catch (err) {
      console.warn('[maps] Speichern fehlgeschlagen:', err)
    }
  }

  async function loadSavedMap(id: string) {
    resetState()
    mode.value = 'loading'
    loadStatus.value = 'Karte wird geladen…'
    startLoadTimer()

    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase nicht konfiguriert')
      }

      const t0 = performance.now()
      const record = await loadMap(id)
      if (!record) throw new Error('Karte nicht gefunden')

      routeName.value = record.name
      routeCoords.value = record.routeCoords
      routePoints.value = record.routePoints
      poiRadiusM.value = record.poiRadiusM
      activeCategories.value = record.categories
      savedMapId.value = record.id
      favorites.value = new Set(record.favorites)

      poiMap.value.clear()
      for (const p of record.pois) {
        poiMap.value.set(p.id, p)
      }
      syncVisibleCategories()

      const loadMs = performance.now() - t0
      console.info(`[perf] share-load=${Math.round(loadMs)}ms pois=${record.pois.length}`)

      mapReady.value = true
      mode.value = 'map'
      loadStatus.value = ''
    } catch (err) {
      mapReady.value = false
      mode.value = 'landing'
      loadStatus.value = ''
      error.value = err instanceof Error ? err.message : 'Laden fehlgeschlagen'
    } finally {
      stopLoadTimer()
    }
  }

  function selectPoi(poi: Poi, focus = false) {
    selectedPoi.value = poi
    if (focus) {
      poiFocusCoords.value = [poi.lng, poi.lat]
      poiFocusTick.value++
    }
  }

  function closePoiDetail() {
    selectedPoi.value = null
  }

  function toggleCategoryVisibility(category: PoiCategory) {
    const set = new Set(visibleCategories.value)
    if (set.has(category)) {
      if (set.size <= 1) return
      set.delete(category)
    } else {
      set.add(category)
    }
    visibleCategories.value = Array.from(set)
  }

  function removeFavorite(poiId: string) {
    if (!favorites.value.has(poiId)) return
    toggleFavorite(poiId)
  }

  let favSaveTimer: ReturnType<typeof setTimeout> | null = null

  function toggleFavorite(poiId: string) {
    if (favorites.value.has(poiId)) {
      favorites.value.delete(poiId)
    } else {
      favorites.value.add(poiId)
    }
    favorites.value = new Set(favorites.value)

    if (!isSupabaseConfigured()) return
    if (favSaveTimer) clearTimeout(favSaveTimer)
    favSaveTimer = setTimeout(() => {
      void persistFavoritesUpdate()
    }, 1500)
  }

  async function persistFavoritesUpdate() {
    if (!savedMapId.value || !isSupabaseConfigured()) return
    try {
      const { getSupabase } = await import('../supabase')
      const sb = getSupabase()
      const { error } = await sb
        .from('maps')
        .update({
          payload: {
            routeCoords: routeCoords.value,
            routePoints: routePoints.value,
            poiRadiusM: poiRadiusM.value,
            categories: activeCategories.value,
            pois: displayPois.value,
            favorites: Array.from(favorites.value),
          },
        })
        .eq('id', savedMapId.value)
      if (error) console.warn('[maps] Favoriten-Speichern fehlgeschlagen:', error.message)
    } catch (err) {
      console.warn('[maps] Favoriten-Speichern fehlgeschlagen:', err)
    }
  }
  function backToLanding() {
    stopLoadTimer()
    resetState()
    mode.value = 'landing'
    loadStatus.value = ''
  }

  function clearError() {
    error.value = ''
  }

  return {
    mode,
    mapReady,
    loadStatus,
    loadSeconds,
    error,
    savedMapId,
    routeName,
    routeCoords,
    routePoints,
    poiRadiusM,
    activeCategories,
    visibleCategories,
    poiMap,
    favorites,
    selectedPoi,
    poiFocusTick,
    poiFocusCoords,
    routeCursor,
    showPoiList,
    allPois,
    displayPois,
    favoritePois,
    categoryCounts,
    mapPois,
    totalKm,
    avgSpeedKmh,
    startTimeHHmm,
    setAvgSpeedKmh,
    setStartTimeHHmm,
    etaAtRouteKm,
    createMapFromGpx,
    createMapFromRoute,
    loadSavedMap,
    selectPoi,
    closePoiDetail,
    toggleFavorite,
    removeFavorite,
    toggleCategoryVisibility,
    backToLanding,
    clearError,
  }
})
