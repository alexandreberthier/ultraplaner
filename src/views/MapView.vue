<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useMapStore } from '../stores/mapStore'
import { useMapExport } from '../composables/useMapExport'
import MapCanvas from '../components/MapCanvas.vue'
import ElevationProfile from '../components/ElevationProfile.vue'
import PoiList from '../components/PoiList.vue'
import PoiCategoryFilter from '../components/PoiCategoryFilter.vue'
import PoiDetailSheet from '../components/PoiDetailSheet.vue'
import EtaPlanner from '../components/EtaPlanner.vue'
import WeatherStrip from '../components/WeatherStrip.vue'
import ControlPointsPanel from '../components/ControlPointsPanel.vue'
import NearbySearchPanel from '../components/NearbySearchPanel.vue'
import NearbyForm from '../components/NearbyForm.vue'
import CheatSheetPanel from '../components/CheatSheetPanel.vue'
import ExportQrDialog from '../components/ExportQrDialog.vue'
import OfflinePackPanel from '../components/OfflinePackPanel.vue'
import { useOnline } from '../composables/useOnline'
import { useI18n } from 'vue-i18n'
import TopbarSettings from '../components/TopbarSettings.vue'
import RecentRoutesMenu from '../components/RecentRoutesMenu.vue'
import { localeHomePath, type AppLocale } from '../i18n'
import { useRideMode } from '../composables/useRideMode'
import { useRidePosition } from '../composables/useRidePosition'
import { setActiveSidebarSection } from '../composables/useSidebarSection'
import { useWakeLock } from '../composables/useWakeLock'
import { useWahoo } from '../composables/useWahoo'
import { formatKm, haversineM } from '../services/geo'
import { formatDuration, formatClock, hoursForDistanceKm } from '../utils/eta'
import { openStatusAtEta, hasOsmOpeningHours, type OpenStatus } from '../utils/openingHours'
import { poiCategoryEmoji } from '../utils/poiLabels'
import type { ControlPointKind, Poi, PoiCategory } from '../../shared/types'

import { getPackMeta, type OfflinePackMeta } from '../services/offlinePacks'

const store = useMapStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const {
  exportGpxFavorites,
  exportGpxRoute,
  exportFitCourse,
  exportFitRoute,
  openQrExport,
  switchQrFormat,
  closeQrDialog,
  runQrLocalDownload,
  closeCheatSheet,
  cheatSheetOpen,
  exportWaypoints,
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
} = useMapExport()
const showPcFiles = ref(false)
const { isOnline } = useOnline()
const { rideMode, setRideMode } = useRideMode()
const { rideKmAlong, rideLatLng } = useRidePosition()
const wakeLock = useWakeLock()
const {
  configured: wahooConfigured,
  connected: wahooConnected,
  busy: wahooBusy,
  connect: connectWahoo,
  disconnect: disconnectWahoo,
  sendRoute: sendToWahoo,
} = useWahoo()
const mapCanvasRef = ref<{
  startLocation: (opts?: { follow?: boolean; heading?: boolean }) => void
  stopLocation: (opts?: { keepError?: boolean }) => void
  setDragPanEnabled: (enabled: boolean) => void
} | null>(null)

const SUPPLY_CATEGORIES = new Set<PoiCategory>([
  'fuel',
  'supermarket',
  'gastronomy',
  'water',
  'beverages',
  'bike',
])

const sidebarOpen = ref(true)
const mobilePanel = ref<'none' | 'pois' | 'export' | 'nearby'>('none')
const shareCopied = ref(false)
const showExportMenu = ref(false)
const showExportTip = ref(false)
const cpMenuOpen = ref(false)
const nearbyPanelRef = ref<{ setOpen: (value: boolean) => void } | null>(null)
const packMeta = ref<OfflinePackMeta | null>(null)

const hasOfflinePack = computed(
  () => packMeta.value?.status === 'ready' || packMeta.value?.status === 'partial'
)

async function refreshPackMeta() {
  if (!store.savedMapId) {
    packMeta.value = null
    return
  }
  packMeta.value = await getPackMeta(store.savedMapId)
}

watch(
  () => store.savedMapId,
  () => {
    void refreshPackMeta()
  }
)

const cpKinds: { id: ControlPointKind; labelKey: string; category: 'checkpoint' | 'sleep' }[] = [
  { id: 'cp', labelKey: 'controls.kindCp', category: 'checkpoint' },
  { id: 'sleep', labelKey: 'controls.kindSleep', category: 'sleep' },
]

function toggleCpMenu() {
  if (store.controlPointPlaceKind) {
    store.cancelPlaceControlPoint()
    cpMenuOpen.value = false
    return
  }
  cpMenuOpen.value = !cpMenuOpen.value
}

function startPlaceControlPoint(kind: ControlPointKind) {
  closeMobilePanel()
  showExportMenu.value = false
  store.beginPlaceControlPoint(kind)
  cpMenuOpen.value = !!store.controlPointPlaceKind
}

watch(
  () => store.controlPointPlaceKind,
  (kind) => {
    if (!kind) cpMenuOpen.value = false
  }
)

function openExportPanel(e?: Event) {
  e?.preventDefault()
  e?.stopPropagation()
  store.selectedPoi = null
  showExportMenu.value = false
  // Force-open (never toggle). Defer past the current click so document listeners
  // cannot immediately close the desktop menu again.
  if (isMobileLayout()) {
    mobilePanel.value = 'export'
    return
  }
  window.setTimeout(() => {
    showExportMenu.value = true
  }, 0)
}

function openNearbyPanel() {
  store.selectedPoi = null
  showExportMenu.value = false
  cpMenuOpen.value = false
  store.cancelPlaceControlPoint()
  if (rideMode.value) exitRideMode()
  if (isMobileLayout()) {
    mobilePanel.value = 'nearby'
    return
  }
  sidebarOpen.value = true
  nearbyPanelRef.value?.setOpen(true)
  mobilePanel.value = 'none'
}

function onNearbyDone() {
  closeMobilePanel()
}

async function maybeStartNearbyLocationFollow() {
  if (!store.mapReady) return
  if (!store.consumeLocationFollowRequest()) return
  // MapCanvas remounts on mapEpoch — wait until ref exposes startLocation
  for (let i = 0; i < 20; i++) {
    await nextTick()
    if (mapCanvasRef.value?.startLocation) {
      mapCanvasRef.value.startLocation({ follow: true, heading: true })
      return
    }
    await new Promise<void>((r) => setTimeout(r, 40))
  }
}

watch(
  () => [store.mapReady, store.mapEpoch, store.gpsFocusTick] as const,
  () => {
    void maybeStartNearbyLocationFollow()
  }
)

/** Nearby maps: Fahrt-Optionen in der Desktop-Sidebar auffindbar. */
watch(
  () => store.isNearbyMap && store.mapReady,
  (nearbyReady) => {
    if (!nearbyReady) return
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return
    }
    void nextTick(() => {
      nearbyPanelRef.value?.setOpen(true)
    })
  },
  { immediate: true }
)

function openExportMenuFromTip(e?: Event) {
  dismissExportTip()
  openExportPanel(e)
}

const EXPORT_TIP_KEY = 'ultraplaner-export-tip-seen'

const favCount = computed(() => store.exportStops.length)
const finishEta = computed(() => store.etaAtRouteKm(store.totalKm))
const rideDuration = computed(() => finishEta.value.durationLabel)

const rideFavorites = computed(() =>
  [...store.favoritePois].sort(
    (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
  )
)

type RideNextStop = {
  poi: Poi
  remainingKm: number
  durationLabel: string
  clockLabel: string | null
  openStatus: OpenStatus
  hasHours: boolean
}

function rideStopMeta(poi: Poi, remainingKm: number): RideNextStop {
  const hours = hoursForDistanceKm(remainingKm, store.avgSpeedKmh)
  const durationLabel = formatDuration(hours)
  const arrival = new Date(Date.now() + hours * 3600_000)
  const clockLabel = Number.isFinite(hours) ? formatClock(arrival) : null
  // Live riding: open status "now" (not ETA-at-arrival)
  const openStatus = openStatusAtEta(poi, new Date(), { bufferMinutes: 0 })
  return {
    poi,
    remainingKm,
    durationLabel,
    clockLabel,
    openStatus,
    hasHours: hasOsmOpeningHours(poi) || openStatus === 'open',
  }
}

/** Next fuel/shop/gastro/water/bike ahead of current GPS km. */
const nextSupply = computed((): RideNextStop | null => {
  const km = rideKmAlong.value ?? 0
  const ahead = store.displayPois
    .filter(
      (p) =>
        SUPPLY_CATEGORIES.has(p.category) &&
        (p.distanceAlongRouteKm ?? 0) > km + 0.15
    )
    .sort(
      (a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0)
    )
  const poi = ahead[0]
  if (!poi) return null
  return rideStopMeta(poi, (poi.distanceAlongRouteKm ?? 0) - km)
})

/** Next starred favorite ahead on the route. */
const nextFavorite = computed((): RideNextStop | null => {
  const km = rideKmAlong.value ?? 0
  const ahead = rideFavorites.value.filter(
    (p) => (p.distanceAlongRouteKm ?? 0) > km + 0.15
  )
  const poi = ahead[0]
  if (!poi) return null
  return rideStopMeta(poi, (poi.distanceAlongRouteKm ?? 0) - km)
})

/** Planning / Fahrt: compact distances to the nearest favorites. */
const favoriteHudStops = computed((): RideNextStop[] => {
  const favs = store.favoritePois
  if (!favs.length) return []

  if (store.isNearbyMap) {
    const origin = rideLatLng.value
      ? rideLatLng.value
      : store.routeCoords[0]
        ? { lat: store.routeCoords[0][1], lng: store.routeCoords[0][0] }
        : null
    if (!origin) return []
    return [...favs]
      .map((p) => rideStopMeta(p, haversineM(origin, { lat: p.lat, lng: p.lng }) / 1000))
      .sort((a, b) => a.remainingKm - b.remainingKm)
      .slice(0, 2)
  }

  const km = rideKmAlong.value ?? 0
  return [...favs]
    .map((p) => {
      const remaining = (p.distanceAlongRouteKm ?? 0) - km
      return { stop: rideStopMeta(p, Math.max(0, remaining)), remaining }
    })
    .sort((a, b) => {
      const aAhead = a.remaining > -0.05 ? 0 : 1
      const bAhead = b.remaining > -0.05 ? 0 : 1
      if (aAhead !== bAhead) return aAhead - bAhead
      return Math.abs(a.remaining) - Math.abs(b.remaining)
    })
    .slice(0, 2)
    .map((x) => x.stop)
})

function rideOpenLabel(stop: RideNextStop): string | null {
  if (stop.openStatus === 'open') return t('map.rideOpenNow')
  if (stop.openStatus === 'closed') return t('map.rideClosedNow')
  if (stop.hasHours) return t('map.rideHoursUnknown')
  return null
}

function enterRideMode() {
  mobilePanel.value = 'none'
  showExportMenu.value = false
  showExportTip.value = false
  setRideMode(true)
  wakeLock.bind()
  void wakeLock.request()
  // Sync call in tap handler — required for iOS geolocation permission
  mapCanvasRef.value?.startLocation({ follow: true, heading: true })
}

function exitRideMode() {
  setRideMode(false)
  mapCanvasRef.value?.stopLocation()
  void wakeLock.release()
  wakeLock.unbind()
}

function onRideKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !rideMode.value) return
  e.preventDefault()
  exitRideMode()
}

