import { buildGpxExport, buildCsvExport, downloadFile, printFavoritesSheet } from '../services/export'
import { useMapStore } from '../stores/mapStore'

export function useMapExport() {
  const store = useMapStore()

  function shareUrl() {
    if (!store.savedMapId) return ''
    return `${window.location.origin}/map/${store.savedMapId}`
  }

  function favoritePois() {
    return store.favoritePois
  }

  function exportGpxAll() {
    downloadFile(
      `${store.routeName}-pois.gpx`,
      buildGpxExport(store.routeName, store.routePoints, store.allPois)
    )
  }

  function exportGpxFavorites() {
    downloadFile(
      `${store.routeName}-favoriten.gpx`,
      buildGpxExport(store.routeName, store.routePoints, favoritePois())
    )
  }

  function exportCsv() {
    downloadFile(
      `${store.routeName}-pois.csv`,
      buildCsvExport(store.routeName, store.allPois),
      'text/csv;charset=utf-8'
    )
  }

  function printFavorites() {
    void printFavoritesSheet(
      store.routeName,
      store.totalKm,
      favoritePois(),
      shareUrl() || undefined,
      {
        avgSpeedKmh: store.avgSpeedKmh,
        startTimeHHmm: store.startTimeHHmm,
      }
    )
  }

  return {
    shareUrl,
    favoritePois,
    exportGpxAll,
    exportGpxFavorites,
    exportCsv,
    printFavorites,
  }
}
