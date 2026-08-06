<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../stores/mapStore'
import {
  MAP_LABEL_FONT,
  ROUTE_CASING,
  ROUTE_COLOR,
  basemapStyle,
  climbMarkerColor,
  isBasemapStyleError,
  kmMarkerInterval,
  loadBasemapPreference,
  poiColors,
  remapOpenFreeMapGlyphRequest,
  saveBasemapPreference,
  whenStyleReady,
  type BasemapId,
} from '../config/mapStyle'
import { useColorblindMode } from '../composables/useColorblindMode'
import { useRidePosition } from '../composables/useRidePosition'
import { distanceAlongRouteKm } from '../services/poiFilter'
import { buildKmMarkers, buildGradeSegments, detectClimbs, hasElevationData } from '../utils/route'
import {
  controlPointIconId,
  ensureControlPointImages,
} from '../utils/controlPointIcons'
import { ensurePoiCategoryImages, poiCategoryIconId } from '../utils/poiMapIcons'
import { ensureRouteEndImages, routeEndIconId } from '../utils/routeEndIcons'
import { isAppleMobile, isStandalonePwa } from '../utils/geoDevice'
import {
  createUserLocationElement,
  resolveGeoHeading,
  setLocationMarkerHeading,
} from '../utils/userLocationMarker'

const store = useMapStore()
const { t } = useI18n()
const { colorblindMode, toggleColorblindMode } = useColorblindMode()
const { setRideKmAlong } = useRidePosition()

const props = defineProps<{
  /** Mobile cockpit: larger location, less map chrome */
  rideMode?: boolean
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
const mapCanvasWrap = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let resizeObserver: ResizeObserver | null = null

// ── Location Tracking (Follow + Heading) ──
const locationWatchId = ref<number | null>(null)
const userLocation = ref<{
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
} | null>(null)
const locationError = ref('')
const locationDeniedHelp = ref(false)
const locationPending = ref(false)
/** Keep map centered on GPS */
const followActive = ref(false)
/** Rotate map to movement direction */
const headingUp = ref(false)

let locationMarker: maplibregl.Marker | null = null
let accuracyEl: HTMLDivElement | null = null
let bikeCursorMarker: maplibregl.Marker | null = null
let bikeCursorEl: HTMLDivElement | null = null
let lastFollowPos: { lat: number; lng: number } | null = null
const userPanning = ref(false)
/** Resume GPS after tab/app returns from background */
let resumeLocationAfterVisible = false
let locatingTimer: ReturnType<typeof setTimeout> | null = null
/** Skip click toggle when GPS was already started on touch pointerdown */
let startedFromPointerDown = false

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

function updateBikeCursorMarker() {
  if (!map) return
  const cursor = store.routeCursor

  if (!cursor) {
    bikeCursorMarker?.remove()
    bikeCursorMarker = null
    bikeCursorEl = null
    return
  }

  if (!bikeCursorMarker || !bikeCursorEl) {
    bikeCursorEl = createBikeCursorElement()
    bikeCursorMarker = new maplibregl.Marker({
      element: bikeCursorEl,
      anchor: 'center',
    })
      .setLngLat([cursor.lng, cursor.lat])
      .addTo(map)
  } else {
    bikeCursorMarker.setLngLat([cursor.lng, cursor.lat])
  }
}

function applyGeoPosition(pos: GeolocationPosition) {
  const lat = pos.coords.latitude
  const lng = pos.coords.longitude
  const heading = resolveGeoHeading(pos, lastFollowPos)

  lastFollowPos = { lat, lng }
  userLocation.value = {
    lat,
    lng,
    accuracy: pos.coords.accuracy,
    heading,
    speed: pos.coords.speed,
  }
  locationPending.value = false
  locationError.value = ''
  if (locatingTimer) {
    clearTimeout(locatingTimer)
    locatingTimer = null
  }
  if (props.rideMode && store.routePoints.length >= 2) {
    setRideKmAlong(distanceAlongRouteKm({ lat, lng }, store.routePoints))
  }
  updateLocationMarker()
  applyFollowCamera(false)
}

function onGeoError(err: GeolocationPositionError) {
  locationPending.value = false
  if (locatingTimer) {
    clearTimeout(locatingTimer)
    locatingTimer = null
  }
  const denied = err.code === 1
  locationDeniedHelp.value = denied && isAppleMobile()
  const msg = denied
    ? t(
        isAppleMobile()
          ? isStandalonePwa()
            ? 'mapCanvas.geoDeniedIosApp'
            : 'mapCanvas.geoDeniedIos'
          : 'mapCanvas.geoDenied'
      )
    : err.code === 3
      ? t('mapCanvas.geoTimeout')
      : t('mapCanvas.geoUnavailable')
  stopLocation({ keepError: true })
  locationError.value = msg
}

/**
 * Start GPS. Best practice (esp. iOS Safari):
 * - Call watchPosition synchronously inside the tap handler (user gesture).
 * - Do NOT chain getCurrentPosition → watchPosition in async callbacks —
 *   Safari then returns PERMISSION_DENIED even when Settings say Allow.
 * - Ignore Permissions API on Safari (unreliable / always "prompt").
 */
function startLocation(opts?: { follow?: boolean; heading?: boolean }) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    locationError.value = t('mapCanvas.geoInsecure')
    locationDeniedHelp.value = false
    return
  }
  if (!navigator.geolocation) {
    locationError.value = t('mapCanvas.geoUnsupported')
    locationDeniedHelp.value = false
    return
  }

  followActive.value = opts?.follow ?? true
  headingUp.value = opts?.heading ?? Boolean(props.rideMode)
  userPanning.value = false
  locationError.value = ''
  locationDeniedHelp.value = false

  if (locationWatchId.value != null) {
    if (userLocation.value) applyFollowCamera(true)
    locationPending.value = false
    return
  }

  locationPending.value = true
  if (locatingTimer) clearTimeout(locatingTimer)
  locatingTimer = setTimeout(() => {
    if (locationPending.value && !userLocation.value) {
      locationError.value = t('mapCanvas.geoTimeout')
      locationPending.value = false
    }
  }, 25000)

  const apple = isAppleMobile()
  // Sync call in this turn — required for iOS user-activation / permission prompt
  locationWatchId.value = navigator.geolocation.watchPosition(
    applyGeoPosition,
    (err) => {
      // Ignore transient watch errors if we already have a fix
      if (userLocation.value && err.code !== 1) return
      onGeoError(err)
    },
    {
      enableHighAccuracy: true,
      maximumAge: apple ? 30000 : 10000,
      timeout: apple ? 30000 : 20000,
    }
  )
}