async function loadIfNeeded() {
  const id = route.params.id as string
  if (id === 'view') return
  if (!id) return
  if (store.savedMapId === id && store.mapReady) return
  await store.loadSavedMap(id)
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onRideKey)
  // Never start in ride cockpit — that hides toolbar/export/elevation
  if (rideMode.value) exitRideMode()
  if (store.mode === 'loading' && !store.mapReady) {
    void loadIfNeeded()
  } else if (!store.mapReady) {
    void loadIfNeeded()
  }
  // Export tip/sheet stay closed — open only via toolbar / bottom sheet
  void refreshPackMeta()
})

function dismissExportTip(permanent = true) {
  showExportTip.value = false
  if (!permanent) return
  try {
    localStorage.setItem(EXPORT_TIP_KEY, '1')
  } catch {
    /* ignore */
  }
}

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onRideKey)
  document.documentElement.classList.remove('map-overlay-open')
  wakeLock.unbind()
})

watch(
  () => store.savedMapId,
  (id) => {
    if (id && route.name === 'map-view') {
      router.replace(`/map/${id}`)
    }
  }
)

watch(
  () => route.params.id,
  () => {
    if (!store.mapReady) void loadIfNeeded()
  }
)

function shareUrl() {
  if (!store.savedMapId) return ''
  return `${window.location.origin}/map/${store.savedMapId}`
}

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function shareMap(fromSheet = false) {
  const url = shareUrl()
  if (!url) return

  if (canNativeShare) {
    try {
      await navigator.share({
        title: store.routeName,
        text: t('map.shareText', { name: store.routeName }),
        url,
      })
      if (fromSheet) closeMobilePanel()
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }

  await navigator.clipboard.writeText(url)
  shareCopied.value = true
  setTimeout(() => {
    shareCopied.value = false
  }, 2000)
}


function goHome() {
  if (store.mapReady && !window.confirm(t('map.leaveConfirm'))) return
  mobilePanel.value = 'none'
  // Store reset happens in onBeforeRouteLeave so MapCanvas can unmount cleanly
  void router.push(localeHomePath(locale.value as AppLocale))
}

onBeforeRouteLeave((to) => {
  const stayingOnMap = to.path.startsWith('/map')
  if (stayingOnMap) return true
  // Browser back / home: cancel stuck loading + release WebGL via mapReady=false
  if (store.mode === 'loading') {
    store.cancelLoading()
  } else if (store.mapReady || store.mode === 'map') {
    store.backToLanding()
  }
  return true
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function syncMapDragPan() {
  const overlayOpen = mobilePanel.value !== 'none' || Boolean(store.selectedPoi)
  document.documentElement.classList.toggle('map-overlay-open', overlayOpen)
  mapCanvasRef.value?.setDragPanEnabled(!overlayOpen)
}

function openMobilePanel(panel: 'pois' | 'export' | 'nearby') {
  cpMenuOpen.value = false
  mobilePanel.value = mobilePanel.value === panel ? 'none' : panel
  if (mobilePanel.value !== 'none') showExportMenu.value = false
  if (mobilePanel.value !== 'export') showPcFiles.value = false
  if (mobilePanel.value === 'pois') {
    setActiveSidebarSection('categories')
    void nextTick(() => {
      const scroller = document.querySelector('.mobile-sheet .sheet-scroll')
      if (scroller instanceof HTMLElement) scroller.scrollTop = 0
    })
  }
  syncMapDragPan()
}

function closeMobilePanel() {
  mobilePanel.value = 'none'
  showPcFiles.value = false
  syncMapDragPan()
}

watch(mobilePanel, () => {
  syncMapDragPan()
})

watch(
  () => store.selectedPoi,
  () => {
    syncMapDragPan()
  }
)

watch(mapCanvasRef, (canvas) => {
  if (canvas) syncMapDragPan()
})

function closeExportMenu() {
  showExportMenu.value = false
  showPcFiles.value = false
}

function togglePcFiles() {
  showPcFiles.value = !showPcFiles.value
}

function isMobileLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

function toggleExportMenu() {
  if (isMobileLayout()) {
    showExportMenu.value = false
    openMobilePanel('export')
    return
  }
  showExportMenu.value = !showExportMenu.value
}

function runExport(action: () => void | Promise<void>) {
  void Promise.resolve(action()).finally(() => {
    closeExportMenu()
  })
}

function onExportNameInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  store.setRouteName(value)
}

function onDocClick(e: MouseEvent) {
  if (!showExportMenu.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.export-wrap')) closeExportMenu()
}
</script>

<template>
  <div
    v-if="store.mapReady"
    class="map-layout"
    :class="{ 'sidebar-closed': !sidebarOpen, 'ride-mode': rideMode, 'nearby-map': store.isNearbyMap }"
  >
    <aside class="sidebar" :class="{ collapsed: !sidebarOpen }" :aria-hidden="!sidebarOpen">
      <header class="map-header">
        <div class="sidebar-head-row">
          <div class="sidebar-head-text">
            <h1>{{ store.routeName }}</h1>
            <p class="meta">
              <template v-if="store.isNearbyMap">
                {{ t('map.nearbyMeta', { m: store.poiRadiusM }) }}
                · {{ store.displayPois.length }} {{ t('map.pois') }}
              </template>
              <template v-else>
                {{ store.totalKm.toFixed(1) }} km · {{ rideDuration }}
                <template v-if="finishEta.clockLabel"> · {{ t('map.goal') }} {{ finishEta.clockLabel }}</template>
                · {{ store.displayPois.length }} {{ t('map.pois') }}
              </template>
              <template v-if="!store.showAllPoisOnMap && store.mapPoiThinnedCount > 0">
                · {{ t('map.poisOnMap', { count: store.mapPois.length }) }}
              </template>
            </p>
          </div>
        </div>
      </header>
      <div class="sidebar-body">
        <PoiCategoryFilter />
        <PoiList />
        <EtaPlanner v-if="!store.isNearbyMap" />
        <WeatherStrip v-if="!store.isNearbyMap" />
        <NearbySearchPanel ref="nearbyPanelRef" @done="onNearbyDone" />
        <ControlPointsPanel />
        <OfflinePackPanel @updated="refreshPackMeta" />
      </div>
    </aside>

    <main class="map-main">
      <header class="map-toolbar" :class="{ 'is-ride': rideMode }">
        <div class="toolbar-left">
          <button
            type="button"
            class="tool-btn sidebar-toggle"
            :aria-expanded="sidebarOpen"
            @click="toggleSidebar"
          >
            <span class="toggle-chevron">{{ sidebarOpen ? '‹' : '›' }}</span>
            <span class="toggle-label">{{ sidebarOpen ? t('map.hideList') : t('map.showList') }}</span>
          </button>
          <button type="button" class="tool-btn home-btn" :title="t('map.home')" @click="goHome">
            {{ t('landing.backHome') }}
          </button>
          <button
            v-if="!store.isNearbyMap"
            type="button"
            class="tool-btn ride-enter"
            :class="{ 'is-on': rideMode }"
            :title="rideMode ? t('map.rideOff') : t('map.rideOn')"
            @click="rideMode ? exitRideMode() : enterRideMode()"
          >
            {{ rideMode ? t('map.rideOff') : t('map.rideOn') }}
          </button>
        </div>

        <div class="toolbar-right desktop-actions">
          <div v-if="!store.isNearbyMap" class="export-wrap">
            <button
              type="button"
              class="tool-btn export-toggle"
              :class="{ active: showExportMenu }"
              aria-haspopup="menu"
              :aria-expanded="showExportMenu"
              :title="store.isNearbyMap ? t('map.exportTitleNearby') : t('map.exportRoute')"
              @click.stop="toggleExportMenu"
            >
              ↓ {{ store.isNearbyMap ? t('map.exportTitleNearby') : t('map.exportRoute') }} ▾
            </button>
            <div v-if="showExportMenu" class="export-menu" role="menu" @click.stop>
              <header class="export-menu-head">
                <strong>{{ store.isNearbyMap ? t('map.exportTitleNearby') : t('map.exportTitle') }}</strong>
              </header>

              <label class="export-name-field">
                <span>{{ store.isNearbyMap ? t('map.exportNameNearby') : t('map.exportName') }}</span>
                <input
                  type="text"
                  maxlength="48"
                  :value="store.routeName"
                  :placeholder="t('map.exportNamePlaceholder')"
                  @click.stop
                  @input="onExportNameInput"
                  @keydown.stop
                />
                <small>{{ store.isNearbyMap ? t('map.exportNameHintNearby') : t('map.exportNameHint') }}</small>
              </label>

              <p v-if="store.isNearbyMap" class="export-nearby-hint">{{ t('map.exportNearbyHint') }}</p>

              <!-- Fall A: Mit Favoriten/Kontrollpunkten -->
              <template v-if="favCount > 0">
                <!-- 1. QR / Aufs Handy -->
                <button
                  type="button"
                  class="export-item featured"
                  role="menuitem"
                  @click="runExport(() => openQrExport('gpx'))"
                >
                  <span class="export-icon">▦</span>
                  <span class="export-text">
                    <strong>{{ t('map.qrToPhone') }}</strong>
                    <small>{{ t('map.qrToPhoneHint') }}</small>
                  </span>
                </button>

                <!-- 2. PC herunterladen (GPX + FIT) -->
                <button
                  type="button"
                  class="export-item"
                  role="menuitem"
                  :aria-expanded="showPcFiles"
                  @click="togglePcFiles"
                >
                  <span class="export-icon">↓</span>
                  <span class="export-text">
                    <strong>{{ t('map.devicePc') }}</strong>
                    <small>
                      {{
                        store.isNearbyMap
                          ? t('map.devicePcHintNearby', { count: favCount })
                          : t('map.devicePcHint', { count: favCount })
                      }}
                    </small>
                  </span>
                </button>
                <div v-if="showPcFiles" class="export-pc-panel" role="group" :aria-label="t('map.devicePc')">
                  <button
                    type="button"
                    class="export-item nested"
                    role="menuitem"
                    @click="runExport(exportGpxFavorites)"
                  >
                    <span class="export-icon">↓</span>
                    <span class="export-text">
                      <strong>{{ store.isNearbyMap ? t('map.gpxFavNearby') : t('map.gpxFav') }}</strong>
                      <small>{{ t('map.gpxFavHint', { count: favCount }) }}</small>
                    </span>
                  </button>
                  <button
                    v-if="!store.isNearbyMap"
                    type="button"
                    class="export-item nested"
                    role="menuitem"
                    @click="runExport(exportFitCourse)"
                  >
                    <span class="export-icon">↓</span>
                    <span class="export-text">
                      <strong>{{ t('map.fitCourse') }}</strong>
                      <small>{{ t('map.fitCourseHint', { count: favCount }) }}</small>
                    </span>
                  </button>
                </div>

                <!-- 3. Wahoo -->
                <template v-if="!store.isNearbyMap">
                  <p class="export-section">{{ t('map.deviceWahoo') }}</p>
                  <button
                    v-if="wahooConfigured && !wahooConnected"
                    type="button"
                    class="export-item featured"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="runExport(() => connectWahoo())"
                  >
                    <span class="export-icon">☁</span>
                    <span class="export-text">
                      <strong>{{ t('wahoo.connect') }}</strong>
                      <small>{{ t('wahoo.connectHint') }}</small>
                    </span>
                  </button>
                  <button
                    v-if="wahooConfigured && wahooConnected"
                    type="button"
                    class="export-item featured"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="runExport(() => sendToWahoo())"
                  >
                    <span class="export-icon">☁</span>
                    <span class="export-text">
                      <strong>{{ wahooBusy ? t('wahoo.sending') : t('wahoo.send') }}</strong>
                      <small>{{ t('wahoo.sendHint', { count: favCount }) }}</small>
                    </span>
                  </button>
                  <button
                    v-if="wahooConfigured && wahooConnected"
                    type="button"
                    class="export-item"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="disconnectWahoo"
                  >
                    <span class="export-icon">✕</span>
                    <span class="export-text">
                      <strong>{{ t('wahoo.disconnect') }}</strong>
                      <small>{{ t('wahoo.disconnectHint') }}</small>
                    </span>
                  </button>
                  <details class="export-howto-details">
                    <summary>{{ t('map.howToggle') }}</summary>
                    <ol class="export-howto">
                      <li>{{ t('map.howWahoo1') }}</li>
                      <li>{{ t('map.howWahoo2') }}</li>
                      <li>{{ t('map.howWahoo3') }}</li>
                      <li>{{ t('map.howWahoo4') }}</li>
                    </ol>
                    <p class="export-howto-warn">{{ t('wahoo.cloudNote') }}</p>
                  </details>
                </template>
              </template>

              <!-- Fall B: Ohne Favoriten -->
              <template v-else-if="hasRealTrack()">
                <!-- 1. QR / Aufs Handy (routeOnly) -->
                <button
                  type="button"
                  class="export-item featured"
                  role="menuitem"
                  @click="runExport(() => openQrExport('gpx', { routeOnly: true }))"
                >
                  <span class="export-icon">▦</span>
                  <span class="export-text">
                    <strong>{{ t('map.qrToPhone') }}</strong>
                    <small>{{ t('map.qrToPhoneHint') }}</small>
                  </span>
                </button>

                <!-- 2. PC herunterladen (GPX + FIT, routeOnly) -->
                <button
                  type="button"
                  class="export-item"
                  role="menuitem"
                  :aria-expanded="showPcFiles"
                  @click="togglePcFiles"
                >
                  <span class="export-icon">↓</span>
                  <span class="export-text">
                    <strong>{{ t('map.devicePc') }}</strong>
                    <small>{{ t('map.exportPcRouteOnlyHint') }}</small>
                  </span>
                </button>
                <div v-if="showPcFiles" class="export-pc-panel" role="group" :aria-label="t('map.devicePc')">
                  <button
                    type="button"
                    class="export-item nested"
                    role="menuitem"
                    @click="runExport(exportGpxRoute)"
                  >
                    <span class="export-icon">↓</span>
                    <span class="export-text">
                      <strong>{{ t('map.gpxAll') }}</strong>
                      <small>{{ t('map.gpxAllHint') }}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="export-item nested"
                    role="menuitem"
                    @click="runExport(() => void exportFitRoute())"
                  >
                    <span class="export-icon">↓</span>
                    <span class="export-text">
                      <strong>{{ t('map.fitRouteOnly') }}</strong>
                      <small>{{ t('map.fitRouteOnlyHint') }}</small>
                    </span>
                  </button>
                </div>

                <!-- Wahoo auch ohne Favoriten anbieten -->
                <template v-if="!store.isNearbyMap">
                  <p class="export-section">{{ t('map.deviceWahoo') }}</p>
                  <button
                    v-if="wahooConfigured && !wahooConnected"
                    type="button"
                    class="export-item featured"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="runExport(() => connectWahoo())"
                  >
                    <span class="export-icon">☁</span>
                    <span class="export-text">
                      <strong>{{ t('wahoo.connect') }}</strong>
                      <small>{{ t('wahoo.connectHint') }}</small>
                    </span>
                  </button>
                  <button
                    v-if="wahooConfigured && wahooConnected"
                    type="button"
                    class="export-item featured"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="runExport(() => sendToWahoo())"
                  >
                    <span class="export-icon">☁</span>
                    <span class="export-text">
                      <strong>{{ wahooBusy ? t('wahoo.sending') : t('wahoo.send') }}</strong>
                      <small>{{ t('wahoo.sendHint', { count: favCount }) }}</small>
                    </span>
                  </button>
                  <button
                    v-if="wahooConfigured && wahooConnected"
                    type="button"
                    class="export-item"
                    role="menuitem"
                    :disabled="wahooBusy"
                    @click="disconnectWahoo"
                  >
                    <span class="export-icon">✕</span>
                    <span class="export-text">
                      <strong>{{ t('wahoo.disconnect') }}</strong>
                      <small>{{ t('wahoo.disconnectHint') }}</small>
                    </span>
                  </button>
                </template>
              </template>
            </div>
          </div>
          <RecentRoutesMenu brutal tool-style />
          <button
            v-if="store.savedMapId"
            type="button"
            class="tool-btn share-btn"
            :title="shareCopied ? t('map.linkCopied') : t('map.shareHintCopy')"
            @click="shareMap()"
          >
            {{ shareCopied ? `✓ ${t('map.linkCopied')}` : `🔗 ${t('map.share')}` }}
          </button>
          <TopbarSettings brutal force-menu />
        </div>
      </header>

      <button
        v-if="!sidebarOpen"
        type="button"
        class="sidebar-reopen"
        @click="sidebarOpen = true"
      >
        <span class="reopen-chevron">›</span>
        <span>{{ t('map.poiList') }}</span>
      </button>

      <Transition name="toast">
        <div
          v-if="!isOnline || store.loadedFromCache || hasOfflinePack"
          class="offline-banner"
          :class="{
            'pack-ready-banner': isOnline && hasOfflinePack,
            'pack-active-banner': !isOnline && hasOfflinePack,
          }"
          role="status"
        >
          <div class="offline-banner-text">
            <template v-if="!isOnline && hasOfflinePack">
              <strong>{{ t('map.offline') }}</strong>
              <span>{{ t('map.offlineBannerPack') }}</span>
            </template>
            <template v-else-if="!isOnline">
              <strong>{{ t('map.offline') }}</strong>
              <span>{{ t('map.offlineBanner') }}</span>
            </template>
            <template v-else-if="hasOfflinePack">
              <strong>{{ t('offlinePack.readyShort') }}</strong>
              <span>{{ t('map.offlinePackReadyBanner') }}</span>
            </template>
            <template v-else>
              <strong>{{ t('map.fromCache') }}</strong>
              <span>{{ t('map.cachedBanner') }}</span>
            </template>
          </div>
        </div>
      </Transition>

      <Transition name="toast">
        <div v-if="store.persistWarning" class="persist-banner" role="status">
          <div class="persist-banner-text">
            <strong>{{ t('map.saveWarnTitle') }}</strong>
            <span>{{ store.persistWarning }}</span>
          </div>
          <button type="button" class="toast-close" :aria-label="t('common.close')" @click="store.persistWarning = ''">
            ×
          </button>
        </div>
      </Transition>

      <Transition name="toast">
        <div v-if="showExportTip" class="export-tip" role="status">
          <div class="export-tip-text">
            <strong>{{ t('map.exportQuestion') }}</strong>
            <span class="tip-desktop">{{ t('map.exportTipDesktop') }}</span>
            <span class="tip-mobile">{{ t('map.exportTipMobile') }}</span>
          </div>
          <button type="button" class="export-tip-btn tip-desktop" @click.stop="openExportMenuFromTip">
            {{ t('map.openMenu') }}
          </button>
          <button type="button" class="export-tip-btn tip-mobile" @click.stop="openExportMenuFromTip">
            {{ t('map.openExport') }}
          </button>
          <button type="button" class="toast-close" :aria-label="t('common.close')" @click="dismissExportTip()">
            ×
          </button>
        </div>
      </Transition>

      <div class="map-stack">
        <MapCanvas ref="mapCanvasRef" :key="store.mapEpoch" :ride-mode="rideMode" @exit-ride="exitRideMode">
          <template v-if="!rideMode" #left-controls>
            <div v-if="!store.isNearbyMap" class="map-cp-tools" :aria-label="t('controls.mapFab')">
              <button
                type="button"
                class="map-cp-fab"
                :class="{ active: cpMenuOpen || !!store.controlPointPlaceKind }"
                :title="t('controls.mapFab')"
                :aria-expanded="cpMenuOpen || !!store.controlPointPlaceKind"
                @click="toggleCpMenu"
              >
                <span aria-hidden="true">⚑</span>
                <span class="map-cp-fab-label">{{ t('controls.kindCp') }}</span>
              </button>
              <div v-if="cpMenuOpen || store.controlPointPlaceKind" class="map-cp-menu" role="menu">
                <button
                  v-for="k in cpKinds"
                  :key="k.id"
                  type="button"
                  class="map-cp-kind"
                  role="menuitem"
                  :class="{ active: store.controlPointPlaceKind === k.id }"
                  @click="startPlaceControlPoint(k.id)"
                >
                  <span aria-hidden="true">{{ poiCategoryEmoji(k.category) }}</span>
                  {{ t(k.labelKey) }}
                </button>
              </div>
            </div>
          </template>
        </MapCanvas>
        <p v-if="store.poisLoading" class="pois-loading-banner" role="status">
          {{ t('nearby.loadingPois') }}
        </p>
        <ElevationProfile v-if="!rideMode && !store.isNearbyMap" />

        <div
          v-if="!rideMode && store.controlPointPlaceKind"
          class="map-cp-banner"
          role="status"
        >
          <span>{{ t('controls.placeHint') }}</span>
          <button type="button" @click="store.cancelPlaceControlPoint()">
            {{ t('controls.cancel') }}
          </button>
        </div>

        <div
          v-if="!rideMode && favoriteHudStops.length"
          class="fav-hud"
        >
          <button
            v-for="stop in favoriteHudStops"
            :key="stop.poi.id"
            type="button"
            class="fav-hud-btn"
            @click="store.selectPoi(stop.poi, true)"
          >
            <span class="fav-hud-kind">★ {{ t('map.rideNextFav') }}</span>
            <strong>{{ formatKm(stop.remainingKm) }}</strong>
            <span class="fav-hud-name">{{ store.favoriteLabel(stop.poi) }}</span>
          </button>
        </div>

        <div v-if="rideMode" class="ride-overlay" :aria-label="t('map.rideOn')">
          <div class="ride-top-row">
            <button type="button" class="ride-exit" @click="exitRideMode">
              {{ t('map.rideOff') }}
            </button>
            <button type="button" class="ride-nearby" @click="openNearbyPanel">
              {{ t('nearby.mapFab') }}
            </button>
          </div>

          <div class="ride-cockpit">
            <button
              v-if="nextSupply"
              type="button"
              class="ride-primary"
              @click="store.selectPoi(nextSupply.poi, true)"
            >
              <span class="ride-primary-kind">
                <span aria-hidden="true">{{ poiCategoryEmoji(nextSupply.poi.category) }}</span>
                {{ t('map.rideNextSupply') }}
              </span>
              <strong class="ride-primary-dist">{{ formatKm(nextSupply.remainingKm) }}</strong>
              <span class="ride-primary-name">{{ nextSupply.poi.name }}</span>
              <span
                v-if="rideOpenLabel(nextSupply)"
                class="ride-open ride-open-sm"
                :class="`ride-open--${nextSupply.openStatus}`"
              >
                {{ rideOpenLabel(nextSupply) }}
              </span>
            </button>
            <p v-else class="ride-primary-empty">{{ t('map.rideNoSupply') }}</p>

            <button
              v-if="nextFavorite"
              type="button"
              class="ride-secondary"
              @click="store.selectPoi(nextFavorite.poi, true)"
            >
              <span class="ride-secondary-kind">{{ t('map.rideNextFav') }}</span>
              <strong>{{ formatKm(nextFavorite.remainingKm) }}</strong>
              <span class="ride-secondary-name">{{ store.favoriteLabel(nextFavorite.poi) }}</span>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile bottom nav — same order in Fahrt + Planung -->
    <nav v-show="!rideMode" class="mobile-nav" :aria-label="t('map.mobileNav')">
      <button
        type="button"
        class="nav-item nav-home"
        :title="t('map.navStart')"
        :aria-label="t('map.navStart')"
        @click="goHome"
      >
        <span class="nav-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11.2 12 4l8 7.2" />
            <path d="M6.5 10.2V20h4.2v-6.2h2.6V20h4.2V10.2" />
          </svg>
        </span>
        <span class="nav-label">{{ t('map.navStart') }}</span>
      </button>
      <button
        type="button"
        class="nav-item nav-radius"
        :class="{ active: mobilePanel === 'nearby' }"
        :title="t('nearby.panelTitle')"
        :aria-label="t('nearby.panelTitle')"
        @click="openNearbyPanel"
      >
        <span class="nav-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 21v-7M4 8V3" />
            <path d="M12 21v-9M12 6V3" />
            <path d="M20 21v-5M20 10V3" />
            <path d="M2 14h4M10 6h4M18 16h4" />
          </svg>
        </span>
        <span class="nav-label">{{ t('map.navNearby') }}</span>
      </button>
      <div v-if="!store.isNearbyMap" class="nav-cp-wrap">
        <button
          type="button"
          class="nav-item nav-cp"
          :class="{ active: cpMenuOpen || !!store.controlPointPlaceKind }"
          :title="t('controls.mapFab')"
          :aria-label="t('controls.mapFab')"
          :aria-expanded="cpMenuOpen || !!store.controlPointPlaceKind"
          @click="toggleCpMenu"
        >
          <span class="nav-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 22V3.8s.9 1 3.6 1 4.6-1.8 7.3-1.8 3.6.9 3.6.9v11.4s-.9-.9-3.6-.9-4.6 1.8-7.3 1.8-3.6-.9-3.6-.9" />
            </svg>
          </span>
          <span class="nav-label">{{ t('map.navCp') }}</span>
        </button>
        <div v-if="cpMenuOpen || store.controlPointPlaceKind" class="nav-cp-menu" role="menu">
          <button
            v-for="k in cpKinds"
            :key="k.id"
            type="button"
            class="nav-cp-kind"
            role="menuitem"
            :class="{ active: store.controlPointPlaceKind === k.id }"
            @click="startPlaceControlPoint(k.id)"
          >
            <span aria-hidden="true">{{ poiCategoryEmoji(k.category) }}</span>
            {{ t(k.labelKey) }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="nav-item nav-pois"
        :class="{ active: mobilePanel === 'pois' }"
        :title="t('map.navPois', { count: store.displayPois.length })"
        :aria-label="t('map.navPois', { count: store.displayPois.length })"
        @click="openMobilePanel('pois')"
      >
        <span class="nav-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-6.4 8-12.2A8 8 0 1 0 4 9.8C4 15.6 12 22 12 22z" />
            <circle cx="12" cy="9.8" r="2.4" />
          </svg>
          <span v-if="store.displayPois.length" class="nav-badge">{{ store.displayPois.length }}</span>
        </span>
        <span class="nav-label">{{ t('map.navPoisShort') }}</span>
      </button>
      <button
        v-if="!store.isNearbyMap"
        type="button"
        class="nav-item nav-ride"
        :title="t('map.rideOn')"
        :aria-label="t('map.rideOn')"
        @click="enterRideMode"
      >
        <span class="nav-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="5.5" cy="17.5" r="3.2" />
            <circle cx="18.5" cy="17.5" r="3.2" />
            <circle cx="15" cy="5.2" r="1.15" fill="currentColor" stroke="none" />
            <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
          </svg>
        </span>
        <span class="nav-label">{{ t('map.rideOn') }}</span>
      </button>
      <button
        v-if="!store.isNearbyMap"
        type="button"
        class="nav-item nav-export"
        :class="{ active: mobilePanel === 'export' }"
        :title="t('map.navExport')"
        :aria-label="t('map.navExport')"
        @click="openMobilePanel('export')"
      >
        <span class="nav-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </span>
        <span class="nav-label">{{ t('map.navExport') }}</span>
      </button>
    </nav>

    <div
      v-if="mobilePanel !== 'none'"
      class="mobile-sheet"
      :class="{ 'nearby-open': mobilePanel === 'nearby', 'pois-open': mobilePanel === 'pois' }"
      @click.self="closeMobilePanel"
      @touchmove.self.prevent
      @wheel.self.prevent
    >
      <div
        class="mobile-sheet-inner"
        @touchmove.stop
        @pointerdown.stop
        @wheel.stop
      >
        <header class="sheet-header">
          <h2>
            {{
              mobilePanel === 'pois'
                ? t('map.sheetPois')
                : mobilePanel === 'export'
                  ? store.isNearbyMap
                    ? t('map.exportTitleNearby')
                    : t('map.sheetExport')
                  : t('map.sheetNearby')
            }}
          </h2>
          <button type="button" class="sheet-close" @click="closeMobilePanel">×</button>
        </header>
        <div v-if="mobilePanel === 'nearby'" class="sheet-scroll nearby-sheet">
          <NearbyForm in-map @done="onNearbyDone" />
        </div>
        <div v-else-if="mobilePanel === 'pois'" class="sheet-scroll">
          <PoiCategoryFilter embedded />
          <PoiList embedded />
          <EtaPlanner v-if="!store.isNearbyMap" embedded />
          <WeatherStrip v-if="!store.isNearbyMap" embedded />
          <ControlPointsPanel />
          <OfflinePackPanel @updated="refreshPackMeta" />
        </div>
        <div v-else-if="mobilePanel === 'export'" class="export-sheet-body">
          <label class="export-name-field sheet">
            <span>{{ store.isNearbyMap ? t('map.exportNameNearby') : t('map.exportName') }}</span>
            <input
              type="text"
              maxlength="48"
              :value="store.routeName"
              :placeholder="t('map.exportNamePlaceholder')"
              @input="onExportNameInput"
            />
            <small>{{ store.isNearbyMap ? t('map.exportNameHintNearby') : t('map.exportNameHint') }}</small>
          </label>

          <p v-if="store.isNearbyMap" class="export-nearby-hint">{{ t('map.exportNearbyHint') }}</p>

          <!-- Fall A: Mit Favoriten/Kontrollpunkten -->
          <template v-if="favCount > 0">
            <!-- 1. QR / Aufs Handy -->
            <button
              type="button"
              class="export-sheet-btn featured"
              @click="void openQrExport('gpx').then(() => closeMobilePanel())"
            >
              <span class="sheet-btn-icon">▦</span>
              <span>
                <strong>{{ t('map.qrToPhone') }}</strong>
                <small>{{ t('map.qrToPhoneHint') }}</small>
              </span>
            </button>

            <!-- 2. PC herunterladen (GPX + FIT) -->
            <button
              type="button"
              class="export-sheet-btn"
              :aria-expanded="showPcFiles"
              @click="togglePcFiles"
            >
              <span class="sheet-btn-icon">↓</span>
              <span>
                <strong>{{ t('map.devicePc') }}</strong>
                <small>
                  {{
                    store.isNearbyMap
                      ? t('map.devicePcHintNearby', { count: favCount })
                      : t('map.devicePcHint', { count: favCount })
                  }}
                </small>
              </span>
            </button>
            <div v-if="showPcFiles" class="export-pc-panel sheet" role="group" :aria-label="t('map.devicePc')">
              <button
                type="button"
                class="export-sheet-btn nested"
                @click="exportGpxFavorites(); closeMobilePanel()"
              >
                <span class="sheet-btn-icon">↓</span>
                <span>
                  <strong>
                    {{
                      store.isNearbyMap
                        ? t('map.gpxFavNearbyShort', { count: favCount })
                        : t('map.gpxFavShort', { count: favCount })
                    }}
                  </strong>
                  <small>{{ t('map.gpxFavHint', { count: favCount }) }}</small>
                </span>
              </button>
              <button
                v-if="!store.isNearbyMap"
                type="button"
                class="export-sheet-btn nested"
                @click="void exportFitCourse().then(() => closeMobilePanel())"
              >
                <span class="sheet-btn-icon">↓</span>
                <span>
                  <strong>{{ t('map.fitCourseShort', { count: favCount }) }}</strong>
                  <small>{{ t('map.fitCourseHint', { count: favCount }) }}</small>
                </span>
              </button>
            </div>

            <!-- 3. Wahoo -->
            <template v-if="!store.isNearbyMap">
              <p class="export-sheet-section">{{ t('map.deviceWahoo') }}</p>
              <button
                v-if="wahooConfigured && !wahooConnected"
                type="button"
                class="export-sheet-btn featured"
                :disabled="wahooBusy"
                @click="void connectWahoo()"
              >
                <span class="sheet-btn-icon">☁</span>
                <span>
                  <strong>{{ t('wahoo.connect') }}</strong>
                  <small>{{ t('wahoo.connectHint') }}</small>
                </span>
              </button>
              <button
                v-if="wahooConfigured && wahooConnected"
                type="button"
                class="export-sheet-btn featured"
                :disabled="wahooBusy"
                @click="void sendToWahoo().then(() => closeMobilePanel())"
              >
                <span class="sheet-btn-icon">☁</span>
                <span>
                  <strong>{{ wahooBusy ? t('wahoo.sending') : t('wahoo.send') }}</strong>
                  <small>{{ t('wahoo.sendHint', { count: favCount }) }}</small>
                </span>
              </button>
              <button
                v-if="wahooConfigured && wahooConnected"
                type="button"
                class="export-sheet-btn"
                :disabled="wahooBusy"
                @click="disconnectWahoo"
              >
                <span class="sheet-btn-icon">✕</span>
                <span>
                  <strong>{{ t('wahoo.disconnect') }}</strong>
                  <small>{{ t('wahoo.disconnectHint') }}</small>
                </span>
              </button>
              <details class="export-howto-details">
                <summary>{{ t('map.howToggle') }}</summary>
                <ol class="export-howto">
                  <li>{{ t('map.howWahoo1') }}</li>
                  <li>{{ t('map.howWahoo2') }}</li>
                  <li>{{ t('map.howWahoo3') }}</li>
                  <li>{{ t('map.howWahoo4') }}</li>
                </ol>
                <p class="export-howto-warn">{{ t('wahoo.cloudNote') }}</p>
              </details>
            </template>
          </template>

          <!-- Fall B: Ohne Favoriten -->
          <template v-else-if="hasRealTrack()">
            <!-- 1. QR / Aufs Handy (routeOnly) -->
            <button
              type="button"
              class="export-sheet-btn featured"
              @click="void openQrExport('gpx', { routeOnly: true }).then(() => closeMobilePanel())"
            >
              <span class="sheet-btn-icon">▦</span>
              <span>
                <strong>{{ t('map.qrToPhone') }}</strong>
                <small>{{ t('map.qrToPhoneHint') }}</small>
              </span>
            </button>

            <!-- 2. PC herunterladen (GPX + FIT, routeOnly) -->
            <button
              type="button"
              class="export-sheet-btn"
              :aria-expanded="showPcFiles"
              @click="togglePcFiles"
            >
              <span class="sheet-btn-icon">↓</span>
              <span>
                <strong>{{ t('map.devicePc') }}</strong>
                <small>{{ t('map.exportPcRouteOnlyHint') }}</small>
              </span>
            </button>
            <div v-if="showPcFiles" class="export-pc-panel sheet" role="group" :aria-label="t('map.devicePc')">
              <button
                type="button"
                class="export-sheet-btn nested"
                @click="exportGpxRoute(); closeMobilePanel()"
              >
                <span class="sheet-btn-icon">↓</span>
                <span>
                  <strong>{{ t('map.gpxAll') }}</strong>
                  <small>{{ t('map.gpxAllHint') }}</small>
                </span>
              </button>
              <button
                type="button"
                class="export-sheet-btn nested"
                @click="void exportFitRoute().then(() => closeMobilePanel())"
              >
                <span class="sheet-btn-icon">↓</span>
                <span>
                  <strong>{{ t('map.fitRouteOnly') }}</strong>
                  <small>{{ t('map.fitRouteOnlyHint') }}</small>
                </span>
              </button>
            </div>

            <!-- Wahoo auch ohne Favoriten anbieten -->
            <template v-if="!store.isNearbyMap">
              <p class="export-sheet-section">{{ t('map.deviceWahoo') }}</p>
              <button
                v-if="wahooConfigured && !wahooConnected"
                type="button"
                class="export-sheet-btn featured"
                :disabled="wahooBusy"
                @click="void connectWahoo()"
              >
                <span class="sheet-btn-icon">☁</span>
                <span>
                  <strong>{{ t('wahoo.connect') }}</strong>
                  <small>{{ t('wahoo.connectHint') }}</small>
                </span>
              </button>
              <button
                v-if="wahooConfigured && wahooConnected"
                type="button"
                class="export-sheet-btn featured"
                :disabled="wahooBusy"
                @click="void sendToWahoo().then(() => closeMobilePanel())"
              >
                <span class="sheet-btn-icon">☁</span>
                <span>
                  <strong>{{ wahooBusy ? t('wahoo.sending') : t('wahoo.send') }}</strong>
                  <small>{{ t('wahoo.sendHint', { count: favCount }) }}</small>
                </span>
              </button>
              <button
                v-if="wahooConfigured && wahooConnected"
                type="button"
                class="export-sheet-btn"
                :disabled="wahooBusy"
                @click="disconnectWahoo"
              >
                <span class="sheet-btn-icon">✕</span>
                <span>
                  <strong>{{ t('wahoo.disconnect') }}</strong>
                  <small>{{ t('wahoo.disconnectHint') }}</small>
                </span>
              </button>
            </template>
          </template>

          <button
            v-if="store.savedMapId"
            type="button"
            class="export-sheet-btn"
            @click="shareMap(true)"
          >
            <span class="sheet-btn-icon">🔗</span>
            <span>
              <strong>{{ shareCopied ? t('map.linkCopied') : t('map.share') }}</strong>
              <small>
                {{
                  shareCopied
                    ? t('map.shareCopiedHint')
                    : canNativeShare
                      ? t('map.shareHintNative')
                      : t('map.shareHintCopy')
                }}
              </small>
            </span>
          </button>

        </div>
      </div>
    </div>

    <PoiDetailSheet />
    <CheatSheetPanel
      :open="cheatSheetOpen"
      :route-name="courseName()"
      :total-km="store.totalKm"
      :stops="exportWaypoints()"
      @close="closeCheatSheet"
    />
    <ExportQrDialog
      :open="qrOpen"
      :url="qrUrl"
      :title="qrTitle"
      :hint="qrHint"
      :busy="qrBusy"
      :error="qrError"
      :allow-fit-toggle="qrAllowFitToggle"
      :format="qrKind"
      @close="closeQrDialog"
      @download="runQrLocalDownload"
      @switch-format="switchQrFormat"
    />
  </div>

  <div v-else-if="store.error" class="error-page">
    <p>{{ store.error }}</p>
    <button type="button" @click="goHome">{{ t('map.errorPage') }}</button>
  </div>

  <div v-else class="error-page">
    <p>{{ t('map.noMap') }}</p>
    <button type="button" @click="goHome">{{ t('map.errorPage') }}</button>
  </div>
</template>

<style scoped>
.map-layout {
  display: grid;
  grid-template-columns: 348px minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  transition: grid-template-columns 0.2s ease;
}

.map-layout.sidebar-closed {
  grid-template-columns: 0 minmax(0, 1fr);
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 3px solid #111;
  background: #f3efe6;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  height: 100%;
  transition: opacity 0.15s ease;
}

.sidebar.collapsed {
  opacity: 0;
  pointer-events: none;
  border-right: none;
}

.map-header {
  padding: 1rem;
  border-bottom: 3px solid #111;
  background: #fff;
  flex-shrink: 0;
}

.sidebar-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
}

.sidebar-body :deep([data-sidebar-section]) {
  scroll-margin-top: 0.35rem;
}

.map-header h1 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 800;
  line-height: 1.3;
  color: #111;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.sidebar-head-text {
  min-width: 0;
  flex: 1;
}

.meta {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #111;
  opacity: 0.68;
  font-weight: 650;
}

.map-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 0.5rem;
  min-height: 52px;
  padding: 0.55rem 0.85rem;
  background: #fff;
  border-bottom: 3px solid #111;
  flex-shrink: 0;
  /* Above map overlays so export dropdown isn't covered by basemap toggles */
  z-index: 80;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 1;
  min-width: 0;
}

