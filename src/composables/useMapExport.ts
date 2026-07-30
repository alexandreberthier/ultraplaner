import { ref } from 'vue'
import {
  buildGpxExport,
  downloadFile,
  downloadBinary,
  type PrintFavorite,
} from '../services/export'
import { useMapStore } from '../stores/mapStore'
import { tGlobal } from '../i18n'

function exportBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 48) || 'Route'
}

export function useMapExport() {
  const store = useMapStore()
  const cheatSheetOpen = ref(false)

  function shareUrl() {
    if (!store.savedMapId) return ''
    return `${window.location.origin}/map/${store.savedMapId}`
  }

  function favoritePois() {
    return store.favoritePois
  }

  function labeledFavorites() {
    return store.favoritePois.map((p) => {
      const label = store.favoriteLabel(p)
      return {
        ...p,
        name: label,
        label,
        note: store.favoriteNote(p.id),
      }
    })
  }

  function exportWaypoints(): PrintFavorite[] {
    return store.exportStops as PrintFavorite[]
  }

  function requireExportStops(): boolean {
    if (store.exportStops.length > 0) return true
    alert(tGlobal('export.noFavorites'))
    return false
  }

  function courseName() {
    return exportBaseName(store.routeName)
  }

  /** GPX with track + favorites/control points. */
  function exportGpxFavorites() {
    if (!requireExportStops()) return
    const name = courseName()
    const pois = exportWaypoints().map(({ label: _l, note: _n, ...poi }) => poi)
    downloadFile(
      `${name}-favoriten.gpx`,
      buildGpxExport(name, store.routePoints, pois, { markFavorites: true })
    )
  }

  /** Track-only GPX. */
  function exportGpxRoute() {
    const name = courseName()
    downloadFile(
      `${name}.gpx`,
      buildGpxExport(name, store.routePoints, [], { markFavorites: false })
    )
  }

  /** FIT Course with favorites + control points. */
  async function exportFitCourse() {
    if (!requireExportStops()) return
    const { buildFitCourseExport, MAX_FIT_COURSE_POINTS } = await import('../services/fitCourse')
    const name = courseName()
    const pois = exportWaypoints().map(({ label: _l, note: _n, ...poi }) => poi)
    if (pois.length > MAX_FIT_COURSE_POINTS) {
      alert(tGlobal('export.fitPointLimit', { max: MAX_FIT_COURSE_POINTS, count: pois.length }))
    }
    const bytes = buildFitCourseExport(name, store.routePoints, pois)
    downloadBinary(`${name}-course.fit`, bytes, 'application/octet-stream')
  }

  function openCheatSheet() {
    if (!requireExportStops()) return
    cheatSheetOpen.value = true
  }

  function closeCheatSheet() {
    cheatSheetOpen.value = false
  }

  /** Legacy direct print (desktop strip). Prefer openCheatSheet on mobile. */
  function printFavorites() {
    openCheatSheet()
  }

  return {
    shareUrl,
    favoritePois,
    labeledFavorites,
    exportWaypoints,
    exportGpxRoute,
    exportGpxFavorites,
    exportFitCourse,
    printFavorites,
    openCheatSheet,
    closeCheatSheet,
    cheatSheetOpen,
    courseName,
  }
}
