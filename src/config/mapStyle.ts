import { ref } from 'vue'
import type { PoiCategory } from '../../shared/types'
import type { Map as MaplibreMap, StyleSpecification } from 'maplibre-gl'

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * OpenFreeMap serves glyphs per single font name only.
 * Do NOT pass a multi-font fallback stack — MapLibre requests
 * "Font A,Font B" as one path and OpenFreeMap returns 404.
 */
export const MAP_LABEL_FONT = ['Noto Sans Bold'] as const

/**
 * MapLibre defaults missing text-font to Open Sans Regular / Arial Unicode MS Regular,
 * which 404 on OpenFreeMap. Remap those glyph requests to Noto Sans.
 */
export function remapOpenFreeMapGlyphRequest(url: string): string {
  if (!url.includes('/fonts/')) return url
  return url
    .replace(/Open%20Sans%20Regular/gi, 'Noto%20Sans%20Regular')
    .replace(/Open%20Sans%20Bold/gi, 'Noto%20Sans%20Bold')
    .replace(/Open%20Sans%20Italic/gi, 'Noto%20Sans%20Italic')
    .replace(/Arial%20Unicode%20MS%20Regular/gi, 'Noto%20Sans%20Regular')
    .replace(/Arial%20Unicode%20MS%20Bold/gi, 'Noto%20Sans%20Bold')
}

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

/** True for OpenFreeMap/liberty tile-schema mismatches that blank the map. */
export function isBasemapStyleError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: string } | null | undefined)?.message ?? '')
  return /source layer .+ does not exist|does not exist on source ['"]?openmaptiles|failed to load (style|sprite|glyph)|AJAXError/i.test(
    msg
  )
}

/**
 * After setStyle: wait for style.load (+ idle), with a late safety timeout.
 * Avoids restoring overlays while the previous vector style is half-torn-down.
 */
export function whenStyleReady(map: MaplibreMap, onReady: () => void, safetyMs = 4000): () => void {
  let done = false
  let idleHandler: (() => void) | null = null

  const finish = () => {
    if (done) return
    done = true
    clearTimeout(safetyTimer)
    map.off('style.load', onStyleLoad)
    if (idleHandler) map.off('idle', idleHandler)
    try {
      onReady()
    } catch (err) {
      console.error('[map] Style-Ready-Callback fehlgeschlagen:', err)
    }
  }

  const onStyleLoad = () => {
    if (!map.isStyleLoaded()) {
      idleHandler = () => {
        if (map.isStyleLoaded()) finish()
      }
      map.once('idle', idleHandler)
      return
    }
    // One idle tick so vector sources settle before overlays attach
    idleHandler = () => finish()
    map.once('idle', idleHandler)
    window.setTimeout(finish, 250)
  }

  map.once('style.load', onStyleLoad)
  const safetyTimer = window.setTimeout(finish, safetyMs)

  return () => {
    done = true
    clearTimeout(safetyTimer)
    map.off('style.load', onStyleLoad)
    if (idleHandler) map.off('idle', idleHandler)
  }
}

const BASEMAP_STORAGE_KEY = 'onroute-basemap'
const COLORBLIND_STORAGE_KEY = 'onroute-colorblind'

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