.toolbar-right {
  flex-shrink: 0;
}

.tool-btn {
  padding: 0.45rem 0.7rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 750;
  line-height: 1.15;
  white-space: nowrap;
}

.tool-btn:hover {
  background: #f3efe6;
}

.home-btn {
  background: var(--cta);
  border-color: #111;
  color: #111;
  font-weight: 800;
  box-shadow: 3px 3px 0 #111;
}

.home-btn:hover {
  background: var(--cta);
  border-color: #111;
  color: #111;
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 #111;
}

.share-btn {
  color: #111;
}

.sidebar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 500;
}

.toggle-chevron {
  font-size: 1.1rem;
  line-height: 1;
  font-weight: 700;
}

.export-toggle {
  background: var(--cta);
  border-color: #111;
  color: #111;
  font-weight: 800;
  box-shadow: 3px 3px 0 #111;
}

.export-toggle:hover {
  background: var(--cta);
  border-color: #111;
}

.export-toggle.active {
  background: #111;
  color: #fff;
  border-color: #111;
}

.offline-banner {
  position: absolute;
  top: 3.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 22;
  max-width: min(520px, calc(100% - 2rem));
  padding: 0.7rem 0.95rem;
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  box-shadow: 4px 4px 0 #111;
}

.offline-banner.pack-ready-banner,
.offline-banner.pack-active-banner {
  background: #fff;
  border-color: #111;
}

