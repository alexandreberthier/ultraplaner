<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLng, Poi, PoiCategory, RouteCursor, RouteSurfaceSummary } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  MAX_POI_RADIUS_M,
  MIN_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import {
  ROUTE_COLOR,
  ROUTE_CASING,
  MAP_LABEL_FONT,
  basemapStyle,
  captureMapFrame,
  loadBasemapPreference,
  saveBasemapPreference,
  KM_MARKER_INTERVAL_KM,
  isBasemapStyleError,
  otherBasemap,
  preloadBasemapStyle,
  resolveBasemapWithFallback,
  whenStyleReady,
  remapOpenFreeMapGlyphRequest,
  gradeLegend,
  poiColors,
  type BasemapId,
} from '../config/mapStyle'
import {
  ensureCyclosmOfflineProtocol,
  setCyclosmOutageHandler,
} from '../services/offlinePacks'
import {
  fetchCyclingRoute,
  isOrsConfigured,
  isRouteAborted,
  isLongStraightRoute,
  searchAddresses,
  SURFACE_PREFERENCES,
  HILL_PREFERENCES,
  cyclingProfileForSurface,
  orsPreferenceForSurface,
  type SurfacePreference,
  type HillPreference,
  type GeocodeResult,
} from '../services/routing'
import {
  totalRouteKm,
  buildRoutePoints,
  buildKmMarkers,
  buildGradeSegments,
  hasElevationData,
  routeElevationGainLoss,
} from '../utils/route'
import {
  SURFACE_COLORS,
  SURFACE_I18N_KEYS,
  buildSurfaceLineFeatures,
} from '../utils/surface'
import { buildGpxExport, downloadFile, downloadBinary } from '../services/export'
import { poiCategoryLabel } from '../utils/poiLabels'
import { thinPoisForMap } from '../utils/poiThin'
import { fetchPoisForRoute } from '../services/maps'
import { ensureRouteEndImages, routeEndIconId } from '../utils/routeEndIcons'
import { isSecureGeoContext } from '../utils/geoDevice'
import {
  createUserLocationElement,
  resolveGeoHeading,
  setLocationMarkerHeading,
} from '../utils/userLocationMarker'
import { useRouteColorMode } from '../composables/useRouteColorMode'
import PlannerElevationProfile from './PlannerElevationProfile.vue'

/** Vienna city center — default planner view before/without geolocation. */
const VIENNA_CENTER: [number, number] = [16.3738, 48.2082]
const VIENNA_ZOOM = 11
const GEO_TIMEOUT_MS = 4000
const USER_LOCATION_ZOOM = 12

interface Waypoint {
  id: string
  lat: number
  lng: number
  label?: string
}

const store = useMapStore()
const router = useRouter()
const { t } = useI18n()

const mapEl = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let resizeObserver: ResizeObserver | null = null
let waypointId = 0
let autoRouteTimer: ReturnType<typeof setTimeout> | null = null
let addressTimer: ReturnType<typeof setTimeout> | null = null
let routeGeneration = 0
let routeAbort: AbortController | null = null
let webglRecoveryScheduled = false

const waypoints = ref<Waypoint[]>([])
const routeCoords = ref<[number, number][]>([])
const routeElevations = ref<number[]>([])
const routeSurfaceSummary = ref<RouteSurfaceSummary | null>(null)
const routeName = ref('')
const surfacePreference = ref<SurfacePreference>('shortest')
const hillPreference = ref<HillPreference>('balanced')
const radiusM = ref(DEFAULT_POI_RADIUS_M)
const selected = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
const formError = ref('')
const routing = ref(false)
/** Long A–B hop — show clearer “lange Strecke” loading copy. */
const routingLong = ref(false)
/** Preview geometry is on map; elevation/surface still loading. */
const routingEnriching = ref(false)
const creating = ref(false)
const exporting = ref(false)
const previewPoisAll = ref<Poi[]>([])
const previewingPois = ref(false)
const ALL_POI_CATEGORIES: PoiCategory[] = POI_CATEGORY_DEFS.map((c) => c.id)
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewGen = 0
let previewCorridorKey = ''
let previewPromise: Promise<void> | null = null
const showExportMenu = ref(false)
const basemap = ref<BasemapId>(loadBasemapPreference())
const basemapFallbackHint = ref('')
const basemapRetryId = ref<BasemapId>('standard')
const basemapSwitching = ref(false)
const basemapFreezeUrl = ref<string | null>(null)
let cancelStyleReady: (() => void) | null = null
let basemapRecovering = false
let basemapErrorRetried = false
let basemapSwitchGen = 0
/** Ignore late geolocation results after unmount or after user started drawing. */
let geoLocateAlive = false
let locationWatchId: number | null = null
let locationMarker: maplibregl.Marker | null = null
let routeCursorMarker: maplibregl.Marker | null = null
let routeCursorEl: HTMLDivElement | null = null
let lastGeoPos: { lat: number; lng: number } | null = null

const addressQuery = ref('')
const addressResults = ref<GeocodeResult[]>([])
const routeCursor = ref<RouteCursor | null>(null)
const addressSearching = ref(false)
const addressError = ref('')
/** Mobile bottom sheet: collapsed by default so the map stays large. */
const controlsOpen = ref(false)
let didAutoCollapseControls = false

function isMobilePlannerViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches
}

const controlsSummary = computed(() => {
  const n = waypoints.value.length
  const parts: string[] = [`${n} ${t('planner.waypoints')}`]
  if (routeKm.value > 0) parts.push(`${routeKm.value.toFixed(1)} km`)
  if (elevationStats.value) parts.push(`↑${Math.round(elevationStats.value.ascentM)} m`)
  return parts.join(' · ')
})

async function toggleControlsSheet() {
  controlsOpen.value = !controlsOpen.value
  await nextTick()
  map?.resize()
}

const emit = defineEmits<{
  'can-export-change': [value: boolean]
}>()

function clearBasemapFallbackHint() {
  basemapFallbackHint.value = ''
}

function setFallbackHint(failedId: BasemapId) {
  basemapRetryId.value = failedId
  basemapFallbackHint.value =
    failedId === 'standard'
      ? t('mapCanvas.basemapFallback')
      : t('mapCanvas.basemapFallbackCycling')
}

function finishBasemapSwitch() {
  basemapSwitching.value = false
  basemapFreezeUrl.value = null
}

const routePoints = computed(() =>
  routeCoords.value.length
    ? buildRoutePoints(routeCoords.value, routeElevations.value)
    : []
)

const routeKm = computed(() => {
  if (!routePoints.value.length) return 0
  return totalRouteKm(routePoints.value)
})

const elevationStats = computed(() => {
  if (!hasElevationData(routePoints.value)) return null
  return routeElevationGainLoss(routePoints.value)
})

const showElevation = computed(
  () => routePoints.value.length >= 2 && (hasElevationData(routePoints.value) || routing.value)
)

const canCreate = computed(
  () => waypoints.value.length >= 2 && routeCoords.value.length >= 2 && !routing.value && !creating.value
)

const canExportRoute = computed(
  () => routeCoords.value.length >= 2 && !routing.value && !exporting.value
)

const showPoiOptions = computed(() => waypoints.value.length >= 2)

/** Route geometry ready — next step is loading POIs (sticky CTA). */
const routeReadyForPois = computed(
  () => waypoints.value.length >= 2 && routeCoords.value.length >= 2
)

const showRoutingOptions = computed(() => waypoints.value.length >= 2 && isOrsConfigured())

const createMapLabel = computed(() => {
  if (creating.value) return t('planner.loadingPois')
  if (routing.value) {
    if (routingEnriching.value) return t('planner.enrichingRoute')
    if (routingLong.value) return t('planner.calculatingRouteLong')
    return t('planner.calculatingRoute')
  }
  return t('planner.createMap')
})

const mapRoutingHint = computed(() => {
  if (routingEnriching.value) return t('planner.mapHintEnriching')
  if (routingLong.value) return t('planner.mapHintRoutingLong')
  return t('planner.mapHintRouting')
})

const routeDrawingLabel = computed(() => {
  if (routingLong.value) return t('planner.routeDrawingLong')
  return t('planner.routeDrawing')
})

watch(
  canExportRoute,
  (v) => {
    emit('can-export-change', v)
    if (!v) showExportMenu.value = false
  },
  { immediate: true }
)

watch(routeKm, (km) => {
  if (km <= 0 || didAutoCollapseControls || !isMobilePlannerViewport()) return
  didAutoCollapseControls = true
  controlsOpen.value = false
  void nextTick(() => map?.resize())
})