function stopLocation(opts?: { keepError?: boolean }) {
  if (locationWatchId.value != null) {
    navigator.geolocation.clearWatch(locationWatchId.value)
    locationWatchId.value = null
  }
  userLocation.value = null
  locationPending.value = false
  if (!opts?.keepError) {
    locationError.value = ''
    locationDeniedHelp.value = false
  }
  followActive.value = false
  headingUp.value = false
  lastFollowPos = null
  setRideKmAlong(null)
  if (locatingTimer) {
    clearTimeout(locatingTimer)
    locatingTimer = null
  }
  locationMarker?.remove()
  locationMarker = null
  accuracyEl?.remove()
  accuracyEl = null
  if (map && props.rideMode) {
    map.easeTo({ bearing: 0, pitch: 0, duration: 400 })
  }
}

/** Pause high-accuracy GPS when app is backgrounded (battery). */
function onVisibilityChange() {
  if (document.hidden) {
    if (locationWatchId.value != null || userLocation.value) {
      resumeLocationAfterVisible = true
      if (locationWatchId.value != null) {
        navigator.geolocation.clearWatch(locationWatchId.value)
        locationWatchId.value = null
      }
      followActive.value = false
      locationPending.value = false
    }
    return
  }
  // Do not auto-restart on iOS without a fresh tap — causes false "denied"
  if (resumeLocationAfterVisible) {
    resumeLocationAfterVisible = false
  }
}

function clearLocationError() {
  locationError.value = ''
  locationDeniedHelp.value = false
}

function applyFollowCamera(force: boolean) {
  if (!map || !userLocation.value || !followActive.value || userPanning.value) return
  const { lat, lng, heading } = userLocation.value
  const cam: maplibregl.EaseToOptions = {
    center: [lng, lat],
    duration: force ? 0 : 700,
    essential: true,
  }
  if (headingUp.value && heading != null) {
    cam.bearing = heading
    cam.pitch = props.rideMode ? 45 : 0
  }
  if (!props.rideMode) {
    cam.zoom = Math.max(map.getZoom(), 15)
  } else if (map.getZoom() < 14) {
    cam.zoom = 15.5
  }
  map.easeTo(cam)
}

function updateLocationMarker() {
  if (!map || !userLocation.value) return
  const { lat, lng, heading } = userLocation.value

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

  setLocationMarkerHeading(locationMarker.getElement(), heading, headingUp.value)
}

/** Instant “you are here” on Umgebung maps before live GPS watch returns. */
function seedNearbyLocationMarker() {
  if (!map || !store.isNearbyMap) return
  if (!userLocation.value) {
    const c = store.routeCoords[0]
    if (!c) return
    userLocation.value = {
      lat: c[1],
      lng: c[0],
      accuracy: 50,
      heading: null,
      speed: null,
    }
  }
  updateLocationMarker()
}

/**
 * Start on pointerdown for touch — iOS user-activation is more reliable
 * than waiting for the delayed click event.
 */
function onLocationPointerDown(e: PointerEvent) {
  e.stopPropagation()
  if (e.button !== 0) return
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
  if (locationPending.value || locationActive.value) return
  startedFromPointerDown = true
  startLocation({ follow: true, heading: Boolean(props.rideMode) })
}