.offline-banner-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}

.offline-banner-text strong {
  font-size: 0.92rem;
}

.offline-banner.pack-ready-banner .offline-banner-text strong,
.offline-banner.pack-active-banner .offline-banner-text strong {
  color: var(--primary, #2d6a4f);
}

.offline-banner-text span {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}

.persist-banner {
  position: absolute;
  top: 3.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 23;
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  max-width: min(520px, calc(100% - 2rem));
  padding: 0.65rem 0.85rem;
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  box-shadow: 4px 4px 0 #111;
}

.persist-banner-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.85rem;
  flex: 1;
  min-width: 0;
}

.persist-banner-text strong {
  font-size: 0.9rem;
  color: #991b1b;
}

.persist-banner-text span {
  color: #7f1d1d;
  font-size: 0.8rem;
  line-height: 1.35;
}

.export-tip {
  position: absolute;
  top: 3.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(560px, calc(100% - 2rem));
  padding: 0.75rem 0.9rem;
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  box-shadow: 4px 4px 0 #111;
}

.export-tip-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
}

.export-tip-text span {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.tip-mobile {
  display: none;
}

.export-tip-btn {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border: 2px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
}

.export-tip-btn:hover {
  background: var(--cta);
}

.sidebar-reopen {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.6rem 0.5rem 0.6rem 0.35rem;
  border: 3px solid #111;
  border-left: none;
  border-radius: 0;
  background: #fff;
  box-shadow: 4px 4px 0 #111;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 800;
  color: #111;
}

.reopen-chevron {
  font-size: 1rem;
  line-height: 1;
}

.toast-close {
  flex-shrink: 0;
  border: none;
  background: none;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 0.15rem;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

.map-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.pois-loading-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 0;
  background: #fff;
  border: 2px solid #111;
  box-shadow: 3px 3px 0 #111;
  font-size: 0.85rem;
  font-weight: 700;
  color: #111;
  pointer-events: none;
  white-space: nowrap;
}

/* Nested flex group inside MapCanvas .map-left-stack */
.map-cp-tools {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
}

.map-cp-fab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 2px solid #111;
  border-radius: 0;
  padding: 0.55rem 0.7rem;
  background: #fff;
  color: #111;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 800;
  box-shadow: 3px 3px 0 #111;
  cursor: pointer;
}

