/** True for iPhone / iPad (incl. iPadOS desktop UA). */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Homescreen / standalone PWA (Safari “Add to Home Screen”). */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function isSecureGeoContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
}