function onLocationButtonClick(e?: Event) {
  e?.preventDefault()
  e?.stopPropagation()
  // Touch already started GPS in pointerdown — don't toggle off on the same gesture
  if (startedFromPointerDown) {
    startedFromPointerDown = false
    return
  }
  if (locationPending.value) return
  if (!locationActive.value) {
    startLocation({ follow: true, heading: Boolean(props.rideMode) })
    return
  }
  if (!followActive.value || userPanning.value) {
    userPanning.value = false
    followActive.value = true
    headingUp.value = Boolean(props.rideMode) || headingUp.value
    applyFollowCamera(true)
    return
  }
  if (props.rideMode && !headingUp.value) {
    headingUp.value = true
    applyFollowCamera(true)
    return
  }
  stopLocation()
}

const locationActive = computed(
  () => locationWatchId.value != null || userLocation.value != null || locationPending.value
)
const locationBtnTitle = computed(() => {
  if (locationPending.value) return t('mapCanvas.locating')
  if (!locationActive.value) return t('mapCanvas.followOn')
  if (userPanning.value || !followActive.value) return t('mapCanvas.followResume')
  if (props.rideMode && !headingUp.value) return t('mapCanvas.headingOn')
  return t('mapCanvas.locationOff')
})

const basemap = ref<BasemapId>(loadBasemapPreference())
const basemapFallbackHint = ref('')
let cancelStyleReady: (() => void) | null = null
let basemapRecovering = false

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
    if (map.getSource('route')) {
      restored = true
      updateSources()
      updateBikeCursorMarker()
      return
    }
    try {
      map.jumpTo({ center, zoom, bearing, pitch })
      addLayers()
      updateSources()
      updateBikeCursorMarker()
      restored = true
    } catch (err) {
      console.error('[map] Overlay nach Kartenwechsel fehlgeschlagen:', err)
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
  console.warn('[map] Basiskarte fehlgeschlagen, Fallback auf Radkarte:', e.error)
  basemapFallbackHint.value = t('mapCanvas.basemapFallback')
  setBasemap('cycling', { auto: true })
  window.setTimeout(() => {
    basemapRecovering = false
  }, 2500)
}

function poiGeoJson() {
  // Ride: only favorites on the map (route stays); quieter cockpit
  const pois = props.rideMode ? store.favoritePois : store.mapPois
  return {
    type: 'FeatureCollection' as const,
    features: pois.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        category: p.category,
        name: p.name,
        icon: poiCategoryIconId(p.category),
        color: poiColors()[p.category] ?? '#3388ff',
      },
    })),
  }
}

function favoritesGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: store.favoritePois.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id },
      })),
  }
}

function controlPointsGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: store.controlPoints.map((cp) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [cp.lng, cp.lat] },
      properties: {
        id: cp.id,
        label: cp.name,
        kind: cp.kind,
        icon: controlPointIconId(cp.kind),
        color: cp.kind === 'sleep' ? '#7c3aed' : cp.kind === 'border' ? '#0f766e' : '#dc2626',
      },
    })),
  }
}

function routeGeoJson() {
  // Single-point / nearby maps have no route line
  if (store.isNearbyMap || store.routeCoords.length < 2) {
    return { type: 'FeatureCollection' as const, features: [] }
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: store.routeCoords },
        properties: {},
      },
    ],
  }
}

function nearbyCenterGeoJson() {
  if (!store.isNearbyMap || !store.routeCoords.length) {
    return { type: 'FeatureCollection' as const, features: [] }
  }
  const [lng, lat] = store.routeCoords[0]!
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: { label: t('mapCanvas.youAreHere') },
      },
    ],
  }
}

function nearbyRadiusGeoJson() {
  if (!store.isNearbyMap || !store.routeCoords.length) {
    return { type: 'FeatureCollection' as const, features: [] }
  }
  const [lng, lat] = store.routeCoords[0]!
  const radiusM = store.poiRadiusM
  const steps = 64
  const ring: [number, number][] = []
  const latRad = (lat * Math.PI) / 180
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.cos(latRad)
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const dLat = (radiusM / metersPerDegLat) * Math.cos(bearing)
    const dLng = (radiusM / Math.max(metersPerDegLng, 1e-6)) * Math.sin(bearing)
    ring.push([lng + dLng, lat + dLat])
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: {},
      },
    ],
  }
}

function kmMarkerGeoJson() {
  if (store.isNearbyMap) return { type: 'FeatureCollection' as const, features: [] }
  const interval = kmMarkerInterval(store.totalKm)
  const markers = buildKmMarkers(store.routePoints, interval)
  return {
    type: 'FeatureCollection' as const,
    features: markers.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: { label: `${m.km}` },
    })),
  }
}

function gradeGeoJson() {
  const segments = buildGradeSegments(store.routePoints)
  return {
    type: 'FeatureCollection' as const,
    features: segments.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      properties: { grade: Math.round(s.grade * 10) / 10, color: s.color },
    })),
  }
}

function climbsGeoJson() {
  const climbs = detectClimbs(store.routePoints)
  return {
    type: 'FeatureCollection' as const,
    features: climbs.map((c) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      properties: {
        label: `↑ ${Math.round(c.gainM)} m`,
        detail: `${c.avgGrade.toFixed(1)} % · ${c.lengthKm.toFixed(1)} km`,
        km: Math.round(c.endKm),
      },
    })),
  }
}

