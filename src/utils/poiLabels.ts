import type { PoiCategory } from '../../shared/types'
import { tGlobal } from '../i18n'

export function poiCategoryLabel(id: PoiCategory | string): string {
  const key = `poi.${id}`
  const translated = tGlobal(key)
  return translated === key ? id : translated
}

const CATEGORY_EMOJI: Record<string, string> = {
  fuel: '⛽',
  supermarket: '🛒',
  gastronomy: '🍴',
  water: '💧',
  beverages: '🍾',
  bike: '🔧',
  hotel: '🏨',
  campsite: '⛺',
  checkpoint: '⚑',
  sleep: '🛏',
  border: '🛂',
}

export function poiCategoryEmoji(id: PoiCategory | string): string {
  return CATEGORY_EMOJI[id] ?? '★'
}

/**
 * Filled solid silhouettes (viewBox 0 0 20 20) for map + print.
 * Closed shapes read clearly at ~16 CSS px on colored circle markers.
 */
export const POI_ICON_SVG: Record<string, string> = {
  // Pump body + nozzle (solid)
  fuel: `<path d="M3.2 1.8h8.2v13.2H8.8v2.4H5.8v-2.4H3.2V1.8zm8.2 3.4h2.4l2.4 2.4V17.2h-2.2V9.2h-2.6V5.2z"/>`,
  // Shopping bag
  supermarket: `<path d="M4.2 6.2h11.6l-1.15 11.2H5.35L4.2 6.2zm2.3 0V4.6a3.5 3.5 0 017 0v1.6h-1.7V4.6a1.8 1.8 0 00-3.6 0v1.6H6.5z"/>`,
  // Fork + knife (two solid pieces)
  gastronomy: `<path d="M2.2 1.8h1.6v5.2H5V1.8h1.6v5.2c0 1.4-.9 2.3-1.95 2.5V18.2H4.15V9.5C3.1 9.3 2.2 8.4 2.2 7V1.8zm10.2 0h2.1l.4 8.8h-1.5l-.3-5.2-.7 5.2h-1.6l1.2-6.4V1.8z"/><path d="M15.2 1.8h2.2v16.4h-2.2c0-4.2-1.8-5.8-1.8-9.6 0-2.8 1-4.4 1.8-6.8z"/>`,
  // Droplet
  water: `<path d="M10 1.8S3.4 9.2 3.4 13.2a6.6 6.6 0 0013.2 0C16.6 9.2 10 1.8 10 1.8z"/>`,
  // Bottle
  beverages: `<path d="M7.4 1.6h5.2l.9 2.8v1.2H6.5V4.4l.9-2.8zM6.5 6.4h7.2v11.2H6.5V6.4z"/>`,
  // Wheels + closed frame polygon
  bike: `<circle cx="5.2" cy="14.2" r="3.3"/><circle cx="14.8" cy="14.2" r="3.3"/><path d="M5.2 14.2L8.6 7h4.2l2 7.2h-2.4l-1.15-4.1H9L7.85 14.2H5.2z"/><path d="M8.6 7l1.7 3.4h2.3L11.2 7H8.6z"/>`,
  // Building + wing
  hotel: `<path d="M2 17.2V5.8h10.2v11.4H2zm10.2-8.2H18V17.2h-5.8V9zm-5.6.8h3.4v3.2H6.6V9.8z"/>`,
  // Tent
  campsite: `<path d="M10 2.2L1.6 17.4h16.8L10 2.2z"/>`,
  // Flag
  checkpoint: `<path d="M4.2 2v15.2h2V2H4.2zm2 0h9.2l-2.5 3.4 2.5 3.4H6.2V2z"/>`,
  // Bed
  sleep: `<path d="M2.2 13h15.6v3.4H2.2V13zm1.2-5.4h5.4V13H3.4V7.6zm8.2 2.2a3.2 3.2 0 013.2 3.2H11.6V9.8z"/>`,
  // Barrier posts + bar
  border: `<path d="M2.8 2.4h2.6v15.2H2.8V2.4zm11.8 0h2.6v15.2h-2.6V2.4zM5.4 8.6h9.2v2.8H5.4V8.6z"/>`,
}

const POI_ICON_SVG_FALLBACK = `<path d="M10 1.6l2.4 4.9 5.4.8-3.9 3.8 1 5.4L10 13.9 5.1 16.5l1-5.4L2.2 7.3l5.4-.8z"/>`

export function poiCategoryIconSvgInner(id: PoiCategory | string): string {
  return POI_ICON_SVG[id] ?? POI_ICON_SVG_FALLBACK
}

/**
 * Inline SVG markup for Spickzettel / print (viewBox 0 0 20 20).
 */
export function poiCategoryPrintSvg(id: PoiCategory | string): string {
  const inner = poiCategoryIconSvgInner(id)
  return `<svg class="ico" viewBox="0 0 20 20" width="11" height="11" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="#111827" stroke="none">${inner}</g></svg>`
}
