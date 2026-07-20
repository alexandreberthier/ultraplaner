import type { PoiCategory } from '../../shared/types'
import type { StyleSpecification } from 'maplibre-gl'

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** CyclOSM — freie OSM-Radkarte mit klaren Radwegen/Routen. */
export const CYCLOSM_STYLE: StyleSpecification = {
  version: 8,
  name: 'CyclOSM',
  // Fonts needed so route/POI labels still render after style switch
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    cyclosm: {
      type: 'raster',
      tiles: [
        'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.cyclosm.org">CyclOSM</a>',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'cyclosm',
      type: 'raster',
      source: 'cyclosm',
    },
  ],
}

export type BasemapId = 'standard' | 'cycling'

export function basemapStyle(id: BasemapId): string | StyleSpecification {
  return id === 'cycling' ? CYCLOSM_STYLE : MAP_STYLE_URL
}

const BASEMAP_STORAGE_KEY = 'onroute-basemap'

export function loadBasemapPreference(): BasemapId {
  try {
    const v = localStorage.getItem(BASEMAP_STORAGE_KEY)
    if (v === 'cycling' || v === 'standard') return v
  } catch {
    /* ignore */
  }
  return 'standard'
}

export function saveBasemapPreference(id: BasemapId) {
  try {
    localStorage.setItem(BASEMAP_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export const ROUTE_COLOR = '#111111'
export const ROUTE_CASING = '#ffffff'
export const ROUTE_START_COLOR = '#16a34a'
export const ROUTE_END_COLOR = '#dc2626'

export const POI_ICONS: Record<PoiCategory, string> = {
  fuel: '⛽',
  food: '🛒',
  restaurant: '🍽️',
  water: '💧',
  hotel: '🏨',
  campsite: '⛺',
  bike: '🔧',
}

export const POI_COLORS: Record<PoiCategory, string> = {
  fuel: '#f59e0b',
  food: '#22c55e',
  restaurant: '#84cc16',
  water: '#38bdf8',
  hotel: '#a78bfa',
  campsite: '#4ade80',
  bike: '#f87171',
}

export const GRADE_COLORS = [
  '#22c55e',
  '#84cc16',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#b91c1c',
]

/** Steigung in % → Farbe (Abfahrt = blau, flach = grün, steil = rot). */
export function gradeToColor(gradePercent: number): string {
  if (gradePercent <= -8) return '#3b82f6'
  if (gradePercent <= -3) return '#60a5fa'
  if (gradePercent < 2) return GRADE_COLORS[0]!
  if (gradePercent < 5) return GRADE_COLORS[1]!
  if (gradePercent < 8) return GRADE_COLORS[2]!
  if (gradePercent < 12) return GRADE_COLORS[3]!
  if (gradePercent < 18) return GRADE_COLORS[4]!
  return GRADE_COLORS[5]!
}

export const GRADE_LEGEND = [
  { label: 'Abfahrt', color: '#3b82f6' },
  { label: '< 2 %', color: '#22c55e' },
  { label: '2–5 %', color: '#84cc16' },
  { label: '5–8 %', color: '#eab308' },
  { label: '8–12 %', color: '#f97316' },
  { label: '> 12 %', color: '#ef4444' },
] as const

export const KM_MARKER_INTERVAL_KM = 25

export function kmMarkerInterval(_totalKm: number): number {
  return KM_MARKER_INTERVAL_KM
}