.map-cp-fab.active {
  background: var(--cta);
  color: #111;
  box-shadow: 3px 3px 0 #111;
}

.map-cp-fab-label {
  letter-spacing: 0.02em;
}

.map-cp-menu {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 12rem;
  padding: 0.45rem;
  border-radius: 0;
  border: 3px solid #111;
  background: #fff;
  box-shadow: 4px 4px 0 #111;
}

.map-cp-kind {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 2px solid transparent;
  border-radius: 0;
  padding: 0.75rem 0.9rem;
  min-height: 48px;
  background: transparent;
  color: #111;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.map-cp-kind:hover,
.map-cp-kind.active {
  background: var(--cta);
  border-color: #111;
  color: #111;
}

.map-cp-banner {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 36;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  max-width: min(92vw, 420px);
  padding: 0.55rem 0.75rem;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25);
}

.map-cp-banner button {
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  cursor: pointer;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .map-cp-fab {
    width: 60px;
    height: 60px;
    padding: 0;
    justify-content: center;
    border-radius: 0;
    font-size: 1.4rem;
    box-shadow: 4px 4px 0 #111;
  }

  .map-cp-fab-label {
    display: none;
  }

  .map-cp-banner {
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    max-width: min(92vw, 420px);
    border-radius: 12px;
  }
}