function setSurfacePreference(surface: SurfacePreference) {
  if (surfacePreference.value === surface) return
  surfacePreference.value = surface
  scheduleAutoRoute()
}

function setHillPreference(hill: HillPreference) {
  if (hillPreference.value === hill) return
  hillPreference.value = hill
  scheduleAutoRoute()
}

function toggleExportMenu() {
  if (!canExportRoute.value && !showExportMenu.value) return
  showExportMenu.value = !showExportMenu.value
}

function closeExportMenu() {
  showExportMenu.value = false
}

function hasDraft() {
  return waypoints.value.length > 0
}

defineExpose({ hasDraft, toggleExportMenu, closeExportMenu, canExportRoute })

const canCloseLoop = computed(() => {
  if (waypoints.value.length < 2) return false
  const start = waypoints.value[0]!
  const last = waypoints.value[waypoints.value.length - 1]!
  const same =
    Math.abs(start.lat - last.lat) < 1e-5 && Math.abs(start.lng - last.lng) < 1e-5
  return !same
})

function waypointLabel(index: number, total: number): string {
  if (index === 0) return t('planner.start')
  if (index === total - 1) return t('planner.end')
  return `${index}`
}

function waypointDisplay(wp: Waypoint): string {
  return wp.label ?? `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`
}

function addWaypoint(lat: number, lng: number, label?: string) {
  waypoints.value.push({ id: `wp-${++waypointId}`, lat, lng, label })
  updateMapSources()
  fitToContent()
  scheduleAutoRoute()
}

function removeWaypoint(id: string) {
  waypoints.value = waypoints.value.filter((w) => w.id !== id)
  updateMapSources()
  fitToContent()
  scheduleAutoRoute()
}

function clearAll() {
  waypoints.value = []
  routeCoords.value = []
  routeElevations.value = []
  routeSurfaceSummary.value = null
  updateMapSources()
}

function undoWaypoint() {
  waypoints.value.pop()
  updateMapSources()
  fitToContent()
  scheduleAutoRoute()
}

function closeLoop() {
  const start = waypoints.value[0]
  if (!start || !canCloseLoop.value) return
  addWaypoint(start.lat, start.lng, start.label ?? t('planner.start'))
}

function pickAddress(result: GeocodeResult) {
  addWaypoint(result.lat, result.lng, result.label)
  addressQuery.value = ''
  addressResults.value = []
  addressError.value = ''
  if (map) {
    map.easeTo({ center: [result.lng, result.lat], zoom: Math.max(map.getZoom(), 12), duration: 500 })
  }
}

function onAddressInput() {
  addressError.value = ''
  if (addressTimer) clearTimeout(addressTimer)
  const q = addressQuery.value.trim()
  if (q.length < 2) {
    addressResults.value = []
    return
  }
  addressTimer = setTimeout(() => void runAddressSearch(q), 350)
}

async function runAddressSearch(query: string) {
  if (!isOrsConfigured()) return
  addressSearching.value = true
  try {
    addressResults.value = await searchAddresses(query)
    if (!addressResults.value.length) {
      addressError.value = t('planner.noResults')
    }
  } catch (err) {
    addressResults.value = []
    addressError.value = err instanceof Error ? err.message : t('planner.searchFailed')
  } finally {
    addressSearching.value = false
  }
}

function pickFirstResult() {
  const first = addressResults.value[0]
  if (first) pickAddress(first)
}

function toggleCategory(id: PoiCategory) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) {
    if (selected.value.length <= 1) {
      formError.value = t('planner.minCategory')
      return
    }
    selected.value.splice(idx, 1)
  } else {
    selected.value.push(id)
  }
  formError.value = ''
}

function corridorKey(): string {
  const coords = routeCoords.value
  if (coords.length < 2) return ''
  const first = coords[0]!
  const mid = coords[Math.floor(coords.length / 2)]!
  const last = coords[coords.length - 1]!
  return `${coords.length}:${first[0].toFixed(5)},${first[1].toFixed(5)}:${mid[0].toFixed(5)},${mid[1].toFixed(5)}:${last[0].toFixed(5)},${last[1].toFixed(5)}:${radiusM.value}`
}

function previewPoisGeoJson() {
  const colors = poiColors()
  const selectedSet = new Set(selected.value)
  const filtered = previewPoisAll.value.filter((p) => selectedSet.has(p.category))
  const thinned = thinPoisForMap(filtered)
  return {
    type: 'FeatureCollection' as const,
    features: thinned.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        color: colors[p.category] ?? '#6b7280',
      },
    })),
  }
}

function applyPreviewFilterToMap() {
  if (!map?.getSource('planner-pois')) return
  ;(map.getSource('planner-pois') as maplibregl.GeoJSONSource).setData(previewPoisGeoJson())
}

function clearPreviewPois() {
  previewPoisAll.value = []
  previewCorridorKey = ''
  previewingPois.value = false
  if (map?.getSource('planner-pois')) {
    ;(map.getSource('planner-pois') as maplibregl.GeoJSONSource).setData(emptyGeoJson())
  }
}

function schedulePreviewPois() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewTimer = null
    void loadPreviewPois()
  }, 400)
}

async function loadPreviewPois() {
  const key = corridorKey()
  if (!key || routing.value) {
    if (!key) clearPreviewPois()
    return
  }
  if (key === previewCorridorKey) {
    applyPreviewFilterToMap()
    return
  }

  const gen = ++previewGen
  previewingPois.value = true
  const run = (async () => {
    try {
      const points = buildRoutePoints(routeCoords.value, routeElevations.value)
      const { pois } = await fetchPoisForRoute(
        routeCoords.value,
        points,
        radiusM.value,
        ALL_POI_CATEGORIES
      )
      if (gen !== previewGen) return
      previewPoisAll.value = pois
      previewCorridorKey = key
      applyPreviewFilterToMap()
    } catch (err) {
      if (gen !== previewGen) return
      console.warn('[planner] POI preview failed', err)
      previewPoisAll.value = []
      previewCorridorKey = ''
    } finally {
      if (gen === previewGen) previewingPois.value = false
    }
  })()
  previewPromise = run
  await run
  if (previewPromise === run) previewPromise = null
}

watch(
  () => [corridorKey(), routing.value] as const,
  () => {
    if (routing.value || !corridorKey()) {
      previewGen++
      previewPromise = null
      if (previewTimer) {
        clearTimeout(previewTimer)
        previewTimer = null
      }
      clearPreviewPois()
      return
    }
    schedulePreviewPois()
  }
)

watch(
  selected,
  () => {
    applyPreviewFilterToMap()
  },
  { deep: true }
)

function emptyGeoJson() {
  return { type: 'FeatureCollection' as const, features: [] }
}

function waypointsGeoJson() {
  const pts = waypoints.value
  const n = pts.length
  const loopClosed =
    n >= 2 &&
    Math.abs(pts[0]!.lat - pts[n - 1]!.lat) < 1e-4 &&
    Math.abs(pts[0]!.lng - pts[n - 1]!.lng) < 1e-4

  return {
    type: 'FeatureCollection' as const,
    features: pts.flatMap((w, i) => {
      // Skip duplicate end marker when start == finish
      if (loopClosed && i === n - 1) return []
      let role: 'start' | 'end' | 'both' | 'mid' = 'mid'
      if (loopClosed && i === 0) role = 'both'
      else if (i === 0) role = 'start'
      else if (i === n - 1) role = 'end'
      const label =
        role === 'both' ? t('planner.startEnd') : waypointLabel(i, n)
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [w.lng, w.lat] },
          properties: {
            label,
            role,
            icon: role === 'mid' ? '' : routeEndIconId(role),
            index: String(i + 1),
          },
        },
      ]
    }),
  }
}

function routeGeoJson() {
  if (routeCoords.value.length < 2) return emptyGeoJson()
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: routeCoords.value },
        properties: {},
      },
    ],
  }
}

function surfaceGeoJson() {
  const features = buildSurfaceLineFeatures(
    routeCoords.value,
    routeSurfaceSummary.value?.segments
  )
  return {
    type: 'FeatureCollection' as const,
    features: features.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      properties: { bucket: s.bucket, color: s.color },
    })),
  }
}

const surfaceLegendBuckets = computed(() => routeSurfaceSummary.value?.buckets ?? [])
const hasSurfaceOnRoute = computed(
  () => (routeSurfaceSummary.value?.segments?.length ?? 0) > 0
)