function endPointsGeoJson() {
  if (store.routeCoords.length < 2) return { type: 'FeatureCollection' as const, features: [] }
  const start = store.routeCoords[0]!
  const end = store.routeCoords[store.routeCoords.length - 1]!
  // Round trip: same start/end → one marker, avoid overlapping "Start"+"Ziel"
  const samePoint =
    Math.abs(start[0] - end[0]) < 1e-4 && Math.abs(start[1] - end[1]) < 1e-4
  if (samePoint) {
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: start },
          properties: {
            role: 'both',
            icon: routeEndIconId('both'),
            label: t('mapCanvas.startEnd'),
          },
        },
      ],
    }
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: start },
        properties: {
          role: 'start',
          icon: routeEndIconId('start'),
          label: t('mapCanvas.start'),
        },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: end },
        properties: {
          role: 'end',
          icon: routeEndIconId('end'),
          label: t('mapCanvas.end'),
        },
      },
    ],
  }
}

function routeCursorGeoJson() {
  // Halo stays as a map layer; bike icon is an HTML marker
  const cursor = store.routeCursor
  if (!cursor) return { type: 'FeatureCollection' as const, features: [] }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [cursor.lng, cursor.lat] },
        properties: {},
      },
    ],
  }
}

function focusOnPoi(lng: number, lat: number) {
  if (!map) return
  const zoom = Math.max(map.getZoom(), 14)
  map.easeTo({ center: [lng, lat], zoom, duration: 550 })
}

function fitBounds() {
  if (!map || !store.routeCoords.length) return
  const bounds = new maplibregl.LngLatBounds()

  if (store.isNearbyMap) {
    const [lng, lat] = store.routeCoords[0]!
    const radiusM = store.poiRadiusM
    const latRad = (lat * Math.PI) / 180
    const dLat = radiusM / 111_320
    const dLng = radiusM / Math.max(111_320 * Math.cos(latRad), 1e-6)
    bounds.extend([lng - dLng, lat - dLat])
    bounds.extend([lng + dLng, lat + dLat])
  } else {
    for (const [lng, lat] of store.routeCoords) {
      bounds.extend([lng, lat])
    }
  }
  map.fitBounds(bounds, { padding: 48, duration: 0 })
}

function destroyMap() {
  cancelStyleReady?.()
  cancelStyleReady = null
  resizeObserver?.disconnect()
  resizeObserver = null
  stopLocation()
  bikeCursorMarker?.remove()
  bikeCursorMarker = null
  bikeCursorEl = null
  locationMarker?.remove()
  locationMarker = null
  accuracyEl?.remove()
  accuracyEl = null
  if (map) {
    try {
      map.off('error', onBasemapError)
      const canvas = map.getCanvas()
      canvas.removeEventListener('webglcontextlost', onWebGlContextLost)
      map.remove()
    } catch (err) {
      console.warn('[map] destroy failed:', err)
    }
  }
  map = null
}

function scheduleMapResize() {
  if (!map) return
  try {
    map.resize()
  } catch {
    /* ignore */
  }
}

let webglRecoveryScheduled = false

function onWebGlContextLost(ev: Event) {
  ev.preventDefault()
  if (webglRecoveryScheduled) return
  webglRecoveryScheduled = true
  console.warn('[map] WebGL context lost — remounting')
  destroyMap()
  void nextTick(() => {
    webglRecoveryScheduled = false
    if (store.mapReady) void initMap()
  })
}

function afterMapReady() {
  if (!map) return
  addLayers()
  scheduleMapResize()
  fitBounds()
  seedNearbyLocationMarker()
  // Layout often settles a frame later on mobile (toolbar / bottom nav / elev)
  requestAnimationFrame(() => {
    scheduleMapResize()
    fitBounds()
    requestAnimationFrame(scheduleMapResize)
  })
}

async function initMap() {
  if (!mapContainer.value) return
  // Orphaned instance from a failed unmount — free WebGL before recreating
  if (map) {
    try {
      const container = map.getContainer()
      if (container === mapContainer.value && map.loaded()) {
        scheduleMapResize()
        return
      }
    } catch {
      /* fall through to destroy */
    }
    destroyMap()
  }

  // Wait for Vue layout + browser paint so the container has non-zero size
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  if (!mapContainer.value || map) return

  const el = mapContainer.value
  if (el.clientWidth < 2 || el.clientHeight < 2) {
    // Retry once after layout — avoids blank MapLibre canvas on mobile remount
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    await nextTick()
    if (!mapContainer.value || map) return
  }

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: basemapStyle(basemap.value),
    transformRequest: (url) => ({ url: remapOpenFreeMapGlyphRequest(url) }),
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('error', onBasemapError)
  map.once('load', afterMapReady)
  map.getCanvas().addEventListener('webglcontextlost', onWebGlContextLost, false)

  if (mapCanvasWrap.value) {
    resizeObserver = new ResizeObserver(() => {
      scheduleMapResize()
    })
    resizeObserver.observe(mapCanvasWrap.value)
  }
}

watch(
  () => [store.mapPois, store.routeCoords, store.routePoints, store.isNearbyMap, store.poiRadiusM],
  () => updateSources(),
  { deep: true }
)