.mobile-only {
  display: none;
}

.tool-btn.ride-enter {
  background: var(--cta);
  color: #111;
  border-color: #111;
  font-weight: 800;
  box-shadow: 3px 3px 0 #111;
}

.tool-btn.ride-enter.is-on {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: 3px 3px 0 #111;
}

.ride-overlay {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 50;
  padding: 0;
  pointer-events: none;
  max-width: min(22rem, calc(100% - 5rem));
}

.ride-exit {
  pointer-events: auto;
  min-height: 40px;
  padding: 0.45rem 0.85rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #111;
  color: #fff;
  font-weight: 800;
  font-size: 0.88rem;
  box-shadow: 3px 3px 0 #111;
  cursor: pointer;
}

.ride-nearby,
.ride-cockpit {
  display: none;
}

.fav-hud {
  position: absolute;
  left: 0.55rem;
  right: 0.55rem;
  bottom: 0.55rem;
  z-index: 18;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  pointer-events: none;
}

.fav-hud-btn {
  pointer-events: auto;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
  max-width: 100%;
  padding: 0.55rem 0.8rem;
  border: none;
  border-radius: 12px;
  background: rgba(255, 251, 235, 0.97);
  color: #111;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  text-align: left;
}

.fav-hud-kind {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #92400e;
}

.fav-hud-btn strong {
  flex-shrink: 0;
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
  color: #92400e;
}

