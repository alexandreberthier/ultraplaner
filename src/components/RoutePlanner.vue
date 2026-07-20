<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLng, PoiCategory } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  MAX_POI_RADIUS_M,
  MIN_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { ROUTE_COLOR, ROUTE_CASING, basemapStyle, loadBasemapPreference, saveBasemapPreference, type BasemapId } from '../config/mapStyle'
import {
  fetchCyclingRoute,
  isOrsConfigured,
  searchAddresses,
  CYCLING_PROFILE,
  type GeocodeResult,
} from '../services/routing'
import { totalRouteKm, buildRoutePoints } from '../utils/route'

interface Waypoint {
  id: string
  lat: number
  lng: number
  label?: string
}

const store = useMapStore()
const router = useRouter()

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
const routeName = ref('Geplante Route')
const radiusM = ref(DEFAULT_POI_RADIUS_M)
const selected = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
const formError = ref('')
const routing = ref(false)
const creating = ref(false)
const basemap = ref<BasemapId>(loadBasemapPreference())

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

function waypointLabel(index: number, total: number): string {
  if (index === 0) return 'Start'
  if (index === total - 1) return 'Ziel'
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
  updateMapSources()
}

function undoWaypoint() {
  waypoints.value.pop()
  updateMapSources()
  fitToContent()
  scheduleAutoRoute()
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
      addressError.value = 'Keine Treffer in der Region'
    }
  } catch (err) {
    addressResults.value = []
    addressError.value = err instanceof Error ? err.message : 'Suche fehlgeschlagen'
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
      formError.value = 'Mindestens eine Kategorie muss aktiv sein'
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
  return {
    type: 'FeatureCollection' as const,
    features: waypoints.value.map((w, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [w.lng, w.lat] },
      properties: { label: waypointLabel(i, waypoints.value.length) },
    })),
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

function updateMapSources() {
  if (!map?.isStyleLoaded()) return
  ;(map.getSource('planner-waypoints') as maplibregl.GeoJSONSource)?.setData(waypointsGeoJson())
  ;(map.getSource('planner-route') as maplibregl.GeoJSONSource)?.setData(routeGeoJson())
  ;(map.getSource('planner-preview') as maplibregl.GeoJSONSource)?.setData(previewGeoJson())
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
    id: 'planner-waypoint-dot',
    type: 'circle',
    source: 'planner-waypoints',
    paint: {
      'circle-radius': 9,
      'circle-color': '#fff',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#2d6a4f',
    },
  })

  map.addLayer({
    id: 'planner-waypoint-label',
    type: 'symbol',
    source: 'planner-waypoints',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, -1.6],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#1b4332',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
    },
  })

  map.on('click', (e) => {
    addWaypoint(e.lngLat.lat, e.lngLat.lng)
  })

  map.getCanvas().style.cursor = 'crosshair'
}