watch(() => store.routeCursor, () => updateSources())
watch(() => store.favorites, () => updateSources(), { deep: true })
watch(() => store.controlPoints, () => updateSources(), { deep: true })
watch(() => store.controlPointPlaceKind, () => updateSources())
watch(() => store.visibleCategories, () => updateSources(), { deep: true })
watch(colorblindMode, () => {
  updateThemePaint()
  updateSources()
})

watch(() => store.poiFocusTick, () => {
  const coords = store.poiFocusCoords
  if (!coords) return
  focusOnPoi(coords[0], coords[1])
})

watch(
  () => props.rideMode,
  (on) => {
    // Do NOT auto-start GPS here — iOS returns false "denied" without a tap.
    // enterRideMode / location button start GPS in the user-gesture turn.
    if (!on) {
      setRideKmAlong(null)
      if (locationActive.value) {
        headingUp.value = false
        if (map) map.easeTo({ bearing: 0, pitch: 0, duration: 400 })
      }
    }
    void nextTick(() => {
      scheduleMapResize()
      updateSources()
    })
  }
)

function updateSources() {
  if (!map) return
  if (!map.isStyleLoaded()) {
    map.once('idle', () => updateSources())
    return
  }
  ;(map.getSource('route') as maplibregl.GeoJSONSource)?.setData(routeGeoJson())
  ;(map.getSource('route-grades') as maplibregl.GeoJSONSource)?.setData(gradeGeoJson())
  ;(map.getSource('climbs') as maplibregl.GeoJSONSource)?.setData(climbsGeoJson())
  ;(map.getSource('route-ends') as maplibregl.GeoJSONSource)?.setData(endPointsGeoJson())
  ;(map.getSource('km-markers') as maplibregl.GeoJSONSource)?.setData(kmMarkerGeoJson())
  ;(map.getSource('pois') as maplibregl.GeoJSONSource)?.setData(poiGeoJson())
  ;(map.getSource('route-cursor') as maplibregl.GeoJSONSource)?.setData(routeCursorGeoJson())
  ;(map.getSource('favorites') as maplibregl.GeoJSONSource)?.setData(favoritesGeoJson())
  ;(map.getSource('control-points') as maplibregl.GeoJSONSource)?.setData(controlPointsGeoJson())
  ;(map.getSource('nearby-radius') as maplibregl.GeoJSONSource)?.setData(nearbyRadiusGeoJson())
  ;(map.getSource('nearby-center') as maplibregl.GeoJSONSource)?.setData(nearbyCenterGeoJson())

  const canvas = map.getCanvas()
  canvas.style.cursor = store.controlPointPlaceKind ? 'crosshair' : ''

  const hasGrades = !store.isNearbyMap && hasElevationData(store.routePoints)
  if (map.getLayer('route-line')) {
    map.setPaintProperty('route-line', 'line-opacity', hasGrades ? 0.15 : 1)
  }
  if (map.getLayer('route-grades')) {
    map.setLayoutProperty('route-grades', 'visibility', hasGrades ? 'visible' : 'none')
  }
  if (map.getLayer('climbs-dot')) {
    map.setLayoutProperty('climbs-dot', 'visibility', hasGrades ? 'visible' : 'none')
  }
  if (map.getLayer('climbs-label')) {
    map.setLayoutProperty('climbs-label', 'visibility', hasGrades ? 'visible' : 'none')
  }
  const nearbyVis = store.isNearbyMap ? 'visible' : 'none'
  if (map.getLayer('nearby-radius-fill')) {
    map.setLayoutProperty('nearby-radius-fill', 'visibility', nearbyVis)
  }
  if (map.getLayer('nearby-radius-line')) {
    map.setLayoutProperty('nearby-radius-line', 'visibility', nearbyVis)
  }
  if (map.getLayer('nearby-center')) {
    map.setLayoutProperty('nearby-center', 'visibility', nearbyVis)
  }

  updateBikeCursorMarker()
}

function updateThemePaint() {
  if (!map?.isStyleLoaded()) return
  ensureRouteEndImages(map)
  const climbColor = climbMarkerColor()
  if (map.getLayer('climbs-dot')) {
    map.setPaintProperty('climbs-dot', 'circle-color', climbColor)
  }
  if (map.getLayer('climbs-label')) {
    map.setPaintProperty('climbs-label', 'text-color', climbColor)
  }
}