const {
  effectiveMode: routeColorMode,
  showToggle: showRouteColorToggle,
  canSurface: canRouteSurface,
  canGrade: canRouteGrade,
  setRouteColorMode,
} = useRouteColorMode({
  canSurface: hasSurfaceOnRoute,
  canGrade: () => hasElevationData(routePoints.value),
})

const gradeLegendItems = computed(() => {
  const colors = gradeLegend()
  const labels = [
    t('legend.downhill'),
    t('legend.gradeLt2'),
    t('legend.grade2to5'),
    t('legend.grade5to8'),
    t('legend.grade8to12'),
    t('legend.gradeGt12'),
  ]
  return colors.map((g, i) => ({ label: labels[i] ?? g.label, color: g.color }))
})

function gradeGeoJson() {
  const segments = buildGradeSegments(routePoints.value)
  return {
    type: 'FeatureCollection' as const,
    features: segments.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      properties: { grade: Math.round(s.grade * 10) / 10, color: s.color },
    })),
  }
}

watch(routeColorMode, () => {
  updateMapSources()
})

function previewGeoJson() {
  if (routeCoords.value.length >= 2 || waypoints.value.length < 2) return emptyGeoJson()
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: waypoints.value.map((w) => [w.lng, w.lat]),
        },
        properties: {},
      },
    ],
  }
}

function kmMarkerGeoJson() {
  if (routeCoords.value.length < 2) return emptyGeoJson()
  const points = buildRoutePoints(routeCoords.value, routeElevations.value)
  const markers = buildKmMarkers(points, KM_MARKER_INTERVAL_KM)
  return {
    type: 'FeatureCollection' as const,
    features: markers.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { label: `${m.km}` },
    })),
  }
}

function updateMapSources() {
  if (!map) return
  if (!map.isStyleLoaded()) {
    map.once('idle', () => updateMapSources())
    return
  }
  ;(map.getSource('planner-waypoints') as maplibregl.GeoJSONSource)?.setData(waypointsGeoJson())
  ;(map.getSource('planner-route') as maplibregl.GeoJSONSource)?.setData(routeGeoJson())
  ;(map.getSource('planner-route-surface') as maplibregl.GeoJSONSource)?.setData(surfaceGeoJson())
  ;(map.getSource('planner-route-grades') as maplibregl.GeoJSONSource)?.setData(gradeGeoJson())
  ;(map.getSource('planner-preview') as maplibregl.GeoJSONSource)?.setData(previewGeoJson())
  ;(map.getSource('planner-km-markers') as maplibregl.GeoJSONSource)?.setData(kmMarkerGeoJson())
  applyPreviewFilterToMap()

  const showSurface = routeColorMode.value === 'surface'
  const showGrades = routeColorMode.value === 'grade'
  if (map.getLayer('planner-route-line')) {
    map.setPaintProperty(
      'planner-route-line',
      'line-opacity',
      showSurface || showGrades ? 0.18 : 1
    )
  }
  if (map.getLayer('planner-route-surface')) {
    map.setLayoutProperty(
      'planner-route-surface',
      'visibility',
      showSurface ? 'visible' : 'none'
    )
  }
  if (map.getLayer('planner-route-grades')) {
    map.setLayoutProperty(
      'planner-route-grades',
      'visibility',
      showGrades ? 'visible' : 'none'
    )
  }
}

function createBikeCursorElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'route-bike-cursor'
  el.innerHTML = `
    <svg class="route-bike-icon" viewBox="0 0 64 40" aria-hidden="true">
      <g fill="none" stroke="#2d6a4f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="14" cy="28" r="9"/>
        <circle cx="50" cy="28" r="9"/>
        <path d="M14 28 L26 28 L36 12 H48"/>
        <path d="M26 28 L36 12 L42 28"/>
        <path d="M36 12 L30 6 H38"/>
        <circle cx="26" cy="28" r="2.4" fill="#2d6a4f" stroke="none"/>
      </g>
    </svg>
  `
  return el
}

function updateRouteCursorMarker() {
  if (!map) return
  const cursor = routeCursor.value
  if (!cursor) {
    routeCursorMarker?.remove()
    routeCursorMarker = null
    routeCursorEl = null
    return
  }
  if (!routeCursorMarker || !routeCursorEl) {
    routeCursorEl = createBikeCursorElement()
    routeCursorMarker = new maplibregl.Marker({
      element: routeCursorEl,
      anchor: 'center',
    })
      .setLngLat([cursor.lng, cursor.lat])
      .addTo(map)
  } else {
    routeCursorMarker.setLngLat([cursor.lng, cursor.lat])
  }
}

function onElevationCursor(cursor: RouteCursor | null) {
  routeCursor.value = cursor
  updateRouteCursorMarker()
}

function fitToContent() {
  if (!map) return
  const bounds = new maplibregl.LngLatBounds()
  let has = false
  for (const w of waypoints.value) {
    bounds.extend([w.lng, w.lat])
    has = true
  }
  for (const [lng, lat] of routeCoords.value) {
    bounds.extend([lng, lat])
    has = true
  }
  if (has) {
    map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 400 })
  }
}

