import OpeningHours from 'opening_hours'
import type { Poi } from '../../shared/types'
import { formatClock } from './eta'
import { isAlwaysAvailableWater } from './poiNormalize'

export type OpenStatus = 'open' | 'closed' | 'unknown'

/** Default slack after ETA when filtering (shop should stay open this long). */
export const DEFAULT_ETA_HOURS_BUFFER_MIN = 15

const TWENTY_FOUR_SEVEN = /^(24\s*\/\s*7|24\s*hours?)$/i

/** Shop-like categories: without OSM hours, night rides get a soft caution (not a closed status). */
const SHOP_LIKE_CATEGORIES = new Set(['supermarket', 'fuel', 'food', 'beverages', 'bike'])

function is24_7(openingHours: string | undefined | null): boolean {
  const v = openingHours?.trim()
  if (!v) return false
  if (TWENTY_FOUR_SEVEN.test(v)) return true
  return /\b00:00-24:00\b/.test(v) || /\b24:00\b/.test(v)
}

type BBox = { code: string; minLat: number; maxLat: number; minLng: number; maxLng: number }

/**
 * Rough ISO country_code for public-holiday (PH) evaluation.
 * Smallest / nested regions first; first match wins.
 */
const COUNTRY_BOXES: BBox[] = [
  { code: 'li', minLat: 47.05, maxLat: 47.28, minLng: 9.47, maxLng: 9.64 },
  { code: 'ad', minLat: 42.42, maxLat: 42.66, minLng: 1.41, maxLng: 1.79 },
  { code: 'mt', minLat: 35.78, maxLat: 36.09, minLng: 14.18, maxLng: 14.58 },
  { code: 'lu', minLat: 49.44, maxLat: 50.19, minLng: 5.73, maxLng: 6.53 },
  { code: 'mc', minLat: 43.72, maxLat: 43.76, minLng: 7.4, maxLng: 7.45 },
  { code: 'sm', minLat: 43.89, maxLat: 43.99, minLng: 12.41, maxLng: 12.52 },
  { code: 'va', minLat: 41.9, maxLat: 41.91, minLng: 12.44, maxLng: 12.46 },
  { code: 'cy', minLat: 34.5, maxLat: 35.7, minLng: 32.2, maxLng: 34.6 },
  { code: 'xk', minLat: 41.85, maxLat: 43.27, minLng: 20.01, maxLng: 21.8 },
  { code: 'me', minLat: 41.85, maxLat: 43.56, minLng: 18.43, maxLng: 20.36 },
  { code: 'mk', minLat: 40.85, maxLat: 42.37, minLng: 20.45, maxLng: 23.04 },
  { code: 'al', minLat: 39.64, maxLat: 42.66, minLng: 19.26, maxLng: 21.06 },
  { code: 'si', minLat: 45.42, maxLat: 46.88, minLng: 13.38, maxLng: 16.61 },
  { code: 'ba', minLat: 42.55, maxLat: 45.28, minLng: 15.72, maxLng: 19.62 },
  { code: 'hr', minLat: 42.37, maxLat: 46.55, minLng: 13.49, maxLng: 19.45 },
  { code: 'sk', minLat: 47.73, maxLat: 49.62, minLng: 16.83, maxLng: 22.57 },
  { code: 'cz', minLat: 48.55, maxLat: 51.06, minLng: 12.09, maxLng: 18.86 },
  { code: 'hu', minLat: 45.74, maxLat: 48.59, minLng: 16.11, maxLng: 22.9 },
  { code: 'at', minLat: 46.35, maxLat: 49.05, minLng: 9.45, maxLng: 17.25 },
  { code: 'ch', minLat: 45.8, maxLat: 47.85, minLng: 5.95, maxLng: 10.55 },
  { code: 'be', minLat: 49.49, maxLat: 51.51, minLng: 2.54, maxLng: 6.41 },
  { code: 'nl', minLat: 50.75, maxLat: 53.56, minLng: 3.35, maxLng: 7.23 },
  { code: 'dk', minLat: 54.56, maxLat: 57.75, minLng: 8.07, maxLng: 15.2 },
  { code: 'ee', minLat: 57.51, maxLat: 59.75, minLng: 21.76, maxLng: 28.21 },
  { code: 'lv', minLat: 55.67, maxLat: 58.09, minLng: 20.97, maxLng: 28.24 },
  { code: 'lt', minLat: 53.9, maxLat: 56.45, minLng: 20.94, maxLng: 26.84 },
  { code: 'ie', minLat: 51.38, maxLat: 55.43, minLng: -10.48, maxLng: -5.99 },
  { code: 'pt', minLat: 36.96, maxLat: 42.15, minLng: -9.53, maxLng: -6.19 },
  { code: 'bg', minLat: 41.23, maxLat: 44.23, minLng: 22.36, maxLng: 28.61 },
  { code: 'rs', minLat: 42.23, maxLat: 46.19, minLng: 18.81, maxLng: 23.01 },
  { code: 'ro', minLat: 43.62, maxLat: 48.27, minLng: 20.26, maxLng: 29.74 },
  { code: 'gr', minLat: 34.8, maxLat: 41.75, minLng: 19.37, maxLng: 29.65 },
  { code: 'pl', minLat: 49.0, maxLat: 54.84, minLng: 14.12, maxLng: 24.15 },
  { code: 'fi', minLat: 59.8, maxLat: 70.1, minLng: 20.55, maxLng: 31.59 },
  { code: 'se', minLat: 55.34, maxLat: 69.06, minLng: 11.11, maxLng: 24.17 },
  { code: 'no', minLat: 57.98, maxLat: 71.19, minLng: 4.5, maxLng: 31.1 },
  { code: 'is', minLat: 63.3, maxLat: 66.6, minLng: -24.55, maxLng: -13.5 },
  { code: 'gb', minLat: 49.86, maxLat: 60.86, minLng: -8.65, maxLng: 1.77 },
  { code: 'es', minLat: 27.6, maxLat: 43.8, minLng: -18.2, maxLng: 4.4 },
  { code: 'it', minLat: 36.6, maxLat: 47.1, minLng: 6.6, maxLng: 18.55 },
  { code: 'fr', minLat: 41.3, maxLat: 51.15, minLng: -5.15, maxLng: 9.6 },
  { code: 'de', minLat: 47.2, maxLat: 55.15, minLng: 5.8, maxLng: 15.1 },
]