function addLayers() {
  if (!map || map.getSource('route')) return

  map.addSource('route', { type: 'geojson', data: routeGeoJson() })
  map.addSource('route-grades', { type: 'geojson', data: gradeGeoJson() })
  map.addSource('climbs', { type: 'geojson', data: climbsGeoJson() })
  map.addSource('route-ends', { type: 'geojson', data: endPointsGeoJson() })
  map.addSource('km-markers', { type: 'geojson', data: kmMarkerGeoJson() })
  map.addSource('pois', {
    type: 'geojson',
    data: poiGeoJson(),
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 28,
    clusterMinPoints: 3,
  })
  map.addSource('route-cursor', { type: 'geojson', data: routeCursorGeoJson() })
  map.addSource('favorites', { type: 'geojson', data: favoritesGeoJson() })
  map.addSource('control-points', { type: 'geojson', data: controlPointsGeoJson() })
  map.addSource('nearby-radius', { type: 'geojson', data: nearbyRadiusGeoJson() })
  map.addSource('nearby-center', { type: 'geojson', data: nearbyCenterGeoJson() })

  ensureControlPointImages(map)
  ensureRouteEndImages(map)
  ensurePoiCategoryImages(map)

  const nearbyVis = store.isNearbyMap ? 'visible' : 'none'

  map.addLayer({
    id: 'nearby-radius-fill',
    type: 'fill',
    source: 'nearby-radius',
    layout: { visibility: nearbyVis },
    paint: {
      'fill-color': '#2d6a4f',
      'fill-opacity': 0.08,
    },
  })

  map.addLayer({
    id: 'nearby-radius-line',
    type: 'line',
    source: 'nearby-radius',
    layout: { visibility: nearbyVis },
    paint: {
      'line-color': '#2d6a4f',
      'line-width': 2,
      'line-opacity': 0.55,
      'line-dasharray': [2, 1.5],
    },
  })

  map.addLayer({
    id: 'nearby-center',
    type: 'circle',
    source: 'nearby-center',
    layout: { visibility: nearbyVis },
    paint: {
      'circle-radius': 7,
      'circle-color': '#2d6a4f',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_CASING,
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 11],
    },
  })

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
      'line-opacity': hasElevationData(store.routePoints) ? 0.15 : 1,
    },
  })

  map.addLayer({
    id: 'route-grades',
    type: 'line',
    source: 'route-grades',
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: hasElevationData(store.routePoints) ? 'visible' : 'none',
    },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9],
    },
  })

  // Filled A/B pins (not washed-out white discs) — tip marks the coordinate
  map.addLayer({
    id: 'route-ends-pins',
    type: 'symbol',
    source: 'route-ends',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 12, 1, 16, 1.05],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 12, 16, 13],
      'text-offset': [0, -3.35],
      'text-font': [...MAP_LABEL_FONT],
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
      'text-halo-blur': 0.15,
    },
  })

  map.addLayer({
    id: 'km-markers-dot',
    type: 'circle',
    source: 'km-markers',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
      'circle-color': '#fff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#374151',
    },
  })

  map.addLayer({
    id: 'km-markers',
    type: 'symbol',
    source: 'km-markers',
    layout: {
      'text-field': ['concat', ['get', 'label'], ' km'],
      'text-size': 11,
      'text-offset': [0, -2.2],
      'text-font': [...MAP_LABEL_FONT],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#111827',
      'text-halo-color': '#fff',
      'text-halo-width': 2,
    },
  })

  const climbVis = hasElevationData(store.routePoints) ? 'visible' : 'none'

  map.addLayer({
    id: 'climbs-dot',
    type: 'circle',
    source: 'climbs',
    layout: { visibility: climbVis },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8],
      'circle-color': climbMarkerColor(),
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'climbs-label',
    type: 'symbol',
    source: 'climbs',
    layout: {
      visibility: climbVis,
      'text-field': ['format',
        ['coalesce', ['get', 'label'], ''], { 'font-scale': 1 },
        '\n', {},
        ['coalesce', ['get', 'detail'], ''], { 'font-scale': 0.85 },
      ],
      'text-size': 11,
      'text-offset': [0, -2.0],
      'text-font': [...MAP_LABEL_FONT],
      'text-anchor': 'bottom',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': climbMarkerColor(),
      'text-halo-color': '#fff',
      'text-halo-width': 2,
    },
  })

  map.addLayer({
    id: 'poi-clusters',
    type: 'circle',
    source: 'pois',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#1f2937',
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 22],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'poi-cluster-count',
    type: 'symbol',
    source: 'pois',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-size': 12,
      'text-font': [...MAP_LABEL_FONT],
    },
    paint: { 'text-color': '#fff' },
  })

  map.addLayer({
    id: 'poi-unclustered-halo',
    type: 'circle',
    source: 'pois',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 18,
      'circle-color': ['coalesce', ['get', 'color'], '#6b7280'],
      'circle-opacity': 0.3,
    },
  })

  map.addLayer({
    id: 'poi-unclustered-point',
    type: 'circle',
    source: 'pois',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 14,
      'circle-color': ['coalesce', ['get', 'color'], '#6b7280'],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'poi-unclustered-icons',
    type: 'symbol',
    source: 'pois',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      // 48px @ pixelRatio 3 → 16 CSS px at size 1 (no fractional rescale / blur)
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
      'icon-padding': 0,
    },
    // Color is baked into non-SDF rasters in poiMapIcons — icon-color would be ignored
  })

  map.addLayer({
    id: 'favorites-halo',
    type: 'circle',
    source: 'favorites',
    paint: {
      'circle-radius': 20,
      'circle-color': '#f59e0b',
      'circle-opacity': 0.25,
    },
  })

  map.addLayer({
    id: 'favorites-ring',
    type: 'circle',
    source: 'favorites',
    paint: {
      'circle-radius': 15,
      'circle-color': 'transparent',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#f59e0b',
    },
  })

  map.addLayer({
    id: 'favorites-star',
    type: 'symbol',
    source: 'favorites',
    layout: {
      'text-field': '★',
      'text-size': 14,
      'text-font': [...MAP_LABEL_FONT],
      'text-offset': [0.9, -0.9],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#f59e0b',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
    },
  })

  map.addLayer({
    id: 'control-points-halo',
    type: 'circle',
    source: 'control-points',
    paint: {
      'circle-radius': 14,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.22,
    },
  })

  map.addLayer({
    id: 'control-points-icon',
    type: 'symbol',
    source: 'control-points',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 0.55,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.55],
      'text-anchor': 'top',
      'text-optional': true,
      'text-font': [...MAP_LABEL_FONT],
    },
    paint: {
      'text-color': '#111827',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
    },
  })

  map.addLayer({
    id: 'route-cursor-pulse',
    type: 'circle',
    source: 'route-cursor',
    paint: {
      'circle-radius': 14,
      'circle-color': '#2d6a4f',
      'circle-opacity': 0.12,
    },
  })

  map.addLayer({
    id: 'route-cursor-halo',
    type: 'circle',
    source: 'route-cursor',
    paint: {
      'circle-radius': 7,
      'circle-color': '#2d6a4f',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.75,
    },
  })

  map.on('click', (e) => {
    if (!store.controlPointPlaceKind) return
    // Don't place when clicking a POI marker (those fire their own handlers too —
    // placing on empty map / route is the intent).
    store.addControlPointAt(e.lngLat.lat, e.lngLat.lng)
  })

  map.on('click', 'poi-clusters', (e) => {
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['poi-clusters'] })
    if (!features.length) return
    const clusterId = features[0]!.properties?.cluster_id as number
    const source = map.getSource('pois') as maplibregl.GeoJSONSource
    const coords = (features[0]!.geometry as GeoJSON.Point).coordinates as [number, number]
    void source.getClusterExpansionZoom(clusterId).then((zoom) => {
      if (map && zoom != null) map.easeTo({ center: coords, zoom })
    })
  })

  const poiClickLayers = ['poi-unclustered-point', 'poi-unclustered-icons', 'poi-clusters'] as const
  for (const layer of poiClickLayers) {
    if (layer === 'poi-clusters') {
      map.on('mouseenter', layer, () => {
        map!.getCanvas().classList.add('poi-hover')
      })
      map.on('mouseleave', layer, () => {
        map!.getCanvas().classList.remove('poi-hover')
      })
      continue
    }

    map.on('click', layer, (e) => {
      const feat = e.features?.[0]
      const id = feat?.properties?.id as string | undefined
      if (!id) return
      const poi = store.displayPois.find((p) => p.id === id)
      if (poi) store.selectPoi(poi)
    })
    map.on('mouseenter', layer, () => {
      map!.getCanvas().classList.add('poi-hover')
    })
    map.on('mouseleave', layer, () => {
      map!.getCanvas().classList.remove('poi-hover')
    })
  }

  setupMapDragBehavior()
}

