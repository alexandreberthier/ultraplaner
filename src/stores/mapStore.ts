import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ControlPoint,
  ControlPointKind,
  FavoriteMeta,
  Poi,
  PoiCategory,
  RouteCursor,
  RoutePoint,
  RouteSurfaceSummary,
} from '../../shared/types'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  NEARBY_DEFAULT_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { isSupabaseConfigured } from '../supabase'
import { fetchPoisForRoute, loadMap, saveMap, updateMapPayload } from '../services/maps'
import { nearestPointOnRoute } from '../services/poiFilter'
import { putOfflineMap } from '../services/offlineMaps'
import { getMapWriteToken } from '../services/mapWriteToken'
import {
  routePointsFromGpx,
  simplifyCoords,
  validateSupportedRoute,
  validateGpxFile,
  type GpxWaypointImport,
} from '../services/gpx'
import { buildRoutePoints, totalRouteKm } from '../utils/route'
import { haversineM } from '../services/geo'
import { thinPoisForMap } from '../utils/poiThin'
import { tileIdsAlongRoute } from '../services/poiQuery'
import { hasAnyCachedPoiTile } from '../services/offlinePacks'
import { normalizePoiCategory, expandLegacyCategories } from '../utils/poiNormalize'
import {
  defaultControlPointName,
  newControlPointId,
  placeOnRoute,
} from '../utils/controlPoints'
import { MAX_ROUTE_KM } from '../config/poiCategories'
import {
  DEFAULT_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
  MIN_AVG_SPEED_KMH,
  defaultStartTimeHHmm,
  etaAtKm,
} from '../utils/eta'
import {
  DEFAULT_ETA_HOURS_BUFFER_MIN,
  openStatusAtEta,
  type OpenStatus,
} from '../utils/openingHours'
import { tGlobal } from '../i18n'

export type AppMode = 'landing' | 'loading' | 'map'

const LOAD_TIMEOUT_MS = 30_000
const ETA_SPEED_KEY = 'onroute-avg-speed'
const ETA_START_KEY = 'onroute-start-time'
const ETA_FILTER_OPEN_KEY = 'onroute-filter-open-eta'
const ETA_BUFFER_KEY = 'onroute-eta-buffer-min'
const ETA_BUFFER_OPTIONS = [0, 15, 30] as const

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

