<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../stores/mapStore'
import {
  POI_COLORS,
  POI_ICONS,
  ROUTE_CASING,
  ROUTE_COLOR,
  ROUTE_END_COLOR,
  ROUTE_START_COLOR,
  kmMarkerInterval,
  basemapStyle,
  loadBasemapPreference,
  saveBasemapPreference,
  type BasemapId,
} from '../config/mapStyle'
import { buildKmMarkers, buildGradeSegments, detectClimbs, hasElevationData } from '../utils/route'

const store = useMapStore()
const mapContainer = ref<HTMLDivElement | null>(null)
const mapCanvasWrap = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let resizeObserver: ResizeObserver | null = null

// ── Location Tracking ──
const locationWatchId = ref<number | null>(null)
const userLocation = ref<{ lat: number; lng: number; accuracy: number } | null>(null)
const locationError = ref('')
let locationMarker: maplibregl.Marker | null = null
let accuracyEl: HTMLDivElement | null = null
let bikeCursorMarker: maplibregl.Marker | null = null
let bikeCursorEl: HTMLDivElement | null = null

function createBikeCursorElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'route-bike-cursor'
  el.innerHTML = `
    <svg class="route-bike-icon" viewBox="0 0 64 40" aria-hidden="true">
      <g fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="14" cy="28" r="9"/>
        <circle cx="50" cy="28" r="9"/>
        <path d="M14 28 L26 28 L36 12 H48"/>
        <path d="M26 28 L36 12 L42 28"/>
        <path d="M36 12 L30 6 H38"/>
        <circle cx="26" cy="28" r="2.2" fill="#111" stroke="none"/>
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

function startLocation() {
  if (!navigator.geolocation) {
    locationError.value = 'Geolocation nicht unterstützt'
    return
  }
  locationError.value = ''
  locationWatchId.value = navigator.geolocation.watchPosition(
    (pos) => {
      userLocation.value = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      updateLocationMarker()
    },
    (err) => {
      locationError.value =
        err.code === 1 ? 'Standort-Zugriff verweigert' : 'Standort nicht verfügbar'
    },
    { enableHighAccuracy: true, maximumAge: 5000 }
  )
}

function stopLocation() {
  if (locationWatchId.value != null) {
    navigator.geolocation.clearWatch(locationWatchId.value)
    locationWatchId.value = null
  }
  userLocation.value = null
  locationError.value = ''
  locationMarker?.remove()
  locationMarker = null
  accuracyEl?.remove()
  accuracyEl = null
}

function updateLocationMarker() {
  if (!map || !userLocation.value) return
  const { lat, lng } = userLocation.value

  if (!locationMarker) {
    const dot = document.createElement('div')
    dot.className = 'user-location-dot'
    locationMarker = new maplibregl.Marker({ element: dot, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)
  } else {
    locationMarker.setLngLat([lng, lat])
  }
}

const locationActive = computed(() => locationWatchId.value != null)
const basemap = ref<BasemapId>(loadBasemapPreference())

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
    // Already restored (e.g. style.load + timeout)
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

  map.setStyle(basemapStyle(id), { diff: false })
  map.once('style.load', restoreOverlays)
  // Fallback falls style.load in manchen Fällen ausbleibt
  window.setTimeout(restoreOverlays, 400)
  window.setTimeout(restoreOverlays, 1200)
}

function poiGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: store.mapPois.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        category: p.category,
        name: p.name,
        icon: POI_ICONS[p.category] ?? '📍',
        color: POI_COLORS[p.category] ?? '#3388ff',
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

function routeGeoJson() {
  if (!store.routeCoords.length) {
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

function kmMarkerGeoJson() {
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
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: start },
        properties: { role: 'start', label: 'Start' },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: end },
        properties: { role: 'end', label: 'Ziel' },
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
  for (const [lng, lat] of store.routeCoords) {
    bounds.extend([lng, lat])
  }
  map.fitBounds(bounds, { padding: 48, duration: 0 })
}

function updateSources() {
  if (!map?.isStyleLoaded()) return
  ;(map.getSource('route') as maplibregl.GeoJSONSource)?.setData(routeGeoJson())
  ;(map.getSource('route-grades') as maplibregl.GeoJSONSource)?.setData(gradeGeoJson())
  ;(map.getSource('climbs') as maplibregl.GeoJSONSource)?.setData(climbsGeoJson())
  ;(map.getSource('route-ends') as maplibregl.GeoJSONSource)?.setData(endPointsGeoJson())
  ;(map.getSource('km-markers') as maplibregl.GeoJSONSource)?.setData(kmMarkerGeoJson())
  ;(map.getSource('pois') as maplibregl.GeoJSONSource)?.setData(poiGeoJson())
  ;(map.getSource('route-cursor') as maplibregl.GeoJSONSource)?.setData(routeCursorGeoJson())
  ;(map.getSource('favorites') as maplibregl.GeoJSONSource)?.setData(favoritesGeoJson())

  const hasGrades = hasElevationData(store.routePoints)
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

  updateBikeCursorMarker()
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
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7],
    },
  })

  map.addLayer({
    id: 'route-end-start',
    type: 'circle',
    source: 'route-ends',
    filter: ['==', ['get', 'role'], 'start'],
    paint: {
      'circle-radius': 12,
      'circle-color': ROUTE_START_COLOR,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'route-end-finish',
    type: 'circle',
    source: 'route-ends',
    filter: ['==', ['get', 'role'], 'end'],
    paint: {
      'circle-radius': 12,
      'circle-color': ROUTE_END_COLOR,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#fff',
    },
  })

  map.addLayer({
    id: 'route-end-labels',
    type: 'symbol',
    source: 'route-ends',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 12,
      'text-offset': [0, -2],
      'text-font': ['Open Sans Bold'],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#111',
      'text-halo-color': '#fff',
      'text-halo-width': 2,
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
      'text-font': ['Open Sans Bold'],
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
      'circle-color': '#7c2d12',
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
      'text-field': ['concat', ['get', 'label'], '\n', ['get', 'detail']],
      'text-size': 11,
      'text-offset': [0, -2.4],
      'text-font': ['Open Sans Bold'],
      'text-anchor': 'bottom',
      'text-line-height': 1.15,
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': '#7c2d12',
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
    layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
    paint: { 'text-color': '#fff' },
  })

  map.addLayer({
    id: 'poi-unclustered-halo',
    type: 'circle',
    source: 'pois',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 18,
      'circle-color': ['get', 'color'],
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
      'circle-color': ['get', 'color'],
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
      'text-field': ['get', 'icon'],
      'text-size': 16,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
    },
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
    id: 'route-cursor-halo',
    type: 'circle',
    source: 'route-cursor',
    paint: {
      'circle-radius': 18,
      'circle-color': '#fff',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#111',
      'circle-opacity': 0.92,
    },
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
  })
}

function initMap() {
  if (!mapContainer.value || map) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: basemapStyle(basemap.value),
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('load', () => {
    addLayers()
    fitBounds()
  })

  if (mapCanvasWrap.value) {
    resizeObserver = new ResizeObserver(() => {
      map?.resize()
    })
    resizeObserver.observe(mapCanvasWrap.value)
  }
}

watch(
  () => [store.mapPois, store.routeCoords, store.routePoints],
  () => updateSources(),
  { deep: true }
)

watch(() => store.routeCursor, () => updateSources())
watch(() => store.favorites, () => updateSources(), { deep: true })
watch(() => store.visibleCategories, () => updateSources(), { deep: true })

watch(() => store.poiFocusTick, () => {
  const coords = store.poiFocusCoords
  if (!coords) return
  focusOnPoi(coords[0], coords[1])
})

onMounted(() => {
  if (store.mapReady) initMap()
})

watch(
  () => store.mapReady,
  (ready) => {
    if (ready) initMap()
  }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  stopLocation()
  bikeCursorMarker?.remove()
  bikeCursorMarker = null
  bikeCursorEl = null
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="mapCanvasWrap" class="map-canvas-wrap">
    <div ref="mapContainer" class="map-canvas" />

    <div class="basemap-toggle" role="group" aria-label="Kartenstil">
      <button
        type="button"
        :class="{ active: basemap === 'standard' }"
        title="Standardkarte"
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

    <!-- Standort-Button -->
    <button
      type="button"
      class="location-btn"
      :class="{ active: locationActive }"
      :title="locationActive ? 'Standort deaktivieren' : 'Standort anzeigen'"
      @click="locationActive ? stopLocation() : startLocation()"
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="4" :fill="locationActive ? '#3b82f6' : 'currentColor'" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none" />
      </svg>
    </button>

    <p v-if="locationError" class="location-error">{{ locationError }}</p>
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
  bottom: 104px;
  right: 10px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(0,0,0,.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  color: #333;
  transition: background 0.15s;
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

.location-btn:hover {
  background: #f0f0f0;
}

.location-btn.active {
  background: #eff6ff;
  color: #3b82f6;
}

.location-btn svg {
  width: 100%;
  height: 100%;
}

.location-error {
  position: absolute;
  bottom: 148px;
  right: 50px;
  background: #fee2e2;
  color: #991b1b;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  font-size: 0.78rem;
  max-width: 200px;
  z-index: 10;
}
</style>

<style>
/* Standort-Punkt (global, da in dynamisch erstelltem Element) */
.user-location-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px #3b82f6, 0 2px 8px rgba(59,130,246,0.4);
}

/* Cursor-Fahrrad auf der Route (HTML-Marker) */
.route-bike-cursor {
  position: relative;
  width: 36px;
  height: 36px;
  pointer-events: none;
}

.route-bike-icon {
  position: absolute;
  inset: 4px;
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.9))
    drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
}
</style>
