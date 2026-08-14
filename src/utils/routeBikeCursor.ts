import './routeBikeCursor.css'

/** MapLibre HTML marker for the elevation-profile scrubber. */
export function createRouteBikeCursorElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'route-bike-cursor'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = `
    <svg class="route-bike-icon" viewBox="0 0 64 40" width="26" height="16">
      <g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="14" cy="28" r="9"/>
        <circle cx="50" cy="28" r="9"/>
        <path d="M14 28 L26 28 L36 12 H48"/>
        <path d="M26 28 L36 12 L42 28"/>
        <path d="M36 12 L30 6 H38"/>
        <circle cx="26" cy="28" r="2.6" fill="#fff" stroke="none"/>
      </g>
    </svg>
  `
  return el
}
