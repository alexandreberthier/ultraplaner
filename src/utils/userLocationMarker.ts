/** Shared GPS / navigation-triangle marker for MapCanvas and RoutePlanner. */

export function createUserLocationElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'user-location-marker'
  el.innerHTML = `
    <div class="user-location-pulse"></div>
    <div class="user-location-arrow" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <path d="M20 4 L32 30 L20 24 L8 30 Z" fill="#2563eb" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
    </div>
  `
  return el
}

export function bearingBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Prefer device heading; else derive from movement between fixes. */
export function resolveGeoHeading(
  pos: GeolocationPosition,
  lastPos: { lat: number; lng: number } | null
): number | null {
  let heading =
    pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
      ? pos.coords.heading
      : null

  if (heading == null && lastPos) {
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const moved = Math.abs(lat - lastPos.lat) + Math.abs(lng - lastPos.lng)
    if (moved > 0.00002) {
      heading = bearingBetween(lastPos.lat, lastPos.lng, lat, lng)
    }
  }
  return heading
}

export function setLocationMarkerHeading(
  markerEl: HTMLElement,
  heading: number | null,
  headingUp = false
) {
  const arrow = markerEl.querySelector('.user-location-arrow') as HTMLElement | null
  if (!arrow) return
  const rot = heading == null ? 0 : headingUp ? 0 : heading
  arrow.style.transform = `rotate(${rot}deg)`
  arrow.classList.toggle('has-heading', heading != null)
}
