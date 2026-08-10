<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLng, PoiCategory, RouteSurfaceSummary } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  MAX_POI_RADIUS_M,
  MIN_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { ROUTE_COLOR, ROUTE_CASING, MAP_LABEL_FONT, basemapStyle, loadBasemapPreference, saveBasemapPreference, KM_MARKER_INTERVAL_KM, isBasemapStyleError, whenStyleReady, remapOpenFreeMapGlyphRequest, type BasemapId } from '../config/mapStyle'
import {
  fetchCyclingRoute,
  isOrsConfigured,
  searchAddresses,
  CYCLING_PROFILES,
  type CyclingProfile,
  type HillPreference,
  type GeocodeResult,
} from '../services/routing'
import { totalRouteKm, buildRoutePoints, buildKmMarkers } from '../utils/route'
import { buildGpxExport, downloadFile, downloadBinary } from '../services/export'
import { poiCategoryLabel } from '../utils/poiLabels'
import { ensureRouteEndImages, routeEndIconId } from '../utils/routeEndIcons'
import { isSecureGeoContext } from '../utils/geoDevice'
import {
  createUserLocationElement,
  resolveGeoHeading,
  setLocationMarkerHeading,
} from '../utils/userLocationMarker'

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

const waypoints = ref<Waypoint[]>([])
const routeCoords = ref<[number, number][]>([])
const routeElevations = ref<number[]>([])
const routeSurfaceSummary = ref<RouteSurfaceSummary | null>(null)
const routeName = ref('')
const cyclingProfile = ref<CyclingProfile>('cycling-regular')
const hillPreference = ref<HillPreference>('balanced')
const radiusM = ref(DEFAULT_POI_RADIUS_M)
const selected = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
const formError = ref('')
const routing = ref(false)
const creating = ref(false)
const exporting = ref(false)
const basemap = ref<BasemapId>(loadBasemapPreference())
const basemapFallbackHint = ref('')
let cancelStyleReady: (() => void) | null = null
let basemapRecovering = false
/** Ignore late geolocation results after unmount or after user started drawing. */
let geoLocateAlive = false
let locationWatchId: number | null = null
let locationMarker: maplibregl.Marker | null = null
let lastGeoPos: { lat: number; lng: number } | null = null

const addressQuery = ref('')
const addressResults = ref<GeocodeResult[]>([])
const addressSearching = ref(false)
const addressError = ref('')

const routeKm = computed(() => {
  if (!routeCoords.value.length) return 0
  return totalRouteKm(buildRoutePoints(routeCoords.value, routeElevations.value))
})

const canCreate = computed(
  () => waypoints.value.length >= 2 && routeCoords.value.length >= 2 && !routing.value && !creating.value
)

const canExportRoute = computed(
  () => routeCoords.value.length >= 2 && !routing.value && !exporting.value
)

const showPoiOptions = computed(() => waypoints.value.length >= 2)

const showRoutingOptions = computed(() => waypoints.value.length >= 2 && isOrsConfigured())

function setCyclingProfile(profile: CyclingProfile) {
  if (cyclingProfile.value === profile) return
  cyclingProfile.value = profile
  scheduleAutoRoute()
}

function setHillPreference(hill: HillPreference) {
  if (hillPreference.value === hill) return
  hillPreference.value = hill
  scheduleAutoRoute()
}

function hasDraft() {
  return waypoints.value.length > 0
}

