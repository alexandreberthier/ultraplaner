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

/** CyclOSM — freie OSM-Radkarte; tiles via cyclosm-offline protocol (cache + network). */
export const CYCLOSM_STYLE: StyleSpecification = {
  version: 8,
  name: 'CyclOSM',
  // Fonts needed so route/POI labels still render after style switch
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    cyclosm: {
      type: 'raster',
      tiles: ['cyclosm-offline://{z}/{x}/{y}'],
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

export function otherBasemap(id: BasemapId): BasemapId {
  return id === 'cycling' ? 'standard' : 'cycling'
}

/** True for style/tile failures that blank the map (Liberty schema, AJAX, CyclOSM). */
export function isBasemapStyleError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: string } | null | undefined)?.message ?? '')
  return /source layer .+ does not exist|does not exist on source ['"]?openmaptiles|failed to load (style|sprite|glyph|tile|source)|AJAXError|Failed to fetch|NetworkError|CyclOSM|status (4|5)\d\d|Load failed/i.test(
    msg
  )
}

const CYCLOSM_PROBE_HOSTS = [
  'https://a.tile-cyclosm.openstreetmap.fr/cyclosm',
  'https://b.tile-cyclosm.openstreetmap.fr/cyclosm',
  'https://c.tile-cyclosm.openstreetmap.fr/cyclosm',
] as const

/** Vienna-ish tile — enough to know CyclOSM responds. */
const CYCLOSM_PROBE_PATH = '10/550/335.png'

async function fetchOnce(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`Failed to load style/tile status ${res.status}`)
  return res
}

/** One automatic retry for transient network/tile failures. */
async function withOneRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (first) {
    await new Promise((r) => setTimeout(r, 350))
    try {
      return await run()
    } catch (second) {
      throw second instanceof Error ? second : first
    }
  }
}

async function probeCyclosmReachable(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    // Offline: pack/protocol may still serve tiles — don't block the style object.
    return
  }
  let lastErr: unknown
  for (const host of CYCLOSM_PROBE_HOSTS) {
    try {
      await fetchOnce(`${host}/${CYCLOSM_PROBE_PATH}`, { method: 'GET', cache: 'no-store' })
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('CyclOSM tiles unreachable')
}

/**
 * Resolve a basemap to a concrete StyleSpecification *before* setStyle,
 * so a dead primary URL never tears down a working map.
 * Retries the primary once, then throws (caller may fall back).
 */
export async function preloadBasemapStyle(id: BasemapId): Promise<StyleSpecification> {
  return withOneRetry(async () => {
    if (id === 'cycling') {
      await probeCyclosmReachable()
      return structuredClone(CYCLOSM_STYLE) as StyleSpecification
    }
    const res = await fetchOnce(MAP_STYLE_URL, { cache: 'no-store' })
    const style = (await res.json()) as StyleSpecification
    if (!style || style.version !== 8 || !style.sources) {
      throw new Error('Failed to load style: invalid Liberty JSON')
    }
    return style
  })
}

export type ResolvedBasemap = {
  id: BasemapId
  style: StyleSpecification
  usedFallback: boolean
  failedId?: BasemapId
}

/** Preferred style with 1× retry, then the other basemap (also 1× retry). */
export async function resolveBasemapWithFallback(
  preferred: BasemapId
): Promise<ResolvedBasemap> {
  try {
    const style = await preloadBasemapStyle(preferred)
    return { id: preferred, style, usedFallback: false }
  } catch (primaryErr) {
    console.warn(`[map] Basemap ${preferred} failed, trying fallback:`, primaryErr)
    const fallback = otherBasemap(preferred)
    const style = await preloadBasemapStyle(fallback)
    return { id: fallback, style, usedFallback: true, failedId: preferred }
  }
}

/** Snapshot for freeze-frame overlay while setStyle blanks the WebGL canvas. */
export function captureMapFrame(map: MaplibreMap): string | null {
  try {
    const canvas = map.getCanvas()
    if (!canvas.width || !canvas.height) return null
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
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

/** Flat dark → yellow → purple → fuchsia → rose (no orange→red adjacent steps). */
const GRADE_COLORS_STD = [
  '#1e293b',
  '#ca8a04',
  '#9333ea',
  '#c026d3',
  '#e11d48',
  '#881337',
]

/** Blue → yellow → orange → purple (Okabe-Ito style; no green/red slope scale). */
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

/** Steigung in % → Farbe (Standard: dunkel→gelb→lila→rosa; Farbblind: grau→lila). */
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
  { label: '5–8 %', color: '#9333ea' },
  { label: '8–12 %', color: '#c026d3' },
  { label: '> 12 %', color: '#e11d48' },
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
