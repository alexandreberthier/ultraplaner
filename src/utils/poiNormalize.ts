import type { Poi } from '../../shared/types'
import type { PoiCategory } from '../../shared/types'

const BEVERAGE_SUBTYPES = new Set(['Getränkemarkt', 'beverages'])

const SUPERMARKET_SUBTYPES = new Set(['Supermarkt', 'Tante-Mi-Laden'])

/** Outdoor water / cemetery types that are treated as always open (status + ETA filter). */
const ALWAYS_OPEN_OUTDOOR_SUBTYPES = new Set([
  'Trinkbrunnen',
  'Quelle',
  'Brunnen',
  'Friedhof',
])

/**
 * True for always-on outdoor water (fountains, springs, wells) and cemeteries
 * (graveyards used as water sources). Beverage shops are never always-open.
 */
export function isAlwaysAvailableWater(poi: Poi): boolean {
  if (poi.category === 'beverages') return false
  if (poi.category !== 'water') return false

  const st = poi.subType ?? ''
  if (BEVERAGE_SUBTYPES.has(st)) return false
  if (ALWAYS_OPEN_OUTDOOR_SUBTYPES.has(st)) return true
  if (/friedhof|cemetery|grave\s*yard|graveyard/i.test(st)) return true
  if (/trink|brunnen|quelle|fountain|spring|drinking\s*water|water\s*well/i.test(st)) {
    return true
  }
  // Legacy water tiles without a known shop subtype → outdoor always-open
  return !st || !/getränk|beverage|drink/i.test(st)
}

function isSupermarketSubType(subType: string | undefined): boolean {
  if (!subType) return false
  if (SUPERMARKET_SUBTYPES.has(subType)) return true
  return /supermarket|convenience|tante/i.test(subType)
}

/**
 * Remap legacy tile categories:
 * - Getränkemarkt stored as water → beverages
 * - food | restaurant → supermarket | gastronomy (by subType)
 */
export function normalizePoiCategory(poi: Poi): Poi {
  let category = poi.category as PoiCategory | 'food' | 'restaurant'

  if (category !== 'beverages' && poi.subType && BEVERAGE_SUBTYPES.has(poi.subType)) {
    return { ...poi, category: 'beverages' }
  }
  if (
    category === 'water' &&
    poi.subType &&
    !ALWAYS_OPEN_OUTDOOR_SUBTYPES.has(poi.subType) &&
    /getränk|beverage|drink/i.test(poi.subType)
  ) {
    return { ...poi, category: 'beverages' }
  }

  if (
    category === 'food' ||
    category === 'restaurant' ||
    category === 'supermarket' ||
    category === 'gastronomy'
  ) {
    category = isSupermarketSubType(poi.subType) ? 'supermarket' : 'gastronomy'
    return category === poi.category ? poi : { ...poi, category }
  }

  return poi
}

/** Expand legacy saved-map category lists that still use `food` / `restaurant`. */
export function expandLegacyCategories(categories: string[]): PoiCategory[] {
  const out = new Set<PoiCategory>()
  for (const c of categories) {
    if (c === 'food' || c === 'restaurant') {
      if (c === 'food') out.add('supermarket')
      out.add('gastronomy')
    } else {
      out.add(c as PoiCategory)
    }
  }
  return [...out]
}