function addPlannerLayers() {
  if (!map || map.getSource('planner-waypoints')) return

  map.addSource('planner-waypoints', { type: 'geojson', data: waypointsGeoJson() })
  map.addSource('planner-route', { type: 'geojson', data: routeGeoJson() })
  map.addSource('planner-route-surface', { type: 'geojson', data: surfaceGeoJson() })
  map.addSource('planner-route-grades', { type: 'geojson', data: gradeGeoJson() })
  map.addSource('planner-preview', { type: 'geojson', data: previewGeoJson() })
  map.addSource('planner-km-markers', { type: 'geojson', data: kmMarkerGeoJson() })
  map.addSource('planner-pois', { type: 'geojson', data: previewPoisGeoJson() })

  map.addLayer({
    id: 'planner-preview-line',
    type: 'line',
    source: 'planner-preview',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#94a3b8',
      'line-width': 3,
      'line-dasharray': [2, 2],
    },
  })

  map.addLayer({
    id: 'planner-route-casing',
    type: 'line',
    source: 'planner-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_CASING,
      'line-width': 7,
    },
  })

  const showSurfaceOnInit = routeColorMode.value === 'surface'
  const showGradesOnInit = routeColorMode.value === 'grade'

  map.addLayer({
    id: 'planner-route-line',
    type: 'line',
    source: 'planner-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': 4,
      'line-opacity': showSurfaceOnInit || showGradesOnInit ? 0.18 : 1,
    },
  })

  map.addLayer({
    id: 'planner-route-surface',
    type: 'line',
    source: 'planner-route-surface',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: showSurfaceOnInit ? 'visible' : 'none',
    },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
      'line-width': 5,
    },
  })

  map.addLayer({
    id: 'planner-route-grades',
    type: 'line',
    source: 'planner-route-grades',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: showGradesOnInit ? 'visible' : 'none',
    },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
      'line-width': 5,
    },
  })

  map.addLayer({
    id: 'planner-km-markers-dot',
    type: 'circle',
    source: 'planner-km-markers',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
      'circle-color': '#fff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#374151',
    },
  })

  map.addLayer({
    id: 'planner-km-markers',
    type: 'symbol',
    source: 'planner-km-markers',
    layout: {
      'text-field': ['concat', ['get', 'label'], ' km'],
      'text-size': 11,
      'text-font': [...MAP_LABEL_FONT],
      'text-offset': [0, -1.8],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#111827',
      'text-halo-color': '#fff',
      'text-halo-width': 2,
    },
  })

  map.addLayer({
    id: 'planner-pois-halo',
    type: 'circle',
    source: 'planner-pois',
    paint: {
      'circle-radius': 11,
      'circle-color': ['coalesce', ['get', 'color'], '#6b7280'],
      'circle-opacity': 0.28,
    },
  })

  map.addLayer({
    id: 'planner-pois',
    type: 'circle',
    source: 'planner-pois',
    paint: {
      'circle-radius': 7,
      'circle-color': ['coalesce', ['get', 'color'], '#6b7280'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'planner-waypoint-mid',
    type: 'circle',
    source: 'planner-waypoints',
    filter: ['==', ['get', 'role'], 'mid'],
    paint: {
      'circle-radius': 7,
      'circle-color': '#1b4332',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

  map.addLayer({
    id: 'planner-waypoint-mid-label',
    type: 'symbol',
    source: 'planner-waypoints',
    filter: ['==', ['get', 'role'], 'mid'],
    layout: {
      'text-field': ['get', 'index'],
      'text-size': 10,
      'text-font': [...MAP_LABEL_FONT],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#1b4332',
      'text-halo-width': 0.8,
    },
  })

  ensureRouteEndImages(map)
  map.addLayer({
    id: 'planner-waypoint-ends',
    type: 'symbol',
    source: 'planner-waypoints',
    filter: ['in', ['get', 'role'], ['literal', ['start', 'end', 'both']]],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, -1.85],
      'text-font': [...MAP_LABEL_FONT],
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  })

  map.getCanvas().style.cursor = 'crosshair'
}

function onPlannerMapClick(e: maplibregl.MapMouseEvent) {
  if (!map) return
  const hits = map.queryRenderedFeatures(e.point, {
    layers: ['planner-waypoint-ends', 'planner-waypoint-mid'].filter((id) => map!.getLayer(id)),
  })
  if (hits.length) {
    const role = String(hits[0]?.properties?.role ?? '')
    const label = String(hits[0]?.properties?.label ?? '')
    if ((role === 'start' || label === t('planner.start')) && canCloseLoop.value) {
      closeLoop()
    }
    return
  }
  addWaypoint(e.lngLat.lat, e.lngLat.lng)
}

async function initMap() {
  if (!mapEl.value || map) return

  ensureCyclosmOfflineProtocol(maplibregl)
  setCyclosmOutageHandler(() => {
    if (basemap.value !== 'cycling' || basemapRecovering) return
    console.warn('[planner] CyclOSM tile outage — falling back to standard map')
    setFallbackHint('cycling')
    void setBasemap('standard', { auto: true })
  })

  basemapSwitching.value = true
  basemapErrorRetried = false
  let initialStyle: import('maplibre-gl').StyleSpecification | string = basemapStyle(
    basemap.value
  )
  try {
    const resolved = await resolveBasemapWithFallback(basemap.value)
    if (!mapEl.value || map) {
      finishBasemapSwitch()
      return
    }
    if (resolved.usedFallback && resolved.failedId) {
      basemap.value = resolved.id
      setFallbackHint(resolved.failedId)
    }
    initialStyle = resolved.style
  } catch (err) {
    console.error('[planner] Initial basemap resolve failed:', err)
    basemapFallbackHint.value = t('mapCanvas.basemapSwitchFailed')
    basemapRetryId.value = basemap.value
    initialStyle = basemapStyle('cycling')
    basemap.value = 'cycling'
  }

  map = new maplibregl.Map({
    container: mapEl.value,
    style: initialStyle,
    center: VIENNA_CENTER,
    zoom: VIENNA_ZOOM,
    transformRequest: (url) => ({ url: remapOpenFreeMapGlyphRequest(url) }),
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('click', onPlannerMapClick)
  map.on('error', onBasemapError)
  map.getCanvas().addEventListener('webglcontextlost', onPlannerWebGlLost, false)
  map.on('load', () => {
    finishBasemapSwitch()
    addPlannerLayers()
    updateMapSources()
    centerOnUserLocation()
  })
  window.setTimeout(() => {
    if (basemapSwitching.value) finishBasemapSwitch()
  }, 8000)
}

function onPlannerWebGlLost(ev: Event) {
  ev.preventDefault()
  if (webglRecoveryScheduled) return
  webglRecoveryScheduled = true
  console.warn('[planner] WebGL context lost — remounting')
  destroyPlannerMap()
  void nextTick(() => {
    webglRecoveryScheduled = false
    void initMap()
  })
}

function destroyPlannerMap() {
  geoLocateAlive = false
  stopPlannerLocation()
  abortPendingRoute()
  routing.value = false
  routingLong.value = false
  routingEnriching.value = false
  previewGen++
  previewPromise = null
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
  clearPreviewPois()
  if (addressTimer) clearTimeout(addressTimer)
  addressTimer = null
  cancelStyleReady?.()
  cancelStyleReady = null
  basemapSwitchGen++
  finishBasemapSwitch()
  setCyclosmOutageHandler(null)
  resizeObserver?.disconnect()
  resizeObserver = null
  routeCursorMarker?.remove()
  routeCursorMarker = null
  routeCursorEl = null
  routeCursor.value = null
  if (map) {
    try {
      map.off('error', onBasemapError)
      map.off('click', onPlannerMapClick)
      map.getCanvas().removeEventListener('webglcontextlost', onPlannerWebGlLost)
      map.remove()
    } catch (err) {
      console.warn('[planner] destroy failed:', err)
    }
  }
  map = null
}

function stopPlannerLocation() {
  if (locationWatchId != null) {
    navigator.geolocation.clearWatch(locationWatchId)
    locationWatchId = null
  }
  locationMarker?.remove()
  locationMarker = null
  lastGeoPos = null
}

function updatePlannerLocationMarker(lat: number, lng: number, heading: number | null) {
  if (!map) return
  if (!locationMarker) {
    const el = createUserLocationElement()
    locationMarker = new maplibregl.Marker({
      element: el,
      anchor: 'center',
      rotationAlignment: 'map',
      pitchAlignment: 'map',
    })
      .setLngLat([lng, lat])
      .addTo(map)
  } else {
    locationMarker.setLngLat([lng, lat])
  }
  setLocationMarkerHeading(locationMarker.getElement(), heading, false)
}

function onPlannerGeoPosition(pos: GeolocationPosition) {
  if (!geoLocateAlive || !map) return
  const lat = pos.coords.latitude
  const lng = pos.coords.longitude
  const heading = resolveGeoHeading(pos, lastGeoPos)
  lastGeoPos = { lat, lng }
  updatePlannerLocationMarker(lat, lng, heading)
}

/** Show Vienna immediately; fly to GPS + show nav triangle if permission granted. */
function centerOnUserLocation() {
  if (!map || !navigator.geolocation || !isSecureGeoContext()) return
  geoLocateAlive = true

  const onFix = (pos: GeolocationPosition) => {
    if (!geoLocateAlive || !map) return
    onPlannerGeoPosition(pos)
    // Don't yank the camera once the user has started placing waypoints
    if (waypoints.value.length > 0) return
    map.flyTo({
      center: [pos.coords.longitude, pos.coords.latitude],
      zoom: Math.max(map.getZoom(), USER_LOCATION_ZOOM),
      duration: 900,
    })
  }

  // One-shot for quick center (works with cached position); then watch for heading updates
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onFix(pos)
      if (!geoLocateAlive || locationWatchId != null) return
      locationWatchId = navigator.geolocation.watchPosition(
        onPlannerGeoPosition,
        () => {
          /* keep last marker */
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 }
      )
    },
    () => {
      /* keep Vienna fallback */
    },
    { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 120_000 }
  )
}

function applyStyleAndRestore(
  style: import('maplibre-gl').StyleSpecification,
  camera: {
    center: maplibregl.LngLat
    zoom: number
    bearing: number
    pitch: number
  },
  gen: number
) {
  if (!map || gen !== basemapSwitchGen) return

  let restored = false
  const restoreOverlays = () => {
    if (!map || restored || gen !== basemapSwitchGen) {
      finishBasemapSwitch()
      return
    }
    if (!map.isStyleLoaded()) {
      finishBasemapSwitch()
      return
    }
    if (map.getSource('planner-waypoints')) {
      restored = true
      updateMapSources()
      finishBasemapSwitch()
      return
    }
    try {
      map.jumpTo({
        center: camera.center,
        zoom: camera.zoom,
        bearing: camera.bearing,
        pitch: camera.pitch,
      })
      addPlannerLayers()
      updateMapSources()
      if (lastGeoPos) {
        updatePlannerLocationMarker(lastGeoPos.lat, lastGeoPos.lng, null)
      }
      restored = true
    } catch (err) {
      console.error('[planner] Overlay nach Kartenwechsel fehlgeschlagen:', err)
    } finally {
      finishBasemapSwitch()
    }
  }

  cancelStyleReady?.()
  map.setStyle(style, { diff: false })
  cancelStyleReady = whenStyleReady(map, restoreOverlays)
}

async function setBasemap(id: BasemapId, opts: { auto?: boolean } = {}) {
  if (!map || basemap.value === id) return
  const prevId = basemap.value
  const gen = ++basemapSwitchGen
  basemapErrorRetried = false
  basemapSwitching.value = true
  basemapFreezeUrl.value = captureMapFrame(map)

  const camera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }

  basemap.value = id
  if (!opts.auto) {
    saveBasemapPreference(id)
    clearBasemapFallbackHint()
  }

  try {
    const style = await preloadBasemapStyle(id)
    if (!map || gen !== basemapSwitchGen) return
    applyStyleAndRestore(style, camera, gen)
  } catch (err) {
    console.warn(`[planner] Basemap ${id} preload failed:`, err)
    if (!map || gen !== basemapSwitchGen) return
    const fallback = otherBasemap(id)
    try {
      const style = await preloadBasemapStyle(fallback)
      if (!map || gen !== basemapSwitchGen) return
      basemap.value = fallback
      if (!opts.auto) saveBasemapPreference(fallback)
      setFallbackHint(id)
      applyStyleAndRestore(style, camera, gen)
    } catch (fallbackErr) {
      console.error('[planner] Basemap fallback also failed:', fallbackErr)
      basemap.value = prevId
      basemapFallbackHint.value = t('mapCanvas.basemapSwitchFailed')
      basemapRetryId.value = id
      finishBasemapSwitch()
    }
  }
}

function onBasemapError(e: { error?: Error | string }) {
  if (!map || basemapRecovering) return
  if (!isBasemapStyleError(e.error)) return

  const failed = basemap.value
  const gen = basemapSwitchGen

  if (!basemapErrorRetried) {
    basemapErrorRetried = true
    console.warn('[planner] Basemap error — retrying once:', e.error)
    basemapSwitching.value = true
    void preloadBasemapStyle(failed)
      .then((style) => {
        if (!map || gen !== basemapSwitchGen) return
        const camera = {
          center: map.getCenter(),
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        }
        basemapFreezeUrl.value = captureMapFrame(map) ?? basemapFreezeUrl.value
        applyStyleAndRestore(style, camera, gen)
      })
      .catch(() => {
        basemapRecovering = true
        const fallback = otherBasemap(failed)
        console.warn(`[planner] Retry failed — falling back to ${fallback}`)
        setFallbackHint(failed)
        void setBasemap(fallback, { auto: true }).finally(() => {
          window.setTimeout(() => {
            basemapRecovering = false
          }, 2500)
        })
      })
    return
  }

  if (basemapRecovering) return
  basemapRecovering = true
  const fallback = otherBasemap(failed)
  console.warn(`[planner] Basemap ${failed} failed, fallback to ${fallback}:`, e.error)
  setFallbackHint(failed)
  void setBasemap(fallback, { auto: true }).finally(() => {
    window.setTimeout(() => {
      basemapRecovering = false
    }, 2500)
  })
}

function abortPendingRoute() {
  if (autoRouteTimer) {
    clearTimeout(autoRouteTimer)
    autoRouteTimer = null
  }
  routeAbort?.abort()
  routeAbort = null
}

function scheduleAutoRoute() {
  // Cancel prior debounce + in-flight ORS so shortest/streets toggles don't stack requests.
  abortPendingRoute()

  if (waypoints.value.length < 2) {
    routeCoords.value = []
    routeElevations.value = []
    routeSurfaceSummary.value = null
    routing.value = false
    routingLong.value = false
    routingEnriching.value = false
    updateMapSources()
    return
  }

  if (!isOrsConfigured()) return

  autoRouteTimer = setTimeout(() => {
    autoRouteTimer = null
    void calculateRoute()
  }, 450)
}

async function calculateRoute() {
  if (waypoints.value.length < 2) {
    routeCoords.value = []
    routeElevations.value = []
    routeSurfaceSummary.value = null
    routeCursor.value = null
    routingLong.value = false
    routingEnriching.value = false
    updateRouteCursorMarker()
    updateMapSources()
    return
  }

  routeAbort?.abort()
  const ac = new AbortController()
  routeAbort = ac
  const gen = ++routeGeneration
  formError.value = ''
  routing.value = true
  routingEnriching.value = false
  updateMapSources()

  const pts: LatLng[] = waypoints.value.map((w) => ({ lat: w.lat, lng: w.lng }))
  const longHop = isLongStraightRoute(pts)
  routingLong.value = longHop

  const commonOpts = {
    profile: cyclingProfileForSurface(surfacePreference.value),
    preference: orsPreferenceForSurface(surfacePreference.value),
    hillPreference: hillPreference.value,
    avoidSteps: true,
    signal: ac.signal,
  } as const

  try {
    // Long A–B (e.g. Wien–Bratislava): paint simplified geometry first, then enrich.
    // Short hops: one full call (avoids burning a second ORS request).
    if (longHop) {
      const preview = await fetchCyclingRoute(pts, { ...commonOpts, detail: 'preview' })
      if (gen !== routeGeneration || ac.signal.aborted) return
      routeCoords.value = preview.coordinates
      routeElevations.value = []
      routeSurfaceSummary.value = null
      routeCursor.value = null
      updateRouteCursorMarker()
      updateMapSources()

      routingEnriching.value = true
      const full = await fetchCyclingRoute(pts, { ...commonOpts, detail: 'full' })
      if (gen !== routeGeneration || ac.signal.aborted) return
      routeCoords.value = full.coordinates
      routeElevations.value = full.elevations
      routeSurfaceSummary.value = full.surfaceSummary
      routeCursor.value = null
      updateRouteCursorMarker()
      updateMapSources()
    } else {
      const result = await fetchCyclingRoute(pts, { ...commonOpts, detail: 'full' })
      if (gen !== routeGeneration || ac.signal.aborted) return
      routeCoords.value = result.coordinates
      routeElevations.value = result.elevations
      routeSurfaceSummary.value = result.surfaceSummary
      routeCursor.value = null
      updateRouteCursorMarker()
      updateMapSources()
    }
  } catch (err) {
    if (gen !== routeGeneration || isRouteAborted(err) || ac.signal.aborted) return
    // Keep previous geometry so a failed profile switch does not blank the map.
    formError.value = err instanceof Error ? err.message : t('planner.routeFailed')
  } finally {
    if (gen === routeGeneration) {
      routing.value = false
      routingLong.value = false
      routingEnriching.value = false
      if (routeAbort === ac) routeAbort = null
    }
  }
}

function plannerCourseName(): string {
  return (
    routeName.value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48) || t('planner.defaultName')
  )
}

function exportPlannerGpx() {
  if (!canExportRoute.value) return
  const name = plannerCourseName()
  const points = routePoints.value
  downloadFile(`${name}.gpx`, buildGpxExport(name, points, [], { markFavorites: false }))
  showExportMenu.value = false
}

async function exportPlannerFit() {
  if (!canExportRoute.value) return
  exporting.value = true
  formError.value = ''
  try {
    const { buildFitCourseExport } = await import('../services/fitCourse')
    const name = plannerCourseName()
    const points = routePoints.value
    const bytes = buildFitCourseExport(name, points, [])
    downloadBinary(`${name}.fit`, bytes, 'application/octet-stream')
    showExportMenu.value = false
  } catch (err) {
    console.error('[planner] FIT export failed', err)
    formError.value = err instanceof Error ? err.message : t('export.fitFailed')
  } finally {
    exporting.value = false
  }
}

async function createMap() {
  formError.value = ''
  store.clearError()

  if (waypoints.value.length < 2) {
    formError.value = t('planner.minWaypoints')
    return
  }

  creating.value = true
  try {
    if (!routeCoords.value.length) {
      await calculateRoute()
      if (!routeCoords.value.length) return
    }

    const name = routeName.value.trim() || t('planner.defaultName')
    if (previewTimer) {
      clearTimeout(previewTimer)
      previewTimer = null
      await loadPreviewPois()
    } else if (previewPromise) {
      await previewPromise
    }

    const key = corridorKey()
    const selectedSet = new Set(selected.value)
    const preloaded =
      key && key === previewCorridorKey
        ? previewPoisAll.value.filter((p) => selectedSet.has(p.category))
        : undefined

    await store.createMapFromRoute(
      name,
      routeCoords.value,
      radiusM.value,
      [...selected.value],
      routeElevations.value.length ? routeElevations.value : undefined,
      routeSurfaceSummary.value,
      preloaded
    )

    if (store.mapReady) {
      // Free planner WebGL before MapView creates its map (mobile context limit)
      destroyPlannerMap()
      await nextTick()
      await router.push('/map/view')
    } else if (store.error) {
      formError.value = store.error
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : t('planner.createFailed')
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void initMap()
  if (mapEl.value) {
    resizeObserver = new ResizeObserver(() => {
      map?.resize()
    })
    resizeObserver.observe(mapEl.value)
  }
})

onUnmounted(() => {
  destroyPlannerMap()
})
</script>

<template>
  <div
    class="route-planner"
    :class="{ 'controls-expanded': controlsOpen }"
    @keydown.escape="closeExportMenu"
  >
    <div class="planner-map-wrap">
      <div ref="mapEl" class="planner-map" />
      <div
        v-if="basemapSwitching"
        class="basemap-loading"
        :style="basemapFreezeUrl ? { backgroundImage: `url(${basemapFreezeUrl})` } : undefined"
        role="status"
        aria-live="polite"
      >
        <span class="basemap-loading-spinner" aria-hidden="true" />
        <span>{{ t('mapCanvas.basemapLoading') }}</span>
      </div>
      <div v-if="routeKm > 0 || routing" class="route-km-badge" aria-live="polite">
        <template v-if="routeKm > 0">
          <strong>{{ routeKm.toFixed(1) }}</strong>
          <span>km</span>
          <template v-if="elevationStats">
            <span class="badge-sep" aria-hidden="true">·</span>
            <span class="badge-elev">↑{{ Math.round(elevationStats.ascentM) }} m</span>
          </template>
        </template>
        <template v-else>{{ routeDrawingLabel }}</template>
      </div>
      <p v-if="basemapFallbackHint" class="basemap-fallback" role="status">
        {{ basemapFallbackHint }}
        <button type="button" @click="clearBasemapFallbackHint(); setBasemap(basemapRetryId)">
          {{
            basemapRetryId === 'standard'
              ? t('mapCanvas.basemapRetry')
              : t('mapCanvas.basemapRetryCycling')
          }}
        </button>
      </p>
      <ul
        v-if="routeColorMode === 'surface' && surfaceLegendBuckets.length"
        class="surface-legend"
        :aria-label="t('elevation.surfaceTitle')"
      >
        <li v-for="b in surfaceLegendBuckets" :key="b.id">
          <span class="surface-dot" :style="{ background: SURFACE_COLORS[b.id] }" />
          <span>{{ t(SURFACE_I18N_KEYS[b.id]) }} {{ b.percent }}%</span>
        </li>
      </ul>
      <ul
        v-if="routeColorMode === 'grade'"
        class="surface-legend grade-legend"
        :aria-label="t('legend.gradeTitle')"
      >
        <li v-for="g in gradeLegendItems" :key="g.label">
          <span class="grade-bar" :style="{ background: g.color }" />
          <span>{{ g.label }}</span>
        </li>
      </ul>
      <div
        v-if="showRouteColorToggle"
        class="route-color-toggle"
        role="group"
        :aria-label="t('mapCanvas.routeColorMode')"
      >
        <button
          type="button"
          :class="{ active: routeColorMode === 'surface' }"
          :aria-pressed="routeColorMode === 'surface'"
          :disabled="!canRouteSurface"
          :title="canRouteSurface ? undefined : t('elevation.surfaceDrawnOnly')"
          @click="setRouteColorMode('surface')"
        >
          {{ t('mapCanvas.routeColorSurface') }}
        </button>
        <button
          type="button"
          :class="{ active: routeColorMode === 'grade' }"
          :aria-pressed="routeColorMode === 'grade'"
          :disabled="!canRouteGrade"
          @click="setRouteColorMode('grade')"
        >
          {{ t('mapCanvas.routeColorGrade') }}
        </button>
      </div>
      <div class="basemap-toggle" role="group" :aria-label="t('mapCanvas.basemap')">
        <button
          type="button"
          :class="{ active: basemap === 'standard' }"
          @click="setBasemap('standard')"
        >
          {{ t('mapCanvas.map') }}
        </button>
        <button
          type="button"
          :class="{ active: basemap === 'cycling' }"
          :title="t('mapCanvas.cycling')"
          @click="setBasemap('cycling')"
        >
          {{ t('mapCanvas.cycling') }}
        </button>
      </div>
      <p class="map-hint">
        <template v-if="routing">{{ mapRoutingHint }}</template>
        <template v-else-if="canCloseLoop">{{ t('planner.mapHintLoop') }}</template>
        <template v-else>{{ t('planner.mapHintClick') }}</template>
      </p>

      <div v-if="showExportMenu" class="export-menu-backdrop" @click="closeExportMenu" />
      <div v-if="showExportMenu" class="export-menu" role="menu" @click.stop>
        <header class="export-menu-head">
          <strong>{{ t('planner.exportRouteTitle') }}</strong>
          <p>{{ t('planner.exportRouteHint') }}</p>
        </header>
        <label class="export-name-field">
          <span>{{ t('planner.routeName') }}</span>
          <input
            v-model="routeName"
            type="text"
            maxlength="48"
            :placeholder="t('planner.routeNamePlaceholder')"
            @keydown.stop
          />
        </label>
        <button
          type="button"
          class="export-item"
          role="menuitem"
          :disabled="!canExportRoute"
          @click="exportPlannerGpx"
        >
          <span class="export-icon">↓</span>
          <span class="export-text">
            <strong>{{ t('planner.exportGpx') }}</strong>
          </span>
        </button>
        <button
          type="button"
          class="export-item"
          role="menuitem"
          :disabled="!canExportRoute"
          @click="void exportPlannerFit()"
        >
          <span class="export-icon">↓</span>
          <span class="export-text">
            <strong>{{ exporting ? t('planner.exporting') : t('planner.exportFit') }}</strong>
          </span>
        </button>
      </div>
    </div>

    <PlannerElevationProfile
      v-if="showElevation"
      :points="routePoints"
      :surface-summary="routeSurfaceSummary"
      @update:cursor="onElevationCursor"
    />

    <div
      class="planner-controls"
      :class="{ 'sheet-collapsed': !controlsOpen, 'has-poi-next': routeReadyForPois }"
    >
      <button
        type="button"
        class="controls-sheet-toggle"
        :aria-expanded="controlsOpen"
        :aria-label="controlsOpen ? t('planner.controlsCollapse') : t('planner.controlsExpand')"
        @click="toggleControlsSheet"
      >
        <span class="sheet-handle" aria-hidden="true" />
        <span class="sheet-toggle-main">
          <span class="sheet-title">{{ t('planner.controlsTitle') }}</span>
          <span class="sheet-summary">{{ controlsSummary }}</span>
        </span>
        <span class="sheet-chevron" aria-hidden="true">{{ controlsOpen ? '▾' : '▴' }}</span>
      </button>

      <div class="controls-sheet-body">
      <!-- POI options first once route exists — discoverability of next step -->
      <template v-if="showPoiOptions && routeReadyForPois">
        <fieldset class="categories">
          <legend>{{ t('planner.poiCategories') }}</legend>
          <div class="category-grid">
            <button
              v-for="cat in POI_CATEGORY_DEFS"
              :key="cat.id"
              type="button"
              class="cat-chip"
              :class="{ active: selected.includes(cat.id) }"
              @click="toggleCategory(cat.id)"
            >
              <span>{{ cat.icon }}</span>
              {{ poiCategoryLabel(cat.id) }}
            </button>
          </div>
        </fieldset>

        <label class="field">
          <span class="field-label">{{ t('gpx.maxDist') }}</span>
          <div class="radius-row">
            <input
              v-model.number="radiusM"
              type="range"
              :min="MIN_POI_RADIUS_M"
              :max="MAX_POI_RADIUS_M"
              step="10"
            />
            <span>{{ radiusM }} m</span>
          </div>
        </label>
      </template>

      <div class="address-search">
        <label class="field-label" for="address-input">{{ t('planner.searchAddress') }}</label>
        <div class="search-wrap">
          <input
            id="address-input"
            v-model="addressQuery"
            type="search"
            class="text-input"
            :placeholder="t('planner.searchPlaceholder')"
            autocomplete="off"
            :disabled="!isOrsConfigured()"
            @input="onAddressInput"
            @keydown.enter.prevent="pickFirstResult"
          />
          <ul v-if="addressResults.length" class="search-results" @mousedown.prevent>
            <li v-for="(r, i) in addressResults" :key="`${r.lat}-${r.lng}-${i}`" @click="pickAddress(r)">
              {{ r.label }}
            </li>
          </ul>
        </div>
        <p v-if="addressSearching" class="search-status">{{ t('planner.searching') }}</p>
        <p v-else-if="addressError" class="search-error">{{ addressError }}</p>
        <p v-else class="search-hint">{{ t('planner.searchHint') }}</p>
      </div>

      <div class="waypoint-panel">
        <div class="panel-head">
          <h3>{{ t('planner.waypoints') }} ({{ waypoints.length }})</h3>
          <div class="panel-actions">
            <button type="button" class="btn-ghost" :disabled="!canCloseLoop" @click="closeLoop">
              {{ t('planner.closeLoop') }}
            </button>
            <button type="button" class="btn-ghost" :disabled="!waypoints.length" @click="undoWaypoint">
              {{ t('planner.undo') }}
            </button>
            <button type="button" class="btn-ghost" :disabled="!waypoints.length" @click="clearAll">
              {{ t('planner.clearAll') }}
            </button>
          </div>
        </div>

        <div v-if="routeKm > 0" class="route-km-card">
          <span class="route-km-label">{{ t('planner.distance') }}</span>
          <span class="route-km-value">
            {{ routeKm.toFixed(1) }} <small>km</small>
            <template v-if="elevationStats">
              <small class="route-elev">↑{{ Math.round(elevationStats.ascentM) }} m</small>
            </template>
          </span>
        </div>
        <p v-else-if="waypoints.length >= 2 && routing" class="route-km muted">{{ routeDrawingLabel }}</p>

        <ul v-if="waypoints.length" class="waypoint-list">
          <li v-for="(wp, i) in waypoints" :key="wp.id">
            <span class="wp-label">{{ waypointLabel(i, waypoints.length) }}</span>
            <span class="wp-coords">{{ waypointDisplay(wp) }}</span>
            <button
              v-if="i === 0 && canCloseLoop"
              type="button"
              class="wp-loop"
              :title="t('planner.setAsEnd')"
              @click="closeLoop"
            >
              ↺
            </button>
            <button type="button" class="wp-remove" :title="t('planner.remove')" @click="removeWaypoint(wp.id)">×</button>
          </li>
        </ul>
        <p v-else class="empty-hint">{{ t('planner.emptyWaypoints') }}</p>
      </div>

      <label v-if="showPoiOptions" class="field">
        <span class="field-label">{{ t('planner.routeName') }}</span>
        <input v-model="routeName" type="text" class="text-input" :placeholder="t('planner.routeNamePlaceholder')" />
      </label>

      <div v-if="!isOrsConfigured()" class="ors-warning">
        <strong>{{ t('planner.orsMissing') }}</strong>
        <p>{{ t('planner.orsHint') }}</p>
      </div>

      <template v-if="showRoutingOptions">
        <fieldset class="routing-options">
          <legend>{{ t('planner.surfaceTitle') }}</legend>
          <div class="option-grid">
            <button
              v-for="s in SURFACE_PREFERENCES"
              :key="s"
              type="button"
              class="option-chip"
              :class="{ active: surfacePreference === s }"
              @click="setSurfacePreference(s)"
            >
              {{ t(`planner.surface.${s}`) }}
            </button>
          </div>
        </fieldset>

        <fieldset class="routing-options">
          <legend>{{ t('planner.hillTitle') }}</legend>
          <div class="option-grid">
            <button
              v-for="h in HILL_PREFERENCES"
              :key="h"
              type="button"
              class="option-chip"
              :class="{ active: hillPreference === h }"
              @click="setHillPreference(h)"
            >
              {{ t(`planner.hill.${h}`) }}
            </button>
          </div>
        </fieldset>
      </template>

      <!-- POIs while route still calculating: keep options reachable without sticky CTA -->
      <template v-if="showPoiOptions && !routeReadyForPois">
        <label class="field">
          <span class="field-label">{{ t('gpx.maxDist') }}</span>
          <div class="radius-row">
            <input
              v-model.number="radiusM"
              type="range"
              :min="MIN_POI_RADIUS_M"
              :max="MAX_POI_RADIUS_M"
              step="10"
            />
            <span>{{ radiusM }} m</span>
          </div>
        </label>

        <fieldset class="categories">
          <legend>{{ t('planner.poiCategories') }}</legend>
          <div class="category-grid">
            <button
              v-for="cat in POI_CATEGORY_DEFS"
              :key="cat.id"
              type="button"
              class="cat-chip"
              :class="{ active: selected.includes(cat.id) }"
              @click="toggleCategory(cat.id)"
            >
              <span>{{ cat.icon }}</span>
              {{ poiCategoryLabel(cat.id) }}
            </button>
          </div>
        </fieldset>

        <p v-if="formError || store.error" class="error">{{ formError || store.error }}</p>

        <button type="button" class="btn-primary btn-cta-gold btn-full" :disabled="!canCreate" @click="createMap">
          {{ createMapLabel }}
        </button>
      </template>
      </div>

      <!-- Mobile: footer when sheet open; under handle when collapsed. Desktop: sticky top via CSS order. -->
      <div v-if="routeReadyForPois" class="poi-next-step">
        <p class="poi-next-hint">
          {{ previewingPois ? t('planner.previewingPois') : t('planner.nextStepPois') }}
        </p>
        <button
          type="button"
          class="btn-primary btn-cta-gold btn-full"
          :disabled="!canCreate"
          @click="createMap"
        >
          {{ createMapLabel }}
        </button>
        <p v-if="formError || store.error" class="error poi-next-error">
          {{ formError || store.error }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-planner {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    'controls map'
    'controls elev';
  background: var(--bg);
}

.planner-map-wrap {
  grid-area: map;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.route-planner > :deep(.planner-elev) {
  grid-area: elev;
}

.planner-map {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.map-hint {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  margin: 0;
  padding: 0.35rem 0.55rem;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  font-size: 0.78rem;
  color: #374151;
  pointer-events: none;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
  z-index: 2;
}

.surface-legend {
  position: absolute;
  left: 0.75rem;
  bottom: 2.85rem;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.55rem;
  margin: 0;
  padding: 0.3rem 0.5rem;
  list-style: none;
  max-width: min(92%, 20rem);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}

.surface-legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #111;
  line-height: 1.1;
}

.surface-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.grade-legend .grade-bar {
  width: 12px;
  height: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}

:deep(.route-bike-cursor) {
  position: relative;
  width: 26px;
  height: 26px;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(45, 106, 79, 0.35));
}

:deep(.route-bike-icon) {
  position: absolute;
  inset: 1px;
  width: 24px;
  height: 24px;
  opacity: 0.9;
  filter: drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.9));
}

.route-km-badge {
  position: absolute;
  top: 10px;
  right: 52px;
  z-index: 3;
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.45rem 0.7rem;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.route-km-badge strong {
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}

.route-km-badge span {
  font-size: 0.85rem;
  font-weight: 700;
  opacity: 0.9;
}

.badge-sep {
  opacity: 0.55;
  margin: 0 0.05rem;
}

.badge-elev {
  font-size: 0.78rem !important;
  font-weight: 700 !important;
  opacity: 0.95 !important;
}

.export-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: transparent;
}

.export-menu {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 41;
  width: min(320px, calc(100% - 20px));
  padding: 0.65rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.export-menu-head {
  padding: 0.15rem 0.25rem 0.35rem;
}

.export-menu-head strong {
  display: block;
  font-size: 0.95rem;
}

.export-menu-head p {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.export-name-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.35rem 0.25rem 0.45rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.export-name-field input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  font-weight: 500;
  color: var(--text);
  background: var(--bg);
}

.export-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2, var(--bg));
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--text);
}

