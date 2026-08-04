import { ref } from 'vue'
import {
  buildGpxExport,
  downloadFile,
  downloadBinary,
  type PrintFavorite,
} from '../services/export'
import {
  createFitRouteExport,
  createGpxRouteExport,
  type RouteExportTarget,
} from '../services/routeExports'
import { useMapStore } from '../stores/mapStore'
import { tGlobal } from '../i18n'

function exportBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 48) || 'Route'
}

export type QrExportKind = 'gpx' | 'fit' | 'coros'

export function useMapExport() {
  const store = useMapStore()
  const cheatSheetOpen = ref(false)
  const qrOpen = ref(false)
  const qrBusy = ref(false)
  const qrUrl = ref('')
  const qrTitle = ref('')
  const qrHint = ref('')
  const qrError = ref('')
  const qrKind = ref<QrExportKind>('gpx')
  const qrAllowFitToggle = ref(false)
  const qrLocalDownload = ref<(() => void) | null>(null)

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

  function hasRealTrack(): boolean {
    return !store.isNearbyMap && store.routePoints.length >= 2
  }

  function buildGpxFavoritesPayload(): {
    name: string
    filename: string
    gpx: string
  } | null {
    if (!requireExportStops()) return null
    const name = courseName()
    const filename = `${name}-favoriten.gpx`
    const pois = exportWaypoints().map(({ label: _l, note: _n, ...poi }) => poi)
    const gpx = buildGpxExport(name, store.routePoints, pois, { markFavorites: true })
    return { name, filename, gpx }
  }

  /** GPX with track + favorites/control points. */
  function exportGpxFavorites() {
    const payload = buildGpxFavoritesPayload()
    if (!payload) return
    downloadFile(payload.filename, payload.gpx)
  }

  /** Track-only GPX. */
  function exportGpxRoute() {
    const name = courseName()
    downloadFile(
      `${name}.gpx`,
      buildGpxExport(name, store.routePoints, [], { markFavorites: false })
    )
  }

  async function buildFitCoursePayload(): Promise<{
    name: string
    filename: string
    bytes: Uint8Array
  } | null> {
    if (!hasRealTrack()) {
      alert(tGlobal('export.fitNeedsTrack'))
      return null
    }
    if (!requireExportStops()) return null
    try {
      const { buildFitCourseExport, MAX_FIT_COURSE_POINTS } = await import('../services/fitCourse')
      const name = courseName()
      const filename = `${name}-course.fit`
      const pois = exportWaypoints().map(({ label: _l, note: _n, ...poi }) => poi)
      if (pois.length > MAX_FIT_COURSE_POINTS) {
        alert(tGlobal('export.fitPointLimit', { max: MAX_FIT_COURSE_POINTS, count: pois.length }))
      }
      const bytes = buildFitCourseExport(name, store.routePoints, pois)
      return { name, filename, bytes }
    } catch (err) {
      console.error('[export] FIT failed', err)
      alert(tGlobal('export.fitFailed'))
      return null
    }
  }

  /** FIT Course with favorites + control points. */
  async function exportFitCourse() {
    const payload = await buildFitCoursePayload()
    if (!payload) return
    downloadBinary(payload.filename, payload.bytes, 'application/octet-stream')
  }

  function closeQrDialog() {
    qrOpen.value = false
    qrBusy.value = false
    qrUrl.value = ''
    qrError.value = ''
    qrKind.value = 'gpx'
    qrAllowFitToggle.value = false
    qrLocalDownload.value = null
  }

  function runQrLocalDownload() {
    qrLocalDownload.value?.()
    closeQrDialog()
  }

  async function openQrExport(kind: QrExportKind) {
    qrOpen.value = true
    qrBusy.value = true
    qrUrl.value = ''
    qrError.value = ''
    qrLocalDownload.value = null
    qrKind.value = kind
    qrAllowFitToggle.value = (kind === 'gpx' || kind === 'fit') && hasRealTrack()

    if (kind === 'fit') {
      qrTitle.value = tGlobal('export.qrTitleFit')
      qrHint.value = tGlobal('export.qrHintFit')
    } else if (kind === 'coros') {
      qrTitle.value = tGlobal('export.qrTitleCoros')
      qrHint.value = tGlobal('export.qrHintCoros')
    } else {
      qrTitle.value = tGlobal('export.qrTitleGpx')
      qrHint.value = tGlobal('export.qrHintGpx')
    }

    try {
      if (kind === 'fit') {
        const payload = await buildFitCoursePayload()
        if (!payload) {
          closeQrDialog()
          return
        }
        qrLocalDownload.value = () =>
          downloadBinary(payload.filename, payload.bytes, 'application/octet-stream')
        const created = await createFitRouteExport(payload)
        qrUrl.value = created.url
      } else {
        const payload = buildGpxFavoritesPayload()
        if (!payload) {
          closeQrDialog()
          return
        }
        qrLocalDownload.value = () => downloadFile(payload.filename, payload.gpx)
        const target: RouteExportTarget | null = kind === 'coros' ? 'coros' : null
        const created = await createGpxRouteExport({ ...payload, target })
        qrUrl.value = created.url
      }
    } catch (err) {
      console.error('[export] QR upload failed', err)
      qrError.value = err instanceof Error ? err.message : tGlobal('export.qrFailed')
    } finally {
      qrBusy.value = false
    }
  }

  async function switchQrFormat(next: 'gpx' | 'fit') {
    if (!qrAllowFitToggle.value) return
    if (next === qrKind.value) return
    await openQrExport(next)
  }

  /** COROS: QR on desktop (phone opens GPX); direct share/download on mobile. */
  async function exportForCoros(isDesktop: boolean) {
    if (isDesktop) {
      await openQrExport('coros')
      return
    }
    exportGpxFavorites()
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
    exportForCoros,
    openQrExport,
    switchQrFormat,
    closeQrDialog,
    runQrLocalDownload,
    printFavorites,
    openCheatSheet,
    closeCheatSheet,
    cheatSheetOpen,
    courseName,
    hasRealTrack,
    qrOpen,
    qrBusy,
    qrUrl,
    qrTitle,
    qrHint,
    qrError,
    qrKind,
    qrAllowFitToggle,
  }
}