defineExpose({ hasDraft })

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
  ;(map.getSource('planner-preview') as maplibregl.GeoJSONSource)?.setData(previewGeoJson())
  ;(map.getSource('planner-km-markers') as maplibregl.GeoJSONSource)?.setData(kmMarkerGeoJson())
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
  map.addSource('planner-preview', { type: 'geojson', data: previewGeoJson() })
  map.addSource('planner-km-markers', { type: 'geojson', data: kmMarkerGeoJson() })

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

  map.addLayer({
    id: 'planner-route-line',
    type: 'line',
    source: 'planner-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': 4,
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
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, -3.35],
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

function initMap() {
  if (!mapEl.value || map) return

  map = new maplibregl.Map({
    container: mapEl.value,
    style: basemapStyle(basemap.value),
    center: VIENNA_CENTER,
    zoom: VIENNA_ZOOM,
    transformRequest: (url) => ({ url: remapOpenFreeMapGlyphRequest(url) }),
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('click', onPlannerMapClick)
  map.on('error', onBasemapError)
  map.on('load', () => {
    addPlannerLayers()
    updateMapSources()
    centerOnUserLocation()
  })
}

function destroyPlannerMap() {
  geoLocateAlive = false
  stopPlannerLocation()
  if (autoRouteTimer) clearTimeout(autoRouteTimer)
  autoRouteTimer = null
  if (addressTimer) clearTimeout(addressTimer)
  addressTimer = null
  cancelStyleReady?.()
  cancelStyleReady = null
  resizeObserver?.disconnect()
  resizeObserver = null
  if (map) {
    try {
      map.off('error', onBasemapError)
      map.off('click', onPlannerMapClick)
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

function clearBasemapFallbackHint() {
  basemapFallbackHint.value = ''
}

function setBasemap(id: BasemapId, opts: { auto?: boolean } = {}) {
  if (!map || basemap.value === id) return
  basemap.value = id
  if (!opts.auto) {
    saveBasemapPreference(id)
    clearBasemapFallbackHint()
  }

  const center = map.getCenter()
  const zoom = map.getZoom()
  const bearing = map.getBearing()
  const pitch = map.getPitch()

  let restored = false
  const restoreOverlays = () => {
    if (!map || restored) return
    if (!map.isStyleLoaded()) return
    if (map.getSource('planner-waypoints')) {
      restored = true
      updateMapSources()
      return
    }
    try {
      map.jumpTo({ center, zoom, bearing, pitch })
      addPlannerLayers()
      updateMapSources()
      restored = true
    } catch (err) {
      console.error('[planner] Overlay nach Kartenwechsel fehlgeschlagen:', err)
    }
  }

  cancelStyleReady?.()
  map.setStyle(basemapStyle(id), { diff: false })
  cancelStyleReady = whenStyleReady(map, restoreOverlays)
}

function onBasemapError(e: { error?: Error | string }) {
  if (!map || basemapRecovering) return
  if (!isBasemapStyleError(e.error)) return
  if (basemap.value !== 'standard') return

  basemapRecovering = true
  console.warn('[planner] Basiskarte fehlgeschlagen, Fallback auf Radkarte:', e.error)
  basemapFallbackHint.value = t('mapCanvas.basemapFallback')
  setBasemap('cycling', { auto: true })
  window.setTimeout(() => {
    basemapRecovering = false
  }, 2500)
}

function scheduleAutoRoute() {
  if (autoRouteTimer) clearTimeout(autoRouteTimer)

  if (waypoints.value.length < 2) {
    routeCoords.value = []
    updateMapSources()
    return
  }

  if (!isOrsConfigured()) return

  autoRouteTimer = setTimeout(() => {
    void calculateRoute()
  }, 400)
}

async function calculateRoute() {
  if (waypoints.value.length < 2) {
    routeCoords.value = []
    routeElevations.value = []
    routeSurfaceSummary.value = null
    updateMapSources()
    return
  }

  const gen = ++routeGeneration
  formError.value = ''
  routing.value = true
  updateMapSources()

  try {
    const pts: LatLng[] = waypoints.value.map((w) => ({ lat: w.lat, lng: w.lng }))
    const result = await fetchCyclingRoute(pts, {
      profile: cyclingProfile.value,
      hillPreference: hillPreference.value,
      avoidSteps: true,
    })
    if (gen !== routeGeneration) return
    routeCoords.value = result.coordinates
    routeElevations.value = result.elevations
    routeSurfaceSummary.value = result.surfaceSummary
    updateMapSources()
  } catch (err) {
    if (gen !== routeGeneration) return
    routeCoords.value = []
    routeElevations.value = []
    routeSurfaceSummary.value = null
    updateMapSources()
    formError.value = err instanceof Error ? err.message : t('planner.routeFailed')
  } finally {
    if (gen === routeGeneration) routing.value = false
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
  const points = buildRoutePoints(routeCoords.value, routeElevations.value)
  downloadFile(`${name}.gpx`, buildGpxExport(name, points, [], { markFavorites: false }))
}

async function exportPlannerFit() {
  if (!canExportRoute.value) return
  exporting.value = true
  formError.value = ''
  try {
    const { buildFitCourseExport } = await import('../services/fitCourse')
    const name = plannerCourseName()
    const points = buildRoutePoints(routeCoords.value, routeElevations.value)
    const bytes = buildFitCourseExport(name, points, [])
    downloadBinary(`${name}.fit`, bytes, 'application/octet-stream')
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
    await store.createMapFromRoute(
      name,
      routeCoords.value,
      radiusM.value,
      [...selected.value],
      routeElevations.value.length ? routeElevations.value : undefined,
      routeSurfaceSummary.value
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
  initMap()
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
  <div class="route-planner">
    <div class="planner-map-wrap">
      <div ref="mapEl" class="planner-map" />
      <div v-if="routeKm > 0 || routing" class="route-km-badge" aria-live="polite">
        <template v-if="routeKm > 0">
          <strong>{{ routeKm.toFixed(1) }}</strong>
          <span>km</span>
        </template>
        <template v-else>{{ t('planner.routeDrawing') }}</template>
      </div>
      <p v-if="basemapFallbackHint" class="basemap-fallback" role="status">
        {{ basemapFallbackHint }}
        <button type="button" @click="clearBasemapFallbackHint(); setBasemap('standard')">
          {{ t('mapCanvas.basemapRetry') }}
        </button>
      </p>
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
        <template v-if="routing">{{ t('planner.mapHintRouting') }}</template>
        <template v-else-if="canCloseLoop">{{ t('planner.mapHintLoop') }}</template>
        <template v-else>{{ t('planner.mapHintClick') }}</template>
      </p>
    </div>

    <div class="planner-controls">
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
          <span class="route-km-value">{{ routeKm.toFixed(1) }} <small>km</small></span>
        </div>
        <p v-else-if="waypoints.length >= 2 && routing" class="route-km muted">{{ t('planner.routeDrawing') }}</p>

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
          <legend>{{ t('planner.profileTitle') }}</legend>
          <p class="routing-hint">{{ t('planner.profileHint') }}</p>
          <div class="option-grid">
            <button
              v-for="p in CYCLING_PROFILES"
              :key="p"
              type="button"
              class="option-chip"
              :class="{ active: cyclingProfile === p }"
              @click="setCyclingProfile(p)"
            >
              {{ t(`planner.profile.${p}`) }}
            </button>
          </div>
        </fieldset>

        <fieldset class="routing-options">
          <legend>{{ t('planner.hillTitle') }}</legend>
          <p class="routing-hint">{{ t('planner.hillHint') }}</p>
          <div class="option-grid">
            <button
              type="button"
              class="option-chip"
              :class="{ active: hillPreference === 'flat' }"
              @click="setHillPreference('flat')"
            >
              {{ t('planner.hill.flat') }}
            </button>
            <button
              type="button"
              class="option-chip"
              :class="{ active: hillPreference === 'balanced' }"
              @click="setHillPreference('balanced')"
            >
              {{ t('planner.hill.balanced') }}
            </button>
            <button
              type="button"
              class="option-chip"
              :class="{ active: hillPreference === 'steep' }"
              @click="setHillPreference('steep')"
            >
              {{ t('planner.hill.steep') }}
            </button>
          </div>
        </fieldset>
      </template>

      <template v-if="showPoiOptions">
        <div v-if="canExportRoute || routing" class="export-route-block">
          <p class="export-route-label">{{ t('planner.exportRouteTitle') }}</p>
          <p class="routing-hint">{{ t('planner.exportRouteHint') }}</p>
          <div class="export-route-actions">
            <button
              type="button"
              class="btn-secondary"
              :disabled="!canExportRoute"
              @click="exportPlannerGpx"
            >
              {{ t('planner.exportGpx') }}
            </button>
            <button
              type="button"
              class="btn-secondary"
              :disabled="!canExportRoute"
              @click="void exportPlannerFit()"
            >
              {{ exporting ? t('planner.exporting') : t('planner.exportFit') }}
            </button>
          </div>
        </div>

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

        <button type="button" class="btn-primary btn-full" :disabled="!canCreate" @click="createMap">
          {{
            creating
              ? t('planner.loadingPois')
              : routing
                ? t('planner.calculatingRoute')
                : t('planner.createMap')
          }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.route-planner {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.planner-map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  max-height: min(52vh, 520px);
  overflow-y: auto;
  padding: 0.85rem 1rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
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

.routing-hint {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.option-chip {
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

.export-route-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2, color-mix(in srgb, var(--surface) 92%, var(--primary) 8%));
}

.export-route-label {
  margin: 0;
  font-weight: 700;
  font-size: 0.9rem;
}

.export-route-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.btn-secondary {
  flex: 1;
  min-width: 7rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-secondary:disabled {
  opacity: 0.55;
  cursor: wait;
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

.btn-primary:disabled {
  opacity: 0.55;
  cursor: wait;
}

@media (min-width: 900px) {
  .route-planner {
    flex-direction: row;
    align-items: stretch;
  }

  .planner-map-wrap {
    flex: 1;
  }

  .planner-controls {
    width: min(380px, 36vw);
    max-height: none;
    height: 100%;
    border-top: none;
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.05);
    padding: 1rem 1.1rem 1.25rem;
  }
}
</style>
