import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Poi, PoiCategory, RouteCursor, RoutePoint } from '../../shared/types'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
} from '../config/poiCategories'
import { getDb, isFirebaseConfigured } from '../firebase'
import { isSupabaseConfigured } from '../supabase'
import { fetchPoisForRoute, loadMap, saveMap } from '../services/maps'
import {
  routePointsFromGpx,
  simplifyCoords,
  validateDachRoute,
  validateGpxFile,
} from '../services/gpx'
import { totalRouteKm } from '../utils/route'
import { thinPoisForMap } from '../utils/poiThin'

export type AppMode = 'landing' | 'loading' | 'map'

const LOAD_TIMEOUT_MS = 30_000

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
  const poiMap = ref(new Map<string, Poi>())
  const favorites = ref(new Set<string>())
  const selectedPoi = ref<Poi | null>(null)
  const routeCursor = ref<RouteCursor | null>(null)
  const showPoiList = ref(false)

  let loadTimer: ReturnType<typeof setInterval> | null = null

  const displayPois = computed(() =>
    Array.from(poiMap.value.values()).sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  )

  const mapPois = computed(() => thinPoisForMap(displayPois.value))

  const totalKm = computed(() => totalRouteKm(routePoints.value))

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

  function resetState() {
    mapReady.value = false
    poiMap.value.clear()
    routeCoords.value = []
    routePoints.value = []
    savedMapId.value = null
    selectedPoi.value = null
    routeCursor.value = null
    favorites.value = new Set()
    error.value = ''
  }

  async function createMapFromGpx(
    file: File,
    radiusM: number,
    categories: PoiCategory[]
  ) {
    resetState()
    mode.value = 'loading'
    loadStatus.value = 'Route wird verarbeitet…'
    startLoadTimer()

    const timeout = setTimeout(() => {
      if (!mapReady.value) {
        error.value =
          'Zeitüberschreitung (> 30 s) — bitte Verbindung prüfen oder später erneut versuchen'
      }
    }, LOAD_TIMEOUT_MS)

    try {
      const t0 = performance.now()
      const text = await file.text()
      validateGpxFile(file, text)

      const { points, coordinates, name } = routePointsFromGpx(text)
      validateDachRoute(coordinates)

      const gpxMs = performance.now() - t0
      console.info(`[perf] gpx=${Math.round(gpxMs)}ms points=${points.length}`)

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

      mapReady.value = true
      mode.value = 'map'
      loadStatus.value = ''

      void persistMapInBackground()
    } catch (err) {
      mapReady.value = false
      mode.value = 'landing'
      loadStatus.value = ''
      error.value = err instanceof Error ? err.message : 'GPX konnte nicht geladen werden'
    } finally {
      clearTimeout(timeout)
      stopLoadTimer()
    }
  }

  async function persistMapInBackground() {
    if (!isFirebaseConfigured()) return
    try {
      const id = await saveMap(getDb(), {
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
      if (!isFirebaseConfigured()) {
        throw new Error('Firebase nicht konfiguriert')
      }

      const t0 = performance.now()
      const record = await loadMap(getDb(), id)
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

  function selectPoi(poi: Poi) {
    selectedPoi.value = poi
  }

  function closePoiDetail() {
    selectedPoi.value = null
  }

  function toggleFavorite(poiId: string) {
    if (favorites.value.has(poiId)) {
      favorites.value.delete(poiId)
    } else {
      favorites.value.add(poiId)
    }
    favorites.value = new Set(favorites.value)
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
    poiMap,
    favorites,
    selectedPoi,
    routeCursor,
    showPoiList,
    displayPois,
    mapPois,
    totalKm,
    createMapFromGpx,
    loadSavedMap,
    selectPoi,
    closePoiDetail,
    toggleFavorite,
    backToLanding,
    clearError,
  }
})