function setupMapDragBehavior() {
  if (!map) return
  const canvas = map.getCanvas()

  canvas.addEventListener('dragstart', (e) => e.preventDefault())

  map.on('dragstart', () => {
    canvas.classList.remove('poi-hover')
    if (locationActive.value && followActive.value) {
      userPanning.value = true
      followActive.value = false
    }
  })
}

defineExpose({
  startLocation,
  stopLocation,
})

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (store.mapReady) void initMap()
  // Never auto-start GPS on mount (iOS permission quirk)
})

watch(
  () => store.mapReady,
  (ready) => {
    if (ready) void initMap()
    else destroyMap()
  }
)

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  destroyMap()
})
</script>

<template>
  <div ref="mapCanvasWrap" class="map-canvas-wrap" :class="{ 'ride-mode': rideMode }">
    <div ref="mapContainer" class="map-canvas" />

    <p v-if="basemapFallbackHint" class="basemap-fallback" role="status">
      {{ basemapFallbackHint }}
      <button type="button" @click="clearBasemapFallbackHint(); setBasemap('standard')">
        {{ t('mapCanvas.basemapRetry') }}
      </button>
    </p>

    <div v-show="!rideMode" class="basemap-toggle" role="group" :aria-label="t('mapCanvas.basemap')">
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
      <button
        type="button"
        class="colorblind-btn"
        :class="{ active: colorblindMode }"
        :aria-pressed="colorblindMode"
        :title="t('mapCanvas.colorblind')"
        @click="toggleColorblindMode()"
      >
        {{ t('mapCanvas.colorblind') }}
      </button>
    </div>

    <!-- Standort / Follow / Heading -->
    <button
      type="button"
      class="location-btn"
      :class="{
        active: locationActive,
        following: locationActive && followActive && !userPanning,
        pending: locationPending,
      }"
      :title="locationBtnTitle"
      :aria-label="locationBtnTitle"
      @pointerdown="onLocationPointerDown"
      @click.stop.prevent="onLocationButtonClick"
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="4" :fill="locationActive ? '#3b82f6' : 'currentColor'" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none" />
        <path
          v-if="headingUp"
          d="M12 5 L15 11 H9 Z"
          fill="#3b82f6"
          stroke="none"
        />
      </svg>
    </button>

    <div v-if="locationError" class="location-error" role="alert">
      <div class="location-error-body">
        <span>{{ locationError }}</span>
        <ol v-if="locationDeniedHelp" class="location-help">
          <template v-if="isStandalonePwa()">
            <li>{{ t('mapCanvas.geoHelpStandalone1') }}</li>
            <li>{{ t('mapCanvas.geoHelpStandalone2') }}</li>
            <li>{{ t('mapCanvas.geoHelpStandalone3') }}</li>
          </template>
          <template v-else>
            <li>{{ t('mapCanvas.geoHelp1') }}</li>
            <li>{{ t('mapCanvas.geoHelp2') }}</li>
            <li>{{ t('mapCanvas.geoHelp3') }}</li>
          </template>
        </ol>
      </div>
      <button type="button" class="location-error-dismiss" :aria-label="t('common.close')" @click.stop="clearLocationError">
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.map-canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 280px;
  touch-action: none;
  user-select: none;
}