export function countryCodeFromLatLng(lat?: number, lng?: number): string | undefined {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return undefined
  for (const b of COUNTRY_BOXES) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return b.code
  }
  return undefined
}

/** Soft night caution for shop-like POIs without OSM hours (UI only — never treated as closed). */
export function isShopLikeWithoutHours(
  poi: Pick<Poi, 'category' | 'openingHours' | 'subType'>
): boolean {
  if (isAlwaysAvailableWater(poi as Poi)) return false
  if (poi.openingHours?.trim()) return false
  return SHOP_LIKE_CATEGORIES.has(poi.category)
}

function nominatimContext(lat?: number, lng?: number) {
  if (lat == null || lng == null) return null
  const country_code = countryCodeFromLatLng(lat, lng)
  return {
    lat,
    lon: lng,
    address: { country_code: country_code ?? '', state: '' },
  }
}

export function hasOsmOpeningHours(poi: Pick<Poi, 'openingHours'>): boolean {
  return Boolean(poi.openingHours?.trim())
}

/** Evaluate OSM opening_hours at a given instant. Returns unknown on missing/invalid data. */
export function openStatusAt(
  openingHours: string | undefined | null,
  at: Date,
  lat?: number,
  lng?: number
): OpenStatus {
  const value = openingHours?.trim()
  if (!value) return 'unknown'

  try {
    const oh = new OpeningHours(value, nominatimContext(lat, lng))
    if (oh.getUnknown(at)) return 'unknown'
    return oh.getState(at) ? 'open' : 'closed'
  } catch {
    return 'unknown'
  }
}

export function openStatusAtEta(
  poi: Pick<Poi, 'openingHours' | 'lat' | 'lng' | 'category' | 'subType'>,
  arrival: Date | null | undefined,
  opts?: { bufferMinutes?: number }
): OpenStatus {
  if (!arrival) return 'unknown'
  if (isAlwaysAvailableWater(poi as Poi)) return 'open'
  if (is24_7(poi.openingHours)) return 'open'
  const buffer = Math.max(0, opts?.bufferMinutes ?? 0)
  const at = buffer > 0 ? new Date(arrival.getTime() + buffer * 60_000) : arrival
  return openStatusAt(poi.openingHours, at, poi.lat, poi.lng)
}

/** Human-readable next change after `at`, if available. */
export function nextChangeLabel(
  openingHours: string | undefined | null,
  at: Date,
  lat?: number,
  lng?: number
): string | null {
  const value = openingHours?.trim()
  if (!value) return null
  try {
    const oh = new OpeningHours(value, nominatimContext(lat, lng))
    const next = oh.getNextChange(at)
    if (!next) return null
    return formatClock(next)
  } catch {
    return null
  }
}

export function prettifyOpeningHours(openingHours: string | undefined | null, locale = 'de'): string | null {
  const value = openingHours?.trim()
  if (!value) return null
  try {
    const oh = new OpeningHours(value, null, { locale } as never)
    return oh.prettifyValue({ locale })
  } catch {
    return value
  }
}