.export-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-item:not(:disabled):hover {
  border-color: var(--primary);
}

.export-icon {
  font-weight: 800;
  font-size: 1rem;
}

.export-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.export-text strong {
  font-size: 0.88rem;
}

.basemap-toggle {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  display: flex;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.route-color-toggle {
  position: absolute;
  top: 48px;
  left: 10px;
  z-index: 3;
  display: flex;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.route-color-toggle button {
  border: none;
  background: transparent;
  padding: 0.4rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}

.route-color-toggle button + button {
  border-left: 1px solid #e5e7eb;
}

.route-color-toggle button.active {
  background: #111;
  color: #fff;
}

.route-color-toggle button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.basemap-fallback {
  position: absolute;
  top: 52px;
  left: 10px;
  right: 10px;
  z-index: 4;
  margin: 0;
  padding: 0.55rem 0.7rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  font-size: 0.8rem;
  line-height: 1.35;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.basemap-loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  background-color: rgba(248, 250, 252, 0.72);
  background-size: cover;
  background-position: center;
  color: #0f172a;
  font-size: 0.85rem;
  font-weight: 600;
  pointer-events: none;
}

.basemap-loading-spinner {
  width: 1.55rem;
  height: 1.55rem;
  border: 2.5px solid rgba(15, 23, 42, 0.2);
  border-top-color: #0f172a;
  border-radius: 50%;
  animation: basemap-spin 0.7s linear infinite;
}

@keyframes basemap-spin {
  to {
    transform: rotate(360deg);
  }
}

.basemap-fallback button {
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: transparent;
  color: #fff;
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.basemap-toggle button {
  border: none;
  background: transparent;
  padding: 0.45rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}

.basemap-toggle button + button {
  border-left: 1px solid #e5e7eb;
}

.basemap-toggle button.active {
  background: #111;
  color: #fff;
}

.planner-controls {
  grid-area: controls;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 1rem 1.1rem 1.25rem;
  background: var(--surface);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.05);
}

.controls-sheet-toggle {
  display: none;
}

.controls-sheet-body {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}

.poi-next-step {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  flex-shrink: 0;
  order: -1;
  padding: 0.55rem 0 0.65rem;
  margin: 0 0 0.35rem;
  background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 4;
}

.poi-next-hint {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary);
  line-height: 1.35;
}

.poi-next-error {
  margin-top: 0.15rem;
}

.address-search {
  position: relative;
}

.search-wrap {
  position: relative;
}

.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-height: 200px;
  overflow-y: auto;
}

