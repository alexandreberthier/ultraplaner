<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../stores/mapStore'
import {
  MAP_STYLE_URL,
  POI_COLORS,
  POI_ICONS,
  ROUTE_CASING,
  ROUTE_COLOR,
  ROUTE_END_COLOR,
  ROUTE_START_COLOR,
  kmMarkerInterval,
} from '../config/mapStyle'
import { buildKmMarkers } from '../utils/route'

const store = useMapStore()
const mapContainer = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null

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
  ;(map.getSource('route-ends') as maplibregl.GeoJSONSource)?.setData(endPointsGeoJson())
  ;(map.getSource('km-markers') as maplibregl.GeoJSONSource)?.setData(kmMarkerGeoJson())
  ;(map.getSource('pois') as maplibregl.GeoJSONSource)?.setData(poiGeoJson())
  ;(map.getSource('route-cursor') as maplibregl.GeoJSONSource)?.setData(routeCursorGeoJson())
}

function addLayers() {
  if (!map || map.getSource('route')) return

  map.addSource('route', { type: 'geojson', data: routeGeoJson() })
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
      'line-opacity': 1,
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
    id: 'km-markers',
    type: 'symbol',
    source: 'km-markers',
    layout: {
      'text-field': ['concat', ['get', 'label'], ' km'],
      'text-size': 10,
      'text-offset': [0, -1.2],
    },
    paint: {
      'text-color': '#374151',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
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
    id: 'route-cursor-halo',
    type: 'circle',
    source: 'route-cursor',
    paint: {
      'circle-radius': 16,
      'circle-color': '#fff',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#111',
    },
  })

  map.addLayer({
    id: 'route-cursor-bike',
    type: 'symbol',
    source: 'route-cursor',
    layout: {
      'text-field': '🚲',
      'text-size': 20,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
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

  const poiClickLayers = ['poi-unclustered-point', 'poi-unclustered-icons'] as const
  for (const layer of poiClickLayers) {
    map.on('click', layer, (e) => {
      const feat = e.features?.[0]
      const id = feat?.properties?.id as string | undefined
      if (!id) return
      const poi = store.displayPois.find((p) => p.id === id)
      if (poi) store.selectPoi(poi)
    })
    map.on('mouseenter', layer, () => {
      map!.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layer, () => {
      map!.getCanvas().style.cursor = ''
    })
  }
}

function initMap() {
  if (!mapContainer.value || map) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: MAP_STYLE_URL,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.on('load', () => {
    addLayers()
    fitBounds()
  })
}

watch(
  () => [store.mapPois, store.routeCoords, store.routePoints],
  () => updateSources(),
  { deep: true }
)

watch(() => store.routeCursor, () => updateSources())

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
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="mapContainer" class="map-canvas" />
</template>

<style scoped>
.map-canvas {
  width: 100%;
  height: 100%;
  min-height: 280px;
}
</style>