.fav-hud-name {
  min-width: 0;
  flex: 1 1 8rem;
  font-size: 0.98rem;
  font-weight: 650;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.map-stack :deep(.map-canvas-wrap) {
  flex: 1;
  min-height: 180px;
}

.mobile-nav,
.mobile-sheet {
  display: none;
}

.error-page {
  max-width: 480px;
  margin: 4rem auto;
  text-align: center;
  padding: 1rem;
}

@media (max-width: 1200px) {
  .toggle-label {
    display: none;
  }

  .export-toggle {
    font-size: 0.78rem;
    padding: 0.45rem 0.6rem;
  }

  .share-btn {
    font-size: 0.78rem;
    padding: 0.45rem 0.55rem;
  }
}

@media (max-width: 1100px) {
  .home-btn {
    font-size: 0.78rem;
    padding: 0.45rem 0.55rem;
  }

  .tool-btn.ride-enter {
    font-size: 0.78rem;
    padding: 0.45rem 0.55rem;
  }
}

@media (max-width: 768px) {
  .map-layout,
  .map-layout.sidebar-closed {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .map-toolbar {
    display: none;
  }

  /* Export + Teilen nur über Bottom-Nav / Sheet */
  .desktop-actions {
    display: none;
  }

  .tip-desktop {
    display: none !important;
  }

  .tip-mobile {
    display: inline !important;
  }

  .export-tip-btn.tip-mobile {
    display: inline-flex !important;
  }

  .export-tip {
    top: auto;
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    max-width: none;
  }

  .offline-banner {
    top: auto;
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    max-width: none;
  }

  .map-stack {
    padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  }

  .map-layout :deep(.map-left-stack .map-cp-tools) {
    display: none;
  }

  .mobile-only {
    display: inline-flex;
  }

  .tool-btn.ride-enter {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
    font-weight: 700;
  }

  .map-toolbar.is-ride {
    display: none;
  }

  .map-layout.ride-mode .map-stack {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .map-layout.ride-mode .export-tip,
  .map-layout.ride-mode .offline-banner {
    bottom: calc(108px + env(safe-area-inset-bottom, 0px));
  }

  .map-layout.ride-mode .fav-hud {
    display: none;
  }

  .fav-hud {
    left: 0.45rem;
    right: 0.45rem;
    bottom: calc(0.45rem + 96px + env(safe-area-inset-bottom, 0px));
  }

  .map-layout.ride-mode .ride-overlay {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    padding: 0.3rem 0.45rem calc(0.35rem + env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.22), transparent);
  }

  .ride-exit {
    pointer-events: auto;
    align-self: flex-start;
    min-height: 48px;
    padding: 0.5rem 0.85rem;
    border: 2px solid #111;
    border-radius: 0;
    background: #fff;
    color: #111;
    font-weight: 800;
    font-size: 0.88rem;
    box-shadow: 3px 3px 0 #111;
    cursor: pointer;
  }

  .ride-top-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    pointer-events: none;
  }

  .ride-nearby {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding: 0.5rem 0.85rem;
    border: 2px solid #111;
    border-radius: 0;
    background: var(--cta);
    color: #111;
    font-weight: 800;
    font-size: 0.88rem;
    box-shadow: 3px 3px 0 #111;
    cursor: pointer;
  }

  .ride-cockpit {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    pointer-events: none;
  }

  .ride-primary {
    pointer-events: auto;
    width: 100%;
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    column-gap: 0.45rem;
    padding: 0.5rem 0.7rem;
    border: none;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.96);
    color: #111;
    text-align: left;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
    cursor: pointer;
  }

  .ride-primary-kind {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #4b5563;
    white-space: nowrap;
  }

  .ride-primary-dist {
    font-size: 1.2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    color: var(--primary, #2d6a4f);
  }

  .ride-primary-name {
    font-size: 0.95rem;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ride-primary-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.55rem;
  }

  .ride-eta {
    font-size: 0.88rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #1f2937;
  }

  .ride-open {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.12rem 0.4rem;
    border-radius: 6px;
    background: #e5e7eb;
    color: #374151;
  }

  .ride-open--open {
    background: color-mix(in srgb, var(--primary, #2d6a4f) 18%, #fff);
    color: var(--primary, #166534);
  }

  .ride-open--closed {
    background: #fee2e2;
    color: #991b1b;
  }

  .ride-open--unknown {
    background: #f3f4f6;
    color: #6b7280;
  }

  .ride-open-sm {
    font-size: 0.62rem;
    padding: 0.06rem 0.28rem;
  }

  .ride-primary-empty {
    pointer-events: none;
    margin: 0;
    padding: 0.5rem 0.7rem;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.88);
    color: #4b5563;
    font-size: 0.88rem;
    font-weight: 600;
  }

  .ride-secondary {
    pointer-events: auto;
    width: 100%;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.3rem 0.5rem;
    padding: 0.55rem 0.75rem;
    border: none;
    border-radius: 12px;
    background: rgba(255, 251, 235, 0.97);
    color: #111;
    text-align: left;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
    cursor: pointer;
  }

  .ride-secondary-kind {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #92400e;
  }

  .ride-secondary strong {
    flex-shrink: 0;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
    color: #92400e;
  }

  .ride-secondary-name {
    min-width: 0;
    flex: 1 1 7rem;
    font-size: 0.95rem;
    font-weight: 650;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .ride-secondary-empty {
    pointer-events: none;
    margin: 0;
    padding: 0.4rem 0.65rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.82);
    color: #6b7280;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .mobile-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: #fff;
    border-top: 3px solid #111;
    padding: 0.45rem 0.15rem calc(0.45rem + env(safe-area-inset-bottom, 0px));
    box-shadow: none;
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.22rem;
    padding: 0.2rem 0.05rem 0.15rem;
    border: none;
    background: none;
    cursor: pointer;
    min-height: 76px;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-cp-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 76px;
  }

  .nav-cp-wrap .nav-item {
    flex: none;
    width: 100%;
  }

  .nav-glyph {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
    width: 56px;
    height: 56px;
    border-radius: 0;
    background: #fff;
    border: 2.5px solid #111;
    color: inherit;
    box-shadow: 3px 3px 0 #111;
  }

  .nav-glyph svg {
    width: 1.95rem;
    height: 1.95rem;
    stroke-width: 2.6;
    overflow: visible;
    shape-rendering: geometricPrecision;
  }

  .nav-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #111;
    line-height: 1.1;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-home,
  .nav-radius,
  .nav-cp,
  .nav-pois,
  .nav-ride,
  .nav-export {
    color: #111;
  }

  .nav-item.active .nav-glyph,
  .nav-cp.active .nav-glyph {
    background: var(--cta);
  }

  .nav-badge {
    position: absolute;
    top: -0.35rem;
    right: -0.45rem;
    min-width: 1.45rem;
    padding: 0.12rem 0.32rem;
    border-radius: 999px;
    background: #be123c;
    color: #fff;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1.15;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }

  .nav-cp-menu {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 120;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 14.5rem;
    padding: 0.5rem;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  }

  .nav-cp-kind {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    border: none;
    border-radius: 10px;
    padding: 0.9rem 1rem;
    min-height: 56px;
    background: transparent;
    color: #111;
    font: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }

  .nav-cp-kind.active,
  .nav-cp-kind:hover {
    background: #f5f3ff;
    color: #6d28d9;
  }

  .nav-export.active {
    background: none;
  }

  .mobile-sheet {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    align-items: flex-end;
    justify-content: center;
    padding:
      env(safe-area-inset-top, 0px)
      max(0.75rem, env(safe-area-inset-right, 0px))
      calc(96px + 0.5rem + env(safe-area-inset-bottom, 0px))
      max(0.75rem, env(safe-area-inset-left, 0px));
    touch-action: none;
  }

  .mobile-sheet-inner {
    background: #f3efe6;
    width: 100%;
    max-width: 520px;
    max-height: min(88dvh, 760px);
    border-radius: 0;
    border: 3px solid #111;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 6px 6px 0 #111;
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  /* Nearby + POI sheets: content-sized so unused space does not swallow the map */
  .mobile-sheet.nearby-open .mobile-sheet-inner,
  .mobile-sheet.pois-open .mobile-sheet-inner {
    height: auto;
    max-height: min(90dvh, 820px);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.15rem 1.2rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sheet-header h2 {
    margin: 0;
    font-size: 1.28rem;
  }

  .sheet-close {
    border: none;
    background: none;
    font-size: 2rem;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    min-width: 52px;
    min-height: 52px;
  }

  .mobile-sheet-inner :deep(.poi-list),
  .mobile-sheet-inner :deep(.poi-list.open) {
    flex: 0 0 auto;
    min-height: auto;
  }

  .sheet-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    touch-action: pan-y;
    scrollbar-gutter: stable;
  }

  .sheet-scroll :deep(.section-toggle) {
    min-height: 60px;
    padding: 1rem 1.15rem;
    gap: 0.65rem;
  }

  .sheet-scroll :deep(.toggle-title) {
    font-size: 0.88rem;
  }

  .sheet-scroll :deep(.toggle-summary) {
    font-size: 1rem;
  }

  .sheet-scroll :deep(.chevron) {
    font-size: 1.45rem;
    font-weight: 800;
    line-height: 1;
    color: #111;
    width: 1.75rem;
    text-align: center;
  }

  .nearby-sheet {
    padding: 1rem 1.15rem 1.35rem;
    gap: 0;
    flex: 0 0 auto;
  }

  .sheet-scroll :deep(.poi-list.open) {
    flex: 0 0 auto;
    min-height: 0;
    max-height: min(42vh, 360px);
  }

  .sheet-scroll :deep(.poi-list.open .poi-body) {
    overflow-y: auto;
    max-height: min(34vh, 300px);
    min-height: 0;
    flex: none;
    -webkit-overflow-scrolling: touch;
  }

  .sheet-scroll :deep(.poi-list.open .poi-body ul) {
    overflow: visible;
    max-height: none;
    min-height: 0;
    flex: none;
  }

  .sheet-scroll :deep(.category-filter .hint) {
    font-size: 0.92rem;
    line-height: 1.4;
  }

  .sheet-scroll :deep(.category-filter .cat-btn) {
    min-height: 52px;
    padding: 0.75rem 0.8rem;
    font-size: 1.02rem;
    gap: 0.55rem;
  }

  .sheet-scroll :deep(.category-filter .icon) {
    font-size: 1.25rem;
  }

  .sheet-scroll :deep(.category-filter .count) {
    font-size: 0.88rem;
  }

  .sheet-scroll :deep(.category-filter .map-poi-toggle) {
    min-height: 48px;
    font-size: 0.95rem;
  }

  .sheet-scroll :deep(.category-filter .map-poi-status) {
    font-size: 0.92rem;
  }

  .sheet-scroll :deep(.hint),
  .sheet-scroll :deep(.empty),
  .sheet-scroll :deep(.pack-help),
  .sheet-scroll :deep(.pack-where),
  .sheet-scroll :deep(.pack-estimate),
  .sheet-scroll :deep(.pack-details),
  .sheet-scroll :deep(.pack-hint),
  .sheet-scroll :deep(.eta-hint),
  .sheet-scroll :deep(.place-hint),
  .sheet-scroll :deep(.intro),
  .sheet-scroll :deep(.ios-geo-hint) {
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .sheet-scroll :deep(.kind-btn) {
    min-height: 52px;
    padding: 0.7rem 1.05rem;
    font-size: 1.05rem;
  }

  .sheet-scroll :deep(.pack-btn) {
    min-height: 52px;
    padding: 0.75rem 1.05rem;
    font-size: 1.02rem;
  }

  .sheet-scroll :deep(.tabs button) {
    min-height: 48px;
    font-size: 1rem;
    padding: 0.55rem 0.65rem;
  }

  .sheet-scroll :deep(.name) {
    font-size: 1.02rem;
  }

  .sheet-scroll :deep(.meta),
  .sheet-scroll :deep(.km),
  .sheet-scroll :deep(.note) {
    font-size: 0.88rem;
  }

  .sheet-scroll :deep(.weather-chip strong) {
    font-size: 0.88rem;
  }

  .sheet-scroll :deep(.weather-temp) {
    font-size: 1.2rem;
  }

  .sheet-scroll :deep(.weather-detail),
  .sheet-scroll :deep(.weather-time),
  .sheet-scroll :deep(.weather-empty) {
    font-size: 0.85rem;
  }

  .sheet-scroll :deep(.field-label) {
    font-size: 0.88rem;
  }

  .sheet-scroll :deep(.time-select),
  .sheet-scroll :deep(.speed-num),
  .sheet-scroll :deep(.time-step) {
    font-size: 1.25rem;
    min-height: 56px;
  }

  .sheet-scroll :deep(.time-step) {
    width: 3rem;
  }

  .sheet-scroll :deep(.cat-chip) {
    min-height: 48px;
    padding: 0.7rem 1rem;
    font-size: 1rem;
  }

  .sheet-scroll :deep(.filter-toggle) {
    font-size: 0.95rem;
  }
}

/* ── Export Dropdown (Desktop) ── */
.export-wrap {
  position: relative;
}

.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  box-shadow: 6px 6px 0 #111;
  z-index: 200;
  min-width: 300px;
  overflow: hidden;
  padding-bottom: 0.35rem;
}

.export-menu-head {
  padding: 0.85rem 1rem 0.65rem;
  border-bottom: 1px solid var(--border);
}

.export-menu-head strong {
  display: block;
  font-size: 0.95rem;
}

.export-menu-head p {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.export-name-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0.65rem 1rem 0.35rem;
}

.export-name-field.sheet {
  margin: 0 0 0.35rem;
}

.export-name-field span {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.export-name-field input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.65rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #f3efe6;
  color: #111;
  font-size: 0.9rem;
}

.export-name-field input:focus {
  outline: 3px solid #111;
  outline-offset: 1px;
}

.export-name-field small {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.export-nearby-hint {
  margin: 0.35rem 0.85rem 0.45rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.78rem;
  line-height: 1.35;
}

.export-pc-panel {
  margin: 0 0.55rem 0.45rem 1.1rem;
  padding: 0.15rem 0 0.15rem 0.35rem;
  border-left: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.export-pc-panel.sheet {
  margin: 0.15rem 0 0.45rem 0.65rem;
}

.export-item.nested,
.export-sheet-btn.nested {
  opacity: 0.98;
}

.export-sheet-btn.nested {
  margin-top: 0;
}

.export-sheet-body .export-nearby-hint {
  margin-left: 0;
  margin-right: 0;
}

.export-section,
.export-sheet-section {
  margin: 0.5rem 1rem 0.25rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.export-sheet-section {
  margin: 0.85rem 0 0.15rem;
}

.export-howto-details {
  margin: 0 0.75rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface, #fff);
}

.export-sheet-body .export-howto-details {
  margin: 0.1rem 0 0.35rem;
}

.export-howto-details summary {
  cursor: pointer;
  list-style: none;
  padding: 0.45rem 0.7rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  user-select: none;
}

.export-howto-details summary::-webkit-details-marker {
  display: none;
}

.export-howto-details summary::before {
  content: '▸ ';
  color: var(--text-muted);
}

.export-howto-details[open] summary::before {
  content: '▾ ';
}

.export-howto-details summary:hover {
  color: var(--text);
}

.export-howto {
  margin: 0 0.7rem 0.55rem;
  padding: 0 0 0 1.15rem;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.export-sheet-body .export-howto {
  margin: 0 0.55rem 0.45rem;
}

.export-howto li + li {
  margin-top: 0.2rem;
}

.export-howto-warn {
  margin: 0 0.7rem 0.65rem;
  padding: 0.55rem 0.7rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.export-sheet-body .export-howto-warn {
  margin: 0 0.55rem 0.55rem;
}

.export-howto-help {
  display: inline-block;
  margin: 0 0.7rem 0.65rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--primary-dark, #1d4ed8);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.export-sheet-body .export-howto-help {
  margin: 0 0.55rem 0.55rem;
}

.export-item {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  width: 100%;
  padding: 0.7rem 1rem;
  border: none;
  background: none;
  text-align: left;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s;
}

.export-item:hover {
  background: #f3efe6;
}

.export-item.featured {
  background: var(--cta);
  color: #111;
}

.export-item.featured:hover {
  background: var(--cta);
  color: #111;
}

.export-icon {
  flex-shrink: 0;
  font-size: 1.1rem;
  line-height: 1.4;
  color: inherit;
}

.export-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.export-text strong {
  font-size: 0.88rem;
  color: inherit;
  font-weight: 800;
}

.export-text small {
  font-size: 0.78rem;
  color: #334155;
  line-height: 1.35;
  font-weight: 650;
}

.export-item.featured .export-text small {
  color: #111;
  opacity: 0.9;
  font-weight: 700;
}

.export-divider {
  height: 1px;
  background: var(--border);
  margin: 0.35rem 0;
}

/* ── Export Sheet (Mobile) ── */
.export-sheet-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem 1rem 1.25rem;
  overflow-y: auto;
}

.export-sheet-intro {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.export-sheet-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  font-size: 0.9rem;
  color: #111;
  cursor: pointer;
  text-align: left;
}

.export-sheet-btn.featured {
  background: var(--cta);
  border-color: #111;
  color: #111;
}

.export-sheet-btn strong {
  display: block;
  color: inherit;
  font-weight: 800;
}

.export-sheet-btn small {
  display: block;
  font-size: 0.78rem;
  color: #334155;
  margin-top: 0.1rem;
  font-weight: 650;
}

.export-sheet-btn.featured small {
  color: #111;
  opacity: 0.9;
  font-weight: 700;
}

.sheet-btn-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.export-sheet-btn:hover {
  background: #f3efe6;
}

.export-sheet-btn.featured:hover {
  background: var(--cta);
  color: #111;
}

.export-print-hint {
  margin: 0.35rem 0 0;
  padding: 0.65rem 0.75rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-muted);
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.export-sheet-print {
  opacity: 0.92;
}

/* Minimal brutalism: sidebar + elevation stay readable */
.sidebar :deep([data-sidebar-section]) {
  border-bottom: 2px solid #111;
}

.sidebar :deep(.toggle-title) {
  color: #111;
  font-weight: 800;
}

.sidebar :deep(.section-toggle:hover) {
  background: #fff;
}

.sidebar :deep(.tabs) {
  gap: 0;
  border: 2px solid #111;
}

.sidebar :deep(.tabs button) {
  border: none;
  border-right: 2px solid #111;
  border-radius: 0;
  background: #fff;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 0.72rem;
}

.sidebar :deep(.tabs button:last-child) {
  border-right: none;
}

.sidebar :deep(.tabs button.active) {
  background: #111;
  color: #fff;
  border-color: #111;
}

.sidebar :deep(.poi-search input) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
}

.sidebar :deep(.poi-search input:focus) {
  outline: 3px solid #111;
}

.sidebar :deep(.cat-btn) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
}

.sidebar :deep(.cat-btn.off) {
  opacity: 0.42;
  background: #e8e4dc;
}

.sidebar :deep(.map-poi-bar) {
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
}

.sidebar :deep(.poi-list li.selected) {
  background: var(--cta);
}

.sidebar :deep(.km) {
  color: #111;
}

.sidebar :deep(.hours-badge) {
  display: inline-block;
  padding: 0.05rem 0.28rem;
  border: 1.5px solid #111;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-style: normal;
}

.sidebar :deep(.hours-badge.open) {
  background: var(--cta);
  color: #111;
}

.sidebar :deep(.hours-badge.closed) {
  background: #111;
  color: #fff;
}

.sidebar :deep(.hours-badge.unknown) {
  background: #fff;
  color: #111;
  opacity: 1;
}

.sidebar :deep(.kind-btn),
.sidebar :deep(.pack-btn),
.sidebar :deep(.time-select),
.sidebar :deep(.time-step),
.sidebar :deep(.buffer-select),
.sidebar :deep(.cp-name) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
}

.sidebar :deep(.time-group) {
  box-shadow: 3px 3px 0 #111;
}

.sidebar :deep(.time-step) {
  background: #f3efe6;
  box-shadow: none;
  border: none;
}

.sidebar :deep(.time-select) {
  border-left: 2px solid #111;
  border-right: 2px solid #111;
  border-top: none;
  border-bottom: none;
  box-shadow: none;
}

.sidebar :deep(.kind-btn.active) {
  background: var(--cta);
  border-color: #111;
  color: #111;
  font-weight: 800;
}

.sidebar :deep(.pack-btn.primary),
.sidebar :deep(.btn-primary) {
  border: 3px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  box-shadow: 4px 4px 0 #111;
  font-weight: 800;
  text-transform: uppercase;
}

.sidebar :deep(.pack-btn.danger) {
  background: #fff;
  color: #111;
  border-color: #111;
}

.sidebar :deep(.weather-chip) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
}

.sidebar :deep(.weather-chip.rain-low),
.sidebar :deep(.weather-chip.rain-mid),
.sidebar :deep(.weather-chip.rain-high) {
  border-color: #111;
}

.sidebar :deep(.weather-row) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.3rem;
  overflow: visible;
}

.sidebar :deep(.swatch) {
  border-radius: 0;
  border: 1px solid #111;
}

.sidebar :deep(.cat-chip) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  font-weight: 700;
}

.sidebar :deep(.cat-chip.active) {
  background: var(--cta);
  color: #111;
  border-color: #111;
}

.sidebar :deep(.radius-value) {
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  color: #111;
  box-shadow: none;
}

.sidebar :deep(.radius-slider)::-webkit-slider-runnable-track,
.sidebar :deep(.radius-row input[type='range'])::-webkit-slider-runnable-track {
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
}

.sidebar :deep(.radius-slider)::-moz-range-track,
.sidebar :deep(.radius-row input[type='range'])::-moz-range-track {
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
}

.sidebar :deep(.radius-slider)::-webkit-slider-thumb,
.sidebar :deep(.radius-row input[type='range'])::-webkit-slider-thumb {
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
}

.sidebar :deep(.radius-slider)::-moz-range-thumb,
.sidebar :deep(.radius-row input[type='range'])::-moz-range-thumb {
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
}

.map-layout :deep(.elevation-profile) {
  border-top: 3px solid #111;
  box-shadow: none;
  background: #fff;
}

.map-layout :deep(.elevation-profile .profile-toggle) {
  background: #f3efe6;
}

.map-layout :deep(.elevation-profile .chevron-wrap) {
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  box-shadow: none;
}

.mobile-sheet-inner :deep(.tabs button),
.mobile-sheet-inner :deep(.cat-btn),
.mobile-sheet-inner :deep(.poi-search input) {
  border-radius: 0;
  border-color: #111;
}

.mobile-sheet-inner .sheet-header {
  border-bottom: 3px solid #111;
  background: #fff;
}

.mobile-sheet-inner .sheet-header h2 {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.mobile-sheet-inner :deep(.btn-primary) {
  border: 3px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  box-shadow: 4px 4px 0 #111;
  font-weight: 800;
  text-transform: uppercase;
}

.mobile-sheet-inner :deep(.cat-chip) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
}

.mobile-sheet-inner :deep(.cat-chip.active) {
  background: var(--cta);
  color: #111;
}

.mobile-sheet-inner :deep(.radius-value),
.mobile-sheet-inner :deep(.kind-btn),
.mobile-sheet-inner :deep(.pack-btn),
.mobile-sheet-inner :deep(.time-select),
.mobile-sheet-inner :deep(.time-step),
.mobile-sheet-inner :deep(.time-group) {
  border-radius: 0;
  border-color: #111;
}

.mobile-sheet-inner :deep(.radius-slider)::-webkit-slider-thumb,
.mobile-sheet-inner :deep(.radius-row input[type='range'])::-webkit-slider-thumb {
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
}
</style>