.search-results li {
  padding: 0.55rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1.35;
}

.search-results li:hover {
  background: var(--surface-2);
}

.search-status,
.search-hint,
.search-error {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
}

.search-hint {
  color: var(--text-muted);
}

.search-error {
  color: var(--danger);
}

.waypoint-panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.85rem;
  background: var(--surface-2);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.panel-head h3 {
  margin: 0;
  font-size: 0.9rem;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
}

.btn-ghost {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 0.75rem;
  cursor: pointer;
}

.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.waypoint-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 140px;
  overflow-y: auto;
}

.waypoint-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
}

.wp-label {
  font-weight: 600;
  color: var(--primary);
  min-width: 2.5rem;
  flex-shrink: 0;
}

.wp-coords {
  flex: 1;
  color: var(--text-muted);
  line-height: 1.35;
  word-break: break-word;
}

.wp-remove {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: #fee2e2;
  color: #991b1b;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  flex-shrink: 0;
}

.empty-hint,
.route-km {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.route-km-card {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.15rem 0 0.65rem;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
}

.route-km-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.route-km-value {
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--primary-dark);
  letter-spacing: -0.03em;
  line-height: 1;
}

.route-km-value small {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--primary);
}

.route-km {
  font-weight: 600;
  color: var(--primary);
}

