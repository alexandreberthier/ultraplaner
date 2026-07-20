import type { Poi } from '../../shared/types'

export function isGooglePlacesConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
}

export interface PlaceHoursResult {
  openNow: boolean | null
  weekdayText: string[]
  source: 'google'
}

/** Lazy-load opening hours via Google Places API (New). Requires API key + billing. */
export async function fetchPlaceOpeningHours(poi: Poi): Promise<PlaceHoursResult | null> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!key) return null

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.regularOpeningHours,places.currentOpeningHours',
    },
    body: JSON.stringify({
      textQuery: poi.name,
      maxResultCount: 1,
      locationBias: {
        circle: {
          center: { latitude: poi.lat, longitude: poi.lng },
          radius: 250,
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Places: ${res.status} ${text}`)
  }

  const json = (await res.json()) as {
    places?: Array<{
      regularOpeningHours?: { weekdayDescriptions?: string[] }
      currentOpeningHours?: { openNow?: boolean }
    }>
  }

  const place = json.places?.[0]
  if (!place) return null

  return {
    openNow: place.currentOpeningHours?.openNow ?? null,
    weekdayText: place.regularOpeningHours?.weekdayDescriptions ?? [],
    source: 'google',
  }
}