.map-canvas {
  width: 100%;
  height: 100%;
}

/* ── Standort-Button ── */
.location-btn {
  position: absolute;
  bottom: 28px;
  right: 10px;
  z-index: 40;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(0,0,0,.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px;
  color: #333;
  transition: background 0.15s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.basemap-toggle {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: flex;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
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

.basemap-toggle .colorblind-btn.active {
  background: var(--primary);
  color: #fff;
}

.basemap-fallback {
  position: absolute;
  top: 52px;
  left: 10px;
  right: 10px;
  z-index: 11;
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

.location-btn:hover {
  background: #f0f0f0;
}

.location-btn.following {
  background: #eff6ff;
  color: #2563eb;
  box-shadow: 0 0 0 2px #93c5fd;
}

.location-btn.pending {
  background: #fef9c3;
  color: #a16207;
  box-shadow: 0 0 0 2px #fde047;
}

.location-btn svg {
  width: 100%;
  height: 100%;
}

.location-error {
  position: absolute;
  bottom: 76px;
  right: 10px;
  background: #fee2e2;
  color: #991b1b;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  font-size: 0.78rem;
  max-width: 280px;
  z-index: 40;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  line-height: 1.35;
}

.location-error-body {
  flex: 1 1 auto;
  min-width: 0;
}

.location-help {
  margin: 0.4rem 0 0;
  padding-left: 1.05rem;
}

.location-help li {
  margin: 0.12rem 0;
}

.location-error-dismiss {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.1rem;
}

@media (max-width: 768px) {
  .location-btn {
    /* Always top-right on mobile — never under bottom nav */
    top: calc(12px + env(safe-area-inset-top, 0px));
    bottom: auto;
    right: 12px;
    z-index: 120;
    width: 48px;
    height: 48px;
    padding: 9px;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .map-canvas-wrap.ride-mode .location-btn {
    top: calc(12px + env(safe-area-inset-top, 0px));
    bottom: auto;
    right: 12px;
    z-index: 120;
    width: 52px;
    height: 52px;
    padding: 10px;
    border-radius: 14px;
  }

  .map-canvas-wrap.ride-mode :deep(.maplibregl-ctrl-top-right) {
    display: none;
  }

  .location-error {
    top: calc(68px + env(safe-area-inset-top, 0px));
    bottom: auto;
    right: 12px;
    left: 12px;
    z-index: 120;
    max-width: none;
  }

  .map-canvas-wrap.ride-mode .location-error {
    top: calc(72px + env(safe-area-inset-top, 0px));
    bottom: auto;
    right: 12px;
  }

  .basemap-toggle {
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: 68px;
    left: auto;
  }

  .map-canvas-wrap.ride-mode .basemap-toggle {
    display: none;
  }

  .basemap-toggle button {
    padding: 0.4rem 0.55rem;
    font-size: 0.72rem;
  }
}
</style>

<style>
/* Standort-Punkt (global, da in dynamisch erstelltem Element) */
.user-location-marker {
  position: relative;
  width: 40px;
  height: 40px;
  pointer-events: none;
}

.user-location-pulse {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: rgba(37, 99, 235, 0.2);
  border: 2px solid rgba(37, 99, 235, 0.45);
}

.user-location-arrow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 50% 50%;
  transition: transform 0.25s ease-out;
}

.user-location-arrow svg {
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}

.user-location-arrow:not(.has-heading) svg path {
  fill: #3b82f6;
}

.user-location-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px #3b82f6, 0 2px 8px rgba(59,130,246,0.4);
}

/* Cursor-Fahrrad auf der Route (HTML-Marker) — klein, nicht dominant */
.route-bike-cursor {
  position: relative;
  width: 26px;
  height: 26px;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(45, 106, 79, 0.35));
}

.route-bike-icon {
  position: absolute;
  inset: 1px;
  width: 24px;
  height: 24px;
  opacity: 0.9;
  filter: drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.9));
}
</style>