.route-km.muted {
  font-weight: 500;
  color: var(--text-muted);
}

.wp-loop {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: color-mix(in srgb, var(--primary) 16%, var(--surface));
  color: var(--primary-dark);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  flex-shrink: 0;
}

.wp-loop:hover {
  background: color-mix(in srgb, var(--primary) 28%, var(--surface));
}

.field-label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.45rem;
  font-size: 0.9rem;
}

.text-input,
.select-input {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
}

.ors-warning {
  padding: 0.75rem;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  font-size: 0.85rem;
}

.ors-warning p {
  margin: 0.35rem 0 0;
  line-height: 1.4;
}

.radius-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.radius-row input[type='range'] {
  flex: 1;
}

.categories {
  border: none;
  padding: 0;
}

.categories legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.9rem;
  -webkit-tap-highlight-color: transparent;
}

.cat-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

@media (min-width: 769px) {
  .cat-chip {
    padding: 0.4rem 0.75rem;
    min-height: 0;
    font-size: 0.85rem;
  }
}

.routing-options {
  border: none;
  margin: 0;
  padding: 0;
}

.routing-options legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.7rem;
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
}

.option-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.route-elev {
  margin-left: 0.45rem;
  font-weight: 700;
  color: var(--text-muted);
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
  margin: 0;
}

