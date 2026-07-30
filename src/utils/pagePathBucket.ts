/** Coarse route bucket for anonymous session stats (no map IDs or share tokens). */
export function pagePathBucket(path: string): string {
  if (path === '/' || /^\/(en|es|fr)$/.test(path)) return 'home'
  if (path.startsWith('/map')) return 'map'
  if (
    path.startsWith('/versorgung-ultracycling') ||
    path.startsWith('/en/ultracycling-supply') ||
    path.startsWith('/es/avituallamiento-ultracycling') ||
    path.startsWith('/fr/ravitaillement-ultracycling')
  ) {
    return 'supply'
  }
  if (path.startsWith('/datenschutz')) return 'privacy'
  if (path.startsWith('/impressum')) return 'imprint'
  if (path.startsWith('/oauth/wahoo')) return 'wahoo_callback'
  return 'other'
}