function initMap() {
  if (!mapEl.value || map) return

  map = new maplibregl.Map({
    container: mapEl.value,
    style: basemapStyle(basemap.value),
    center: [10.5, 47.3],
    zoom: 6,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('load', () => {
    addPlannerLayers()
    updateMapSources()
  })
}

function setBasemap(id: BasemapId) {
  if (!map || basemap.value === id) return
  basemap.value = id
  saveBasemapPreference(id)

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

  map.setStyle(basemapStyle(id), { diff: false })
  map.once('style.load', restoreOverlays)
  window.setTimeout(restoreOverlays, 400)
  window.setTimeout(restoreOverlays, 1200)
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
    updateMapSources()
    return
  }

  const gen = ++routeGeneration
  formError.value = ''
  routing.value = true
  updateMapSources()

  try {
    const pts: LatLng[] = waypoints.value.map((w) => ({ lat: w.lat, lng: w.lng }))
    const result = await fetchCyclingRoute(pts, CYCLING_PROFILE)
    if (gen !== routeGeneration) return
    routeCoords.value = result.coordinates
    routeElevations.value = result.elevations
    updateMapSources()
  } catch (err) {
    if (gen !== routeGeneration) return
    routeCoords.value = []
    routeElevations.value = []
    updateMapSources()
    formError.value = err instanceof Error ? err.message : 'Radroute fehlgeschlagen'
  } finally {
    if (gen === routeGeneration) routing.value = false
  }
}

async function createMap() {
  formError.value = ''
  store.clearError()

  if (waypoints.value.length < 2) {
    formError.value = 'Mindestens 2 Wegpunkte setzen'
    return
  }

  creating.value = true
  try {
    if (!routeCoords.value.length) {
      await calculateRoute()
      if (!routeCoords.value.length) return
    }

    const name = routeName.value.trim() || 'Geplante Route'
    await store.createMapFromRoute(
      name,
      routeCoords.value,
      radiusM.value,
      [...selected.value],
      routeElevations.value.length ? routeElevations.value : undefined
    )

    if (store.mapReady) {
      await router.push('/map/view')
    } else if (store.error) {
      formError.value = store.error
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Karte konnte nicht erstellt werden'
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
  if (autoRouteTimer) clearTimeout(autoRouteTimer)
  if (addressTimer) clearTimeout(addressTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
})
</script>

<template>
  <div class="route-planner">
    <div class="planner-map-wrap">
      <div ref="mapEl" class="planner-map" />
      <div class="basemap-toggle" role="group" aria-label="Kartenstil">
        <button
          type="button"
          :class="{ active: basemap === 'standard' }"
          @click="setBasemap('standard')"
        >
          Karte
        </button>
        <button
          type="button"
          :class="{ active: basemap === 'cycling' }"
          title="Radwege hervorgehoben (CyclOSM)"
          @click="setBasemap('cycling')"
        >
          Radwege
        </button>
      </div>
      <p class="map-hint">
        <template v-if="routing">Radroute wird berechnet…</template>
        <template v-else>Karte anklicken oder Adresse suchen → Wegpunkt setzen</template>
      </p>
    </div>

    <div class="planner-controls">
      <div class="address-search">
        <label class="field-label" for="address-input">Adresse suchen</label>
        <div class="search-wrap">
          <input
            id="address-input"
            v-model="addressQuery"
            type="search"
            class="text-input"
            placeholder="z. B. Salzburg, Wien Hbf, Innsbruck"
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
        <p v-if="addressSearching" class="search-status">Suche…</p>
        <p v-else-if="addressError" class="search-error">{{ addressError }}</p>
        <p v-else class="search-hint">Treffer antippen → wird als Wegpunkt gesetzt</p>
      </div>

      <div class="waypoint-panel">
        <div class="panel-head">
          <h3>Wegpunkte ({{ waypoints.length }})</h3>
          <div class="panel-actions">
            <button type="button" class="btn-ghost" :disabled="!waypoints.length" @click="undoWaypoint">
              Rückgängig
            </button>
            <button type="button" class="btn-ghost" :disabled="!waypoints.length" @click="clearAll">
              Alle löschen
            </button>
          </div>
        </div>

        <ul v-if="waypoints.length" class="waypoint-list">
          <li v-for="(wp, i) in waypoints" :key="wp.id">
            <span class="wp-label">{{ waypointLabel(i, waypoints.length) }}</span>
            <span class="wp-coords">{{ waypointDisplay(wp) }}</span>
            <button type="button" class="wp-remove" title="Entfernen" @click="removeWaypoint(wp.id)">×</button>
          </li>
        </ul>
        <p v-else class="empty-hint">Klicke auf die Karte oder suche eine Adresse.</p>

        <p v-if="routeKm > 0" class="route-km">Radroute: ca. {{ routeKm.toFixed(1) }} km</p>
        <p v-else-if="waypoints.length >= 2 && routing" class="route-km muted">Route wird gezeichnet…</p>
      </div>

      <label class="field">
        <span class="field-label">Routenname</span>
        <input v-model="routeName" type="text" class="text-input" placeholder="z. B. Alpenüberquerung Tag 1" />
      </label>

      <div v-if="!isOrsConfigured()" class="ors-warning">
        <strong>OpenRouteService API-Key fehlt</strong>
        <p>
          Kostenlos auf
          <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer">openrouteservice.org</a>
          registrieren und <code>VITE_ORS_API_KEY</code> in <code>.env</code> eintragen.
        </p>
      </div>

      <label class="field">
        <span class="field-label">Max. Entfernung zur Route</span>
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
        <legend>POI-Kategorien</legend>
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
            {{ cat.label }}
          </button>
        </div>
      </fieldset>

      <p v-if="formError || store.error" class="error">{{ formError || store.error }}</p>

      <button type="button" class="btn-primary btn-full" :disabled="!canCreate" @click="createMap">
        {{ creating ? 'Lädt POIs…' : routing ? 'Route wird berechnet…' : 'Karte mit POIs erstellen' }}
      </button>
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
  max-height: min(46vh, 420px);
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
  gap: 0.35rem;
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

.route-km {
  font-weight: 600;
  color: var(--primary);
}

.route-km.muted {
  font-weight: 500;
  color: var(--text-muted);
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
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.85rem;
}

.cat-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
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
