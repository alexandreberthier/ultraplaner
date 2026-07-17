import type { PoiCategory } from '../../shared/types'

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export const ROUTE_COLOR = '#111111'
export const ROUTE_CASING = '#ffffff'
export const ROUTE_START_COLOR = '#16a34a'
export const ROUTE_END_COLOR = '#dc2626'

export const POI_ICONS: Record<PoiCategory, string> = {
  fuel: '⛽',
  food: '🛒',
  restaurant: '🍽️',
  water: '💧',
  kiosk: '🏪',
  vending: '🥤',
  toilets: '🚻',
  hotel: '🏨',
  alpine_hut: '🏔️',
  campsite: '⛺',
  shelter: '🛖',
  bike: '🔧',
}

export const POI_COLORS: Record<PoiCategory, string> = {
  fuel: '#f59e0b',
  food: '#22c55e',
  restaurant: '#84cc16',
  water: '#38bdf8',
  kiosk: '#fb923c',
  vending: '#a3e635',
  toilets: '#94a3b8',
  hotel: '#a78bfa',
  alpine_hut: '#8b5cf6',
  campsite: '#4ade80',
  shelter: '#78716c',
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

export function gradeToColor(gradePercent: number): string {
  if (gradePercent < 2) return GRADE_COLORS[0]
  if (gradePercent < 5) return GRADE_COLORS[1]
  if (gradePercent < 8) return GRADE_COLORS[2]
  if (gradePercent < 12) return GRADE_COLORS[3]
  if (gradePercent < 18) return GRADE_COLORS[4]
  return GRADE_COLORS[5]
}

export function kmMarkerInterval(totalKm: number): number {
  if (totalKm <= 50) return 5
  if (totalKm <= 200) return 10
  if (totalKm <= 500) return 25
  return 50
}