function loadHideClosedAtEta(): boolean {
  try {
    return localStorage.getItem(ETA_FILTER_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function loadEtaBufferMinutes(): number {
  try {
    const v = Number(localStorage.getItem(ETA_BUFFER_KEY))
    if (ETA_BUFFER_OPTIONS.includes(v as (typeof ETA_BUFFER_OPTIONS)[number])) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_ETA_HOURS_BUFFER_MIN
}

const SUPPORTED_POI_CATEGORIES = new Set(POI_CATEGORY_DEFS.map((c) => c.id))

export const useMapStore = defineStore('map', () => {
  const mode = ref<AppMode>('landing')
  const mapReady = ref(false)
  /** Bumps on every successful map prepare — forces MapCanvas remount (WebGL). */
  const mapEpoch = ref(0)
  const loadStatus = ref('')
  /** 0–100 while mode === 'loading'; null when idle. */
  const loadProgress = ref<number | null>(null)
  const loadSeconds = ref(0)
  const error = ref('')
  const savedMapId = ref<string | null>(null)
  /** True if current map was restored from IndexedDB (offline/cache). */
  const loadedFromCache = ref(false)
  /** User-visible warning when online persist failed (share / recent maps). */
  const persistWarning = ref('')
  let loadGeneration = 0

  const routeName = ref('Keine Route')
  const routeCoords = ref<[number, number][]>([])
  const routePoints = ref<RoutePoint[]>([])
  /** ORS surface buckets for drawn routes; null for GPX / nearby. */
  const surfaceSummary = ref<RouteSurfaceSummary | null>(null)
  /** True when map was created from a single GPS point (Umgebung). */
  const isNearbyMap = ref(false)
  /** Soft POI fetch while nearby map is already visible. */
  const poisLoading = ref(false)
  /** MapCanvas should start GPS follow after nearby map opens (permission just granted). */
  const locationFollowRequested = ref(false)
  const poiRadiusM = ref(DEFAULT_POI_RADIUS_M)
  const activeCategories = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
  const visibleCategories = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
  const poiMap = ref(new Map<string, Poi>())
  const favorites = ref(new Set<string>())
  const favoriteMeta = ref(new Map<string, FavoriteMeta>())
  const controlPoints = ref<ControlPoint[]>([])
  /** When set, next map click places a control point of this kind. */
  const controlPointPlaceKind = ref<ControlPointKind | null>(null)
  const selectedPoi = ref<Poi | null>(null)
  const poiFocusTick = ref(0)
  const poiFocusCoords = ref<[number, number] | null>(null)
  const routeCursor = ref<RouteCursor | null>(null)
  const showPoiList = ref(false)
  const avgSpeedKmh = ref(loadSpeed())
  const startTimeHHmm = ref(loadStartTime())
  const hideClosedAtEta = ref(loadHideClosedAtEta())
  const etaHoursBufferMinutes = ref(loadEtaBufferMinutes())
  const showAllPoisOnMap = ref(false)
  /** After GPS enrich on a route map: keep GPS-near POIs visible despite route thinning. */
  const gpsEnrichFocus = ref<{ lat: number; lng: number; radiusM: number } | null>(null)
  const gpsFocusTick = ref(0)
  /** Bumped after POI set mutations so MapCanvas refreshes GeoJSON without map remount. */
  const poisEpoch = ref(0)

  let loadTimer: ReturnType<typeof setInterval> | null = null

  const allPois = computed(() =>
    Array.from(poiMap.value.values()).sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  )

  const categoryFilteredPois = computed(() =>
    allPois.value.filter(
      (p) =>
        SUPPORTED_POI_CATEGORIES.has(p.category) &&
        visibleCategories.value.includes(p.category)
    )
  )

  function poiOpenStatusAtEta(poi: Poi, forFilter = false): OpenStatus {
    // Nearby maps have no route ETA — evaluate "open now" instead of fake distance-based ETA.
    if (isNearbyMap.value) {
      return openStatusAtEta(poi, new Date(), { bufferMinutes: 0 })
    }
    const eta = etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
    if (!eta.arrival) return 'unknown'
    const buffer =
      forFilter && hideClosedAtEta.value ? etaHoursBufferMinutes.value : 0
    return openStatusAtEta(poi, eta.arrival, { bufferMinutes: buffer })
  }

  function isPoiVisibleAtEta(poi: Poi): boolean {
    if (!hideClosedAtEta.value) return true
    if (favorites.value.has(poi.id)) return true
    return poiOpenStatusAtEta(poi, true) !== 'closed'
  }

  const displayPois = computed(() =>
    categoryFilteredPois.value.filter((p) => isPoiVisibleAtEta(p))
  )

  const closedAtEtaHiddenCount = computed(() => {
    if (!hideClosedAtEta.value) return 0
    return categoryFilteredPois.value.length - displayPois.value.length
  })

  const favoritePois = computed(() =>
    allPois.value.filter(
      (p) => favorites.value.has(p.id) && SUPPORTED_POI_CATEGORIES.has(p.category)
    )
  )

  /** Favorites + control points for export / Spickzettel (km-sorted). */
  const exportStops = computed(() => {
    const favs = favoritePois.value.map((p) => ({
      ...p,
      name: favoriteLabel(p),
      label: favoriteLabel(p),
      note: favoriteNote(p.id),
    }))
    const cps = controlPoints.value.map((cp) => ({
      id: cp.id,
      name: cp.name,
      label: cp.name,
      category: (cp.kind === 'cp' ? 'checkpoint' : cp.kind) as PoiCategory,
      lat: cp.lat,
      lng: cp.lng,
      distanceAlongRouteKm: cp.distanceAlongRouteKm,
      subType: cp.kind,
      note: cp.note,
    }))
    return [...favs, ...cps].sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  })

  function favoriteLabel(poi: Poi): string {
    const custom = favoriteMeta.value.get(poi.id)?.customName?.trim()
    return custom || poi.name
  }

  function favoriteNote(poiId: string): string {
    return favoriteMeta.value.get(poiId)?.note?.trim() ?? ''
  }

  function favoriteMetaRecord(): Record<string, FavoriteMeta> {
    const out: Record<string, FavoriteMeta> = {}
    for (const [id, meta] of favoriteMeta.value) {
      if (!favorites.value.has(id)) continue
      const customName = meta.customName?.trim()
      const note = meta.note?.trim()
      if (!customName && !note) continue
      out[id] = {
        ...(customName ? { customName } : {}),
        ...(note ? { note } : {}),
      }
    }
    return out
  }

  const categoryCounts = computed(() => {
    const counts = new Map<PoiCategory, number>()
    for (const p of poiMap.value.values()) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    }
    return counts
  })

  const mapPois = computed(() => {
    if (showAllPoisOnMap.value) return displayPois.value
    const focus = gpsEnrichFocus.value
    if (!focus) return thinPoisForMap(displayPois.value)

    // GPS enrich: never thin away POIs inside the scan radius (corridor thinning
    // otherwise keeps only near-route stops at the same km).
    const inFocus: Poi[] = []
    const rest: Poi[] = []
    for (const p of displayPois.value) {
      if (haversineM(p, focus) <= focus.radiusM) inFocus.push(p)
      else rest.push(p)
    }
    const thinnedRest = thinPoisForMap(rest)
    const focusIds = new Set(inFocus.map((p) => p.id))
    const merged = [...inFocus, ...thinnedRest.filter((p) => !focusIds.has(p.id))]
    return merged.sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  })

  const mapPoiThinnedCount = computed(() =>
    Math.max(0, displayPois.value.length - mapPois.value.length)
  )

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

  function setHideClosedAtEta(value: boolean) {
    hideClosedAtEta.value = value
    try {
      localStorage.setItem(ETA_FILTER_OPEN_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  function setEtaHoursBufferMinutes(minutes: number) {
    const v = ETA_BUFFER_OPTIONS.includes(minutes as (typeof ETA_BUFFER_OPTIONS)[number])
      ? minutes
      : DEFAULT_ETA_HOURS_BUFFER_MIN
    etaHoursBufferMinutes.value = v
    try {
      localStorage.setItem(ETA_BUFFER_KEY, String(v))
    } catch {
      /* ignore */
    }
  }

  function setShowAllPoisOnMap(value: boolean) {
    showAllPoisOnMap.value = value
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

  function setLoadProgress(pct: number) {
    loadProgress.value = Math.max(0, Math.min(100, Math.round(pct)))
  }

  function mapFetchProgress(
    phase: 'tiles' | 'fetch' | 'filter',
    ratio: number
  ) {
    // tiles 0–8%, fetch 8–88%, filter 88–98%
    if (phase === 'tiles') {
      loadStatus.value = tGlobal('store.preparingTiles')
      setLoadProgress(2 + ratio * 6)
    } else if (phase === 'fetch') {
      loadStatus.value = tGlobal('store.loadingPois')
      setLoadProgress(8 + ratio * 80)
    } else {
      loadStatus.value = tGlobal('store.filteringPois')
      setLoadProgress(88 + ratio * 10)
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
    surfaceSummary.value = null
    isNearbyMap.value = false
    poisLoading.value = false
    locationFollowRequested.value = false
    gpsEnrichFocus.value = null
    poisEpoch.value = 0
    savedMapId.value = null
    loadedFromCache.value = false
    persistWarning.value = ''
    selectedPoi.value = null
    routeCursor.value = null
    favorites.value = new Set()
    favoriteMeta.value = new Map()
    controlPoints.value = []
    controlPointPlaceKind.value = null
    visibleCategories.value = [...DEFAULT_POI_CATEGORIES]
    error.value = ''
  }

  function requestGpsMapFocus(lat: number, lng: number, radiusM: number) {
    gpsEnrichFocus.value = { lat, lng, radiusM }
    gpsFocusTick.value++
    locationFollowRequested.value = true
  }

  function bumpPoisEpoch() {
    poisEpoch.value++
  }

  async function loadPoisForCoordinates(
    name: string,
    coordinates: [number, number][],
    radiusM: number,
    categories: PoiCategory[],
    elevations?: number[],
    opts?: { nearby?: boolean; surfaceSummary?: RouteSurfaceSummary | null }
  ) {
    validateSupportedRoute(coordinates)
    const points = buildRoutePoints(coordinates, elevations)
    const km = totalRouteKm(points)
    if (km > MAX_ROUTE_KM) {
      throw new Error(
        tGlobal('store.routeTooLong', { max: MAX_ROUTE_KM, km: Math.round(km) })
      )
    }

    routeName.value = name
    routePoints.value = points
    routeCoords.value = simplifyCoords(coordinates)
    surfaceSummary.value = opts?.surfaceSummary ?? null
    isNearbyMap.value = Boolean(opts?.nearby) || coordinates.length === 1
    poiRadiusM.value = radiusM
    activeCategories.value = categories

    if (!isSupabaseConfigured()) {
      throw new Error(tGlobal('store.supabaseNotConfiguredEnv'))
    }

    if (opts?.nearby) {
      showAllPoisOnMap.value = true
    } else {
      showAllPoisOnMap.value = false
    }

    loadStatus.value = tGlobal('store.loadingPois')
    setLoadProgress(5)
    const { pois } = await fetchPoisForRoute(
      coordinates,
      points,
      radiusM,
      categories,
      mapFetchProgress
    )

    for (const p of pois) {
      poiMap.value.set(p.id, normalizePoiCategory(p))
    }
    syncVisibleCategories()

    setLoadProgress(100)
    mapEpoch.value++
    mapReady.value = true
    mode.value = 'map'
    loadStatus.value = ''
    loadProgress.value = null

    void persistMapInBackground()
  }

  async function runMapLoad(
    status: string,
    loader: () => Promise<void>,
    fallbackError: string
  ) {
    const gen = ++loadGeneration
    resetState()
    mode.value = 'loading'
    loadStatus.value = status
    setLoadProgress(2)
    startLoadTimer()

    const timeout = setTimeout(() => {
      if (gen === loadGeneration && !mapReady.value) {
        error.value = tGlobal('store.timeout')
      }
    }, LOAD_TIMEOUT_MS)

    try {
      await loader()
      if (gen !== loadGeneration) return
    } catch (err) {
      if (gen !== loadGeneration) return
      mapReady.value = false
      mode.value = 'landing'
      loadStatus.value = ''
      loadProgress.value = null
      error.value = err instanceof Error ? err.message : fallbackError
    } finally {
      clearTimeout(timeout)
      if (gen === loadGeneration) {
        stopLoadTimer()
        if (mode.value !== 'loading') loadProgress.value = null
      }
    }
  }

  function cancelLoading() {
    loadGeneration++
    stopLoadTimer()
    mapReady.value = false
    mode.value = 'landing'
    loadStatus.value = ''
    loadProgress.value = null
    error.value = ''
  }

  function backToLanding() {
    loadGeneration++
    stopLoadTimer()
    resetState()
    mode.value = 'landing'
    loadStatus.value = ''
    loadProgress.value = null
    error.value = ''
  }

  async function createMapFromGpx(
    file: File,
    radiusM: number,
    categories: PoiCategory[]
  ) {
    await runMapLoad(tGlobal('store.processingRoute'), async () => {
      const t0 = performance.now()
      const text = await file.text()
      validateGpxFile(file, text)

      const { coordinates, elevations, name, waypoints } = routePointsFromGpx(text)
      const gpxMs = performance.now() - t0
      console.info(`[perf] gpx=${Math.round(gpxMs)}ms points=${coordinates.length}`)

      await loadPoisForCoordinates(name, coordinates, radiusM, categories, elevations)
      applyImportedFavorites(waypoints)
    }, tGlobal('store.gpxLoadFailed'))
  }

  /** Restore ★ favorites from UltraPlaner GPX extensions (or proximity match). */
  function applyImportedFavorites(waypoints: GpxWaypointImport[]) {
    const candidates = waypoints.filter((w) => w.favorite)
    if (!candidates.length) return

    const MATCH_M = 80
    let restored = 0

    for (const w of candidates) {
      let matched: Poi | undefined
      if (w.osmId) matched = poiMap.value.get(w.osmId)

      if (!matched) {
        let best = MATCH_M
        for (const p of poiMap.value.values()) {
          const d = haversineM({ lat: w.lat, lng: w.lng }, { lat: p.lat, lng: p.lng })
          if (d < best) {
            best = d
            matched = p
          }
        }
      }

      if (!matched) continue

      favorites.value.add(matched.id)
      restored++

      const customName = w.name.trim()
      if (customName && customName !== matched.name) {
        const prev = favoriteMeta.value.get(matched.id) ?? {}
        favoriteMeta.value.set(matched.id, { ...prev, customName })
      }
    }

    if (restored === 0) return

    favorites.value = new Set(favorites.value)
    favoriteMeta.value = new Map(favoriteMeta.value)
    void persistMapInBackground()
  }

  async function createMapFromRoute(
    name: string,
    coordinates: [number, number][],
    radiusM: number,
    categories: PoiCategory[],
    elevations?: number[],
    surface?: RouteSurfaceSummary | null
  ) {
    if (coordinates.length < 2) {
      throw new Error(tGlobal('store.routeTooFew'))
    }

    await runMapLoad(tGlobal('store.loadingPois'), async () => {
      await loadPoisForCoordinates(name, coordinates, radiusM, categories, elevations, {
        surfaceSummary: surface ?? null,
      })
    }, tGlobal('planner.createFailed'))
  }

  async function createMapFromNearby(
    lat: number,
    lng: number,
    radiusM: number,
    categories: PoiCategory[]
  ) {
    const name = tGlobal('nearby.mapName')
    const coordinates: [number, number][] = [[lng, lat]]
    await runMapLoad(tGlobal('store.loadingPois'), async () => {
      await loadPoisForCoordinates(name, coordinates, radiusM, categories, undefined, {
        nearby: true,
      })
    }, tGlobal('nearby.loadFailed'))
  }

  /**
   * Show Umgebung map immediately (center + radius, no POI wait).
   * Caller navigates to MapView; then refreshNearbyPois loads markers.
   */
  function prepareNearbyCenter(
    lat: number,
    lng: number,
    radiusM: number = NEARBY_DEFAULT_POI_RADIUS_M,
    categories: PoiCategory[] = [...DEFAULT_POI_CATEGORIES]
  ) {
    loadGeneration++
    stopLoadTimer()
    resetState()
    const coordinates: [number, number][] = [[lng, lat]]
    routeName.value = tGlobal('nearby.mapName')
    routePoints.value = buildRoutePoints(coordinates)
    routeCoords.value = coordinates
    surfaceSummary.value = null
    isNearbyMap.value = true
    poiRadiusM.value = radiusM
    activeCategories.value = [...categories]
    visibleCategories.value = [...categories]
    showAllPoisOnMap.value = true
    mapEpoch.value++
    mapReady.value = true
    mode.value = 'map'
    loadStatus.value = ''
    loadProgress.value = null
    error.value = ''
    locationFollowRequested.value = true
  }

  function consumeLocationFollowRequest(): boolean {
    if (!locationFollowRequested.value) return false
    locationFollowRequested.value = false
    return true
  }

  /**
   * Load/replace POIs for the current nearby center without hiding the map.
   * Does not touch enrichPoisAroundGps (route maps).
   */
  async function refreshNearbyPois(radiusM: number, categories: PoiCategory[]) {
    if (!isNearbyMap.value || routeCoords.value.length !== 1) {
      const c = routeCoords.value[0]
      if (c) await createMapFromNearby(c[1], c[0], radiusM, categories)
      return
    }

    const gen = ++loadGeneration
    error.value = ''
    poisLoading.value = true
    loadStatus.value = tGlobal('store.loadingPois')
    setLoadProgress(5)

    try {
      const offlineId = savedMapId.value
      const useOffline =
        typeof navigator !== 'undefined' && !navigator.onLine && Boolean(offlineId)

      if (!useOffline && !isSupabaseConfigured()) {
        throw new Error(tGlobal('store.supabaseNotConfiguredEnv'))
      }

      const coordinates = routeCoords.value
      const points = routePoints.value
      poiRadiusM.value = radiusM
      activeCategories.value = [...categories]

      const { pois } = await fetchPoisForRoute(
        coordinates,
        points,
        radiusM,
        categories,
        mapFetchProgress,
        { offlineMapId: offlineId }
      )
      if (gen !== loadGeneration) return

      poiMap.value.clear()
      for (const p of pois) {
        poiMap.value.set(p.id, normalizePoiCategory(p))
      }
      syncVisibleCategories()
      setLoadProgress(100)
      bumpPoisEpoch()
      void persistMapInBackground()
    } catch (err) {
      if (gen !== loadGeneration) return
      const msg = err instanceof Error ? err.message : tGlobal('nearby.loadFailed')
      error.value =
        msg === 'offline_no_pack' ? tGlobal('offlinePack.needSavedMap') : msg
    } finally {
      if (gen === loadGeneration) {
        poisLoading.value = false
        loadStatus.value = ''
        loadProgress.value = null
      }
    }
  }

  /**
   * GPS-radius POI scan on an existing route map.
   * Keeps route, favorites, control points; unions new POIs into poiMap
   * (distanceAlongRouteKm re-projected onto the current route).
   * Stays on the map (poisLoading banner) — no full remount / route fitBounds.
   */
  async function enrichPoisAroundGps(
    lat: number,
    lng: number,
    radiusM: number,
    categories: PoiCategory[]
  ) {
    if (isNearbyMap.value || routePoints.value.length < 2) {
      await createMapFromNearby(lat, lng, radiusM, categories)
      return
    }

    const gen = ++loadGeneration
    error.value = ''
    poisLoading.value = true
    loadStatus.value = tGlobal('store.loadingPois')
    setLoadProgress(5)

    try {
      const offlineId = savedMapId.value
      const useOffline =
        typeof navigator !== 'undefined' && !navigator.onLine && Boolean(offlineId)

      if (typeof navigator !== 'undefined' && !navigator.onLine && !offlineId) {
        throw new Error('offline_no_pack')
      }

      if (!useOffline && !isSupabaseConfigured()) {
        throw new Error(tGlobal('store.supabaseNotConfiguredEnv'))
      }

      if (useOffline && offlineId) {
        const tileIds = tileIdsAlongRoute([[lng, lat]], radiusM)
        const covered = await hasAnyCachedPoiTile(offlineId, tileIds)
        if (!covered) {
          throw new Error(tGlobal('offlinePack.noCoverageAroundGps'))
        }
      }

      const coordinates: [number, number][] = [[lng, lat]]
      const gpsPoints = buildRoutePoints(coordinates)
      const { pois } = await fetchPoisForRoute(
        coordinates,
        gpsPoints,
        radiusM,
        categories,
        mapFetchProgress,
        { offlineMapId: offlineId }
      )
      if (gen !== loadGeneration) return

      const routeTotalKm = routePoints.value.at(-1)?.distanceFromStart ?? 0
      // Replace Map (not in-place .set) so Pinia/Vue computeds + MapCanvas watchers
      // reliably see the union after enrich without a mapEpoch remount.
      const next = new Map(poiMap.value)
      for (const raw of pois) {
        const p = normalizePoiCategory(raw)
        const snap = nearestPointOnRoute(p, routePoints.value)
        next.set(p.id, {
          ...p,
          distanceAlongRouteKm: snap.distanceAlongRouteKm,
          distanceToRouteM: snap.distanceToRouteM,
          distanceToFinishKm: routeTotalKm - snap.distanceAlongRouteKm,
        })
      }
      poiMap.value = next

      const catSet = new Set<PoiCategory>([...activeCategories.value, ...categories])
      activeCategories.value = Array.from(catSet)
      syncVisibleCategories()

      setLoadProgress(100)
      bumpPoisEpoch()
      requestGpsMapFocus(lat, lng, radiusM)
      void persistMapInBackground()
    } catch (err) {
      if (gen !== loadGeneration) return
      const msg = err instanceof Error ? err.message : tGlobal('nearby.loadFailed')
      error.value =
        msg === 'offline_no_pack' ? tGlobal('offlinePack.needSavedMap') : msg
    } finally {
      if (gen === loadGeneration) {
        poisLoading.value = false
        loadStatus.value = ''
        loadProgress.value = null
      }
    }
  }

  async function persistMapInBackground() {
    if (!isSupabaseConfigured()) {
      persistWarning.value = tGlobal('store.saveFailedUser')
      return
    }
    try {
      const id = await saveMap({
        name: routeName.value,
        routeCoords: routeCoords.value,
        routePoints: routePoints.value,
        poiRadiusM: poiRadiusM.value,
        categories: activeCategories.value,
        pois: displayPois.value,
        favorites: Array.from(favorites.value),
        favoriteMeta: favoriteMetaRecord(),
        controlPoints: controlPoints.value,
        surfaceSummary: surfaceSummary.value ?? undefined,
      })
      savedMapId.value = id
      persistWarning.value = ''
    } catch (err) {
      console.warn('[maps] Speichern fehlgeschlagen:', err)
      persistWarning.value = tGlobal('store.saveFailedUser')
    }
  }

  async function loadSavedMap(id: string) {
    const gen = ++loadGeneration
    resetState()
    mode.value = 'loading'
    loadStatus.value = tGlobal('store.loadingMap')
    setLoadProgress(5)
    startLoadTimer()

    try {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      if (!offline && !isSupabaseConfigured()) {
        throw new Error(tGlobal('store.supabaseNotConfigured'))
      }

      setLoadProgress(15)
      const t0 = performance.now()
      const result = await loadMap(id)
      if (gen !== loadGeneration) return
      setLoadProgress(70)
      if (!result) {
        throw new Error(
          offline
            ? tGlobal('store.offlineNoCache')
            : tGlobal('store.mapNotFound')
        )
      }

      const { record, source } = result
      loadedFromCache.value = source === 'cache'

      routeName.value = record.name
      routeCoords.value = record.routeCoords
      routePoints.value = record.routePoints
      isNearbyMap.value =
        record.routeCoords.length === 1 ||
        (record.routeCoords.length <= 2 && totalRouteKm(record.routePoints) < 0.05)
      poiRadiusM.value = record.poiRadiusM
      activeCategories.value = expandLegacyCategories(record.categories as string[])
      savedMapId.value = record.id
      favorites.value = new Set(record.favorites)
      favoriteMeta.value = new Map(Object.entries(record.favoriteMeta ?? {}))
      controlPoints.value = record.controlPoints ?? []
      surfaceSummary.value = record.surfaceSummary ?? null
      controlPointPlaceKind.value = null
      showAllPoisOnMap.value = isNearbyMap.value

      poiMap.value.clear()
      for (const p of record.pois) {
        poiMap.value.set(p.id, normalizePoiCategory(p))
      }
      syncVisibleCategories()
      setLoadProgress(95)

      const loadMs = performance.now() - t0
      console.info(
        `[perf] share-load=${Math.round(loadMs)}ms pois=${record.pois.length} source=${source}`
      )

      setLoadProgress(100)
      mapEpoch.value++
      mapReady.value = true
      mode.value = 'map'
      loadStatus.value = ''
      loadProgress.value = null
    } catch (err) {
      if (gen !== loadGeneration) return
      mapReady.value = false
      mode.value = 'landing'
      loadStatus.value = ''
      loadProgress.value = null
      error.value = err instanceof Error ? err.message : tGlobal('store.loadFailed')
    } finally {
      if (gen === loadGeneration) stopLoadTimer()
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

  function scheduleFavoritesPersist() {
    if (favSaveTimer) clearTimeout(favSaveTimer)
    favSaveTimer = setTimeout(() => {
      void persistFavoritesUpdate()
    }, 1500)
  }

  function toggleFavorite(poiId: string) {
    if (favorites.value.has(poiId)) {
      favorites.value.delete(poiId)
      favoriteMeta.value.delete(poiId)
      favoriteMeta.value = new Map(favoriteMeta.value)
    } else {
      favorites.value.add(poiId)
    }
    favorites.value = new Set(favorites.value)
    scheduleFavoritesPersist()
  }

  function updateFavoriteMeta(poiId: string, patch: FavoriteMeta) {
    if (!favorites.value.has(poiId)) return
    const prev = favoriteMeta.value.get(poiId) ?? {}
    const next: FavoriteMeta = {
      customName: patch.customName !== undefined ? patch.customName : prev.customName,
      note: patch.note !== undefined ? patch.note : prev.note,
    }
    const customName = next.customName?.trim()
    const note = next.note?.trim()
    if (!customName && !note) {
      favoriteMeta.value.delete(poiId)
    } else {
      favoriteMeta.value.set(poiId, {
        ...(customName ? { customName } : {}),
        ...(note ? { note } : {}),
      })
    }
    favoriteMeta.value = new Map(favoriteMeta.value)
    scheduleFavoritesPersist()
  }

  function setRouteName(name: string) {
    routeName.value = name.slice(0, 48)
    if (name.trim()) scheduleFavoritesPersist()
  }

  async function persistFavoritesUpdate() {
    if (!savedMapId.value) return
    const meta = favoriteMetaRecord()
    const record = {
      id: savedMapId.value,
      name: routeName.value,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      routeCoords: routeCoords.value,
      routePoints: routePoints.value,
      poiRadiusM: poiRadiusM.value,
      categories: activeCategories.value,
      pois: displayPois.value,
      favorites: Array.from(favorites.value),
      favoriteMeta: meta,
      controlPoints: controlPoints.value,
      surfaceSummary: surfaceSummary.value ?? undefined,
    }
    void putOfflineMap(record)

    const writeToken = getMapWriteToken(savedMapId.value)
    if (!writeToken || !isSupabaseConfigured()) return

    try {
      await updateMapPayload(savedMapId.value, writeToken, {
        routeCoords: record.routeCoords,
        routePoints: record.routePoints,
        poiRadiusM: record.poiRadiusM,
        categories: record.categories,
        pois: record.pois,
        favorites: record.favorites,
        favoriteMeta: record.favoriteMeta,
        controlPoints: record.controlPoints,
        surfaceSummary: record.surfaceSummary,
      })
    } catch (err) {
      console.warn('[maps] Favoriten-Speichern fehlgeschlagen:', err)
    }
  }

  function beginPlaceControlPoint(kind: ControlPointKind) {
    if (isNearbyMap.value || routePoints.value.length < 2) return
    controlPointPlaceKind.value =
      controlPointPlaceKind.value === kind ? null : kind
  }

  function cancelPlaceControlPoint() {
    controlPointPlaceKind.value = null
  }

  function addControlPointAt(lat: number, lng: number) {
    const kind = controlPointPlaceKind.value
    if (!kind || routePoints.value.length < 2) return
    // Keep exact click position (hotel/border can sit beside the line).
    // Only distanceAlongRouteKm comes from the nearest point on the route.
    const along = placeOnRoute(lat, lng, routePoints.value)
    const cp: ControlPoint = {
      id: newControlPointId(),
      kind,
      name: defaultControlPointName(kind, controlPoints.value),
      lat,
      lng,
      distanceAlongRouteKm: along.distanceAlongRouteKm,
    }
    controlPoints.value = [...controlPoints.value, cp].sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
    controlPointPlaceKind.value = null
    scheduleFavoritesPersist()
  }

  function updateControlPoint(
    id: string,
    patch: Partial<Pick<ControlPoint, 'name' | 'note' | 'kind'>>
  ) {
    const idx = controlPoints.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    const prev = controlPoints.value[idx]!
    const next = { ...prev, ...patch }
    if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 40) || prev.name
    if (patch.note !== undefined) next.note = patch.note.trim().slice(0, 80) || undefined
    const list = [...controlPoints.value]
    list[idx] = next
    controlPoints.value = list
    scheduleFavoritesPersist()
  }

  function removeControlPoint(id: string) {
    controlPoints.value = controlPoints.value.filter((c) => c.id !== id)
    scheduleFavoritesPersist()
  }

  function clearError() {
    error.value = ''
  }

  return {
    mode,
    mapReady,
    mapEpoch,
    loadStatus,
    loadProgress,
    loadSeconds,
    error,
    savedMapId,
    loadedFromCache,
    persistWarning,
    routeName,
    routeCoords,
    routePoints,
    surfaceSummary,
    isNearbyMap,
    poisLoading,
    poiRadiusM,
    activeCategories,
    visibleCategories,
    poiMap,
    favorites,
    favoriteMeta,
    selectedPoi,
    poiFocusTick,
    poiFocusCoords,
    routeCursor,
    showPoiList,
    allPois,
    displayPois,
    favoritePois,
    exportStops,
    favoriteLabel,
    favoriteNote,
    setRouteName,
    categoryCounts,
    mapPois,
    totalKm,
    avgSpeedKmh,
    startTimeHHmm,
    hideClosedAtEta,
    etaHoursBufferMinutes,
    showAllPoisOnMap,
    closedAtEtaHiddenCount,
    mapPoiThinnedCount,
    gpsEnrichFocus,
    gpsFocusTick,
    poisEpoch,
    controlPoints,
    controlPointPlaceKind,
    setAvgSpeedKmh,
    setStartTimeHHmm,
    setHideClosedAtEta,
    setEtaHoursBufferMinutes,
    setShowAllPoisOnMap,
    poiOpenStatusAtEta,
    etaAtRouteKm,
    createMapFromGpx,
    createMapFromRoute,
    createMapFromNearby,
    prepareNearbyCenter,
    refreshNearbyPois,
    consumeLocationFollowRequest,
    enrichPoisAroundGps,
    loadSavedMap,
    selectPoi,
    closePoiDetail,
    toggleFavorite,
    updateFavoriteMeta,
    removeFavorite,
    beginPlaceControlPoint,
    cancelPlaceControlPoint,
    addControlPointAt,
    updateControlPoint,
    removeControlPoint,
    toggleCategoryVisibility,
    backToLanding,
    cancelLoading,
    clearError,
  }
})