export function loadColorblindPreference(): boolean {
  try {
    return localStorage.getItem(COLORBLIND_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveColorblindPreference(enabled: boolean) {
  try {
    localStorage.setItem(COLORBLIND_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Shared reactive flag — toggled via useColorblindMode(). */
export const colorblindMode = ref(loadColorblindPreference())

export const ROUTE_COLOR = '#111111'
export const ROUTE_CASING = '#ffffff'

const ROUTE_START_STD = '#16a34a'
const ROUTE_END_STD = '#dc2626'
const ROUTE_START_CB = '#0072B2'
const ROUTE_END_CB = '#D55E00'

/** @deprecated Use routeStartColor() */
export const ROUTE_START_COLOR = ROUTE_START_STD
/** @deprecated Use routeEndColor() */
export const ROUTE_END_COLOR = ROUTE_END_STD

export function routeStartColor(): string {
  return colorblindMode.value ? ROUTE_START_CB : ROUTE_START_STD
}

export function routeEndColor(): string {
  return colorblindMode.value ? ROUTE_END_CB : ROUTE_END_STD
}

const CLIMB_MARKER_STD = '#7c2d12'
const CLIMB_MARKER_CB = '#7B3294'

export function climbMarkerColor(): string {
  return colorblindMode.value ? CLIMB_MARKER_CB : CLIMB_MARKER_STD
}

const POI_COLORS_STD: Record<PoiCategory, string> = {
  fuel: '#f59e0b',
  supermarket: '#22c55e',
  gastronomy: '#fb923c',
  water: '#38bdf8',
  beverages: '#6366f1',
  hotel: '#a78bfa',
  campsite: '#4ade80',
  bike: '#f87171',
  checkpoint: '#dc2626',
  sleep: '#7c3aed',
  border: '#0f766e',
}

/** Okabe-Ito–inspired palette — avoids red/green pairs. */
const POI_COLORS_CB: Record<PoiCategory, string> = {
  fuel: '#E69F00',
  supermarket: '#0072B2',
  gastronomy: '#D55E00',
  water: '#56B4E9',
  beverages: '#332288',
  hotel: '#882255',
  campsite: '#F0E442',
  bike: '#CC6677',
  checkpoint: '#CC6677',
  sleep: '#882255',
  border: '#009E73',
}

/** @deprecated Use poiColors() */
export const POI_COLORS = POI_COLORS_STD

export function poiColors(): Record<PoiCategory, string> {
  return colorblindMode.value ? POI_COLORS_CB : POI_COLORS_STD
}

/** Flat uses dark slate (not green — blends with basemap parks/forests). */
const GRADE_COLORS_STD = [
  '#1e293b',
  '#ca8a04',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
  '#991b1b',
]

/** Blue → yellow → orange → purple (no green/red slope scale). */
const GRADE_COLORS_CB = [
  '#BABABA',
  '#F0E442',
  '#E69F00',
  '#D55E00',
  '#7B3294',
  '#40004B',
]

const GRADE_DESCENT_STD = { steep: '#1d4ed8', mild: '#2563eb' }
const GRADE_DESCENT_CB = { steep: '#2166AC', mild: '#4393C3' }

/** Steigung in % → Farbe (Standard: dunkel→gelb→rot; Farbblind: grau→lila). */
export function gradeToColor(gradePercent: number): string {
  const cb = colorblindMode.value
  const descent = cb ? GRADE_DESCENT_CB : GRADE_DESCENT_STD
  const colors = cb ? GRADE_COLORS_CB : GRADE_COLORS_STD

  if (gradePercent <= -8) return descent.steep
  if (gradePercent <= -3) return descent.mild
  if (gradePercent < 2) return colors[0]!
  if (gradePercent < 5) return colors[1]!
  if (gradePercent < 8) return colors[2]!
  if (gradePercent < 12) return colors[3]!
  if (gradePercent < 18) return colors[4]!
  return colors[5]!
}

export const GRADE_COLORS = GRADE_COLORS_STD

const GRADE_LEGEND_STD = [
  { label: 'Abfahrt', color: '#1d4ed8' },
  { label: '< 2 %', color: '#1e293b' },
  { label: '2–5 %', color: '#ca8a04' },
  { label: '5–8 %', color: '#f59e0b' },
  { label: '8–12 %', color: '#ea580c' },
  { label: '> 12 %', color: '#dc2626' },
] as const

const GRADE_LEGEND_CB = [
  { label: 'Abfahrt', color: '#2166AC' },
  { label: '< 2 %', color: '#BABABA' },
  { label: '2–5 %', color: '#F0E442' },
  { label: '5–8 %', color: '#E69F00' },
  { label: '8–12 %', color: '#D55E00' },
  { label: '> 12 %', color: '#7B3294' },
] as const

/** @deprecated Use gradeLegend() */
export const GRADE_LEGEND = GRADE_LEGEND_STD

export function gradeLegend() {
  return colorblindMode.value ? GRADE_LEGEND_CB : GRADE_LEGEND_STD
}

export const KM_MARKER_INTERVAL_KM = 25

export function kmMarkerInterval(_totalKm: number): number {
  return KM_MARKER_INTERVAL_KM
}