.btn-primary {
  padding: 0.85rem 1.5rem;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.btn-full {
  width: 100%;
}

.btn-cta-gold {
  background: linear-gradient(180deg, #f8e08e 0%, #e0b429 48%, #c9940a 100%);
  color: #1a1408;
  font-weight: 800;
  border: 1px solid #b8860b;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.45) inset,
    0 6px 16px rgba(201, 148, 10, 0.42);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.28);
}

.btn-cta-gold:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: wait;
}

.btn-cta-gold:disabled {
  opacity: 0.7;
  filter: grayscale(0.12);
}

@media (max-width: 899px) {
  .route-planner {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(52vh, 1fr) auto auto;
    grid-template-areas:
      'map'
      'elev'
      'controls';
  }

  .planner-map-wrap {
    min-height: 52vh;
  }

  /* Planning open: shrink map so the sheet has real scroll room */
  .route-planner.controls-expanded {
    grid-template-rows: minmax(22vh, 0.35fr) auto auto;
  }

  .route-planner.controls-expanded .planner-map-wrap {
    min-height: 22vh;
  }

  .route-planner.controls-expanded :deep(.planner-elev:not(.collapsed)) {
    max-height: 28vh;
    overflow: auto;
  }

  .surface-legend {
    left: 0.5rem;
    bottom: 2.4rem;
    max-width: min(78%, 14rem);
    padding: 0.22rem 0.4rem;
    gap: 0.12rem 0.35rem;
  }

  .surface-legend li {
    font-size: 0.62rem;
  }

  .surface-dot,
  .grade-legend .grade-bar {
    width: 0.4rem;
    height: 0.4rem;
  }

  .grade-legend .grade-bar {
    width: 10px;
    height: 3px;
  }

  .map-hint {
    font-size: 0.7rem;
    padding: 0.28rem 0.45rem;
    max-width: calc(100% - 1.5rem);
  }

  .route-color-toggle,
  .basemap-toggle {
    transform: scale(0.92);
    transform-origin: top left;
  }

  .planner-controls {
    /* Open sheet: dominant scroll area for categories / waypoints */
    max-height: min(78dvh, 720px);
    height: auto;
    border-right: none;
    border-top: 1px solid var(--border);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
    padding: 0;
    gap: 0;
    overflow: hidden;
    border-radius: 14px 14px 0 0;
    display: flex;
    flex-direction: column;
  }

  .planner-controls.sheet-collapsed {
    max-height: none;
  }

  .planner-controls.sheet-collapsed .controls-sheet-body {
    display: none;
  }

  /* Open: CTA as sticky footer under scrollable options (DOM order after body) */
  .planner-controls:not(.sheet-collapsed) .poi-next-step {
    order: 0;
    position: relative;
    top: auto;
    margin: 0;
    border-bottom: none;
    border-top: 1px solid var(--border);
    padding: 0.75rem 1rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
    background: color-mix(in srgb, var(--primary) 8%, var(--surface));
    box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.06);
  }

  .planner-controls.sheet-collapsed.has-poi-next {
    padding-bottom: 0;
  }

  /* Collapsed: CTA under handle, still discoverable */
  .planner-controls.sheet-collapsed .poi-next-step {
    order: 0;
    position: relative;
    top: auto;
    margin: 0;
    border-bottom: none;
    border-top: 1px solid var(--border);
    padding: 0.7rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .controls-sheet-toggle {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    flex-shrink: 0;
    padding: 0.95rem 1rem 0.85rem;
    border: none;
    background: var(--surface-2);
    cursor: pointer;
    text-align: left;
    color: var(--text);
    min-height: 52px;
    -webkit-tap-highlight-color: transparent;
  }

  .sheet-handle {
    position: absolute;
    top: 0.35rem;
    left: 50%;
    width: 2.25rem;
    height: 0.28rem;
    margin-left: -1.125rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 45%, transparent);
    pointer-events: none;
  }

  .sheet-toggle-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .sheet-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .sheet-summary {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sheet-chevron {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.1rem;
    font-weight: 700;
  }

  .controls-sheet-body {
    flex: 1 1 auto;
    min-height: 12rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 0.75rem 1rem 1rem;
    max-height: none;
  }

  .planner-controls:not(.sheet-collapsed) {
    flex: 1 1 auto;
    min-height: min(55dvh, 520px);
    max-height: min(78dvh, 720px);
    border-top-color: var(--border);
    padding-bottom: 0;
  }

  .planner-controls:not(.sheet-collapsed) .controls-sheet-toggle {
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
}
</style>
