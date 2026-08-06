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
import PoiLegend from '../components/PoiLegend.vue'
import EtaPlanner from '../components/EtaPlanner.vue'
import WeatherStrip from '../components/WeatherStrip.vue'
import ControlPointsPanel from '../components/ControlPointsPanel.vue'
import NearbySearchPanel from '../components/NearbySearchPanel.vue'
import NearbyForm from '../components/NearbyForm.vue'
import CheatSheetPanel from '../components/CheatSheetPanel.vue'
import ExportQrDialog from '../components/ExportQrDialog.vue'
import { useOnline } from '../composables/useOnline'
import { useI18n } from 'vue-i18n'
import TopbarSettings from '../components/TopbarSettings.vue'
import { localeHomePath, type AppLocale } from '../i18n'
import { useRideMode } from '../composables/useRideMode'
import { useRidePosition } from '../composables/useRidePosition'
import { useWakeLock } from '../composables/useWakeLock'
import { useWahoo } from '../composables/useWahoo'
import { formatKm } from '../services/geo'
import { formatDuration, formatClock, hoursForDistanceKm } from '../utils/eta'
import { openStatusAtEta, hasOsmOpeningHours, type OpenStatus } from '../utils/openingHours'
import { poiCategoryEmoji } from '../utils/poiLabels'
import type { ControlPointKind, Poi, PoiCategory } from '../../shared/types'
import {
  DEFAULT_POI_CATEGORIES,
  NEARBY_DEFAULT_POI_RADIUS_M,
} from '../config/poiCategories'

const store = useMapStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const {
  exportGpxFavorites,
  exportFitCourse,
  exportForCoros,
  openQrExport,
  switchQrFormat,
  closeQrDialog,
  runQrLocalDownload,
  printFavorites,
  closeCheatSheet,
  cheatSheetOpen,
  exportWaypoints,
  courseName,
  qrOpen,
  qrBusy,
  qrUrl,
  qrTitle,
  qrHint,
  qrError,
  qrKind,
  qrAllowFitToggle,
} = useMapExport()
const { isOnline } = useOnline()
const { rideMode, setRideMode } = useRideMode()
const { rideKmAlong } = useRidePosition()
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
const mobilePanel = ref<'none' | 'pois' | 'legend' | 'export' | 'nearby'>('none')
const shareCopied = ref(false)
const showExportMenu = ref(false)
const showExportTip = ref(false)
const cpMenuOpen = ref(false)
const nearbyPanelRef = ref<{ setOpen: (value: boolean) => void } | null>(null)
const nearbyRescanning = ref(false)

const nearbyFabLabel = computed(() =>
  store.isNearbyMap
    ? nearbyRescanning.value || store.poisLoading
      ? t('nearby.searching')
      : t('nearby.mapFabRescan')
    : t('nearby.mapFab')
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

/** Umgebung map: FAB reloads GPS + POIs. Route maps: open options panel. */
function onNearbyFabClick() {
  if (store.isNearbyMap) {
    void quickNearbyRescan()
    return
  }
  openNearbyPanel()
}

function nearbyRescanRadius(): number {
  return store.poiRadiusM > 0 ? store.poiRadiusM : NEARBY_DEFAULT_POI_RADIUS_M
}

function nearbyRescanCategories(): PoiCategory[] {
  return store.activeCategories.length
    ? [...store.activeCategories]
    : [...DEFAULT_POI_CATEGORIES]
}

async function quickNearbyRescan() {
  if (nearbyRescanning.value || store.poisLoading) return
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    store.error = t('nearby.geoInsecure')
    return
  }
  if (!navigator.geolocation) {
    store.error = t('nearby.geoUnsupported')
    return
  }

  store.selectedPoi = null
  showExportMenu.value = false
  cpMenuOpen.value = false
  store.cancelPlaceControlPoint()
  nearbyRescanning.value = true
  store.error = ''

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const radius = nearbyRescanRadius()
        const cats = nearbyRescanCategories()
        store.prepareNearbyCenter(pos.coords.latitude, pos.coords.longitude, radius, cats)
        await store.refreshNearbyPois(radius, cats)
        await maybeStartNearbyLocationFollow()
      } catch (err) {
        store.error = err instanceof Error ? err.message : t('nearby.loadFailed')
      } finally {
        nearbyRescanning.value = false
      }
    },
    (err) => {
      nearbyRescanning.value = false
      if (err.code === 1) store.error = t('nearby.geoDenied')
      else if (err.code === 2) store.error = t('nearby.geoUnavailable')
      else if (err.code === 3) store.error = t('nearby.geoTimeout')
      else store.error = t('nearby.geoFailed')
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    }
  )
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
  () => [store.mapReady, store.mapEpoch] as const,
  () => {
    void maybeStartNearbyLocationFollow()
  }
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
  void wakeLock.release()
  wakeLock.unbind()
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
  // Never start in ride cockpit — that hides toolbar/export/elevation
  if (rideMode.value) exitRideMode()
  if (store.mode === 'loading' && !store.mapReady) {
    void loadIfNeeded()
  } else if (!store.mapReady) {
    void loadIfNeeded()
  }
  maybeShowExportTip()
})

watch(
  () => store.mapReady,
  (ready) => {
    if (ready) maybeShowExportTip()
  }
)

function maybeShowExportTip() {
  if (!store.mapReady) return
  try {
    if (localStorage.getItem(EXPORT_TIP_KEY)) return
  } catch {
    /* ignore */
  }
  showExportTip.value = true
}

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

function onPrintFavorites() {
  printFavorites()
  closeMobilePanel()
  closeExportMenu()
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

function openMobilePanel(panel: 'pois' | 'legend' | 'export' | 'nearby') {
  mobilePanel.value = mobilePanel.value === panel ? 'none' : panel
  if (mobilePanel.value !== 'none') showExportMenu.value = false
}

function closeMobilePanel() {
  mobilePanel.value = 'none'
}

function closeExportMenu() {
  showExportMenu.value = false
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
    :class="{ 'sidebar-closed': !sidebarOpen, 'ride-mode': rideMode }"
  >
    <aside class="sidebar" :class="{ collapsed: !sidebarOpen }" :aria-hidden="!sidebarOpen">
      <header class="map-header">
        <div class="sidebar-head-row">
          <div class="sidebar-head-text">
            <button type="button" class="sidebar-brand" :aria-label="t('map.home')" @click="goHome">
              <img
                class="sidebar-logo"
                src="/logo-ultraplaner.png"
                alt="UltraPlaner"
                width="140"
                height="46"
              />
            </button>
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
            <TopbarSettings class="sidebar-settings" />
          </div>
        </div>
      </header>
      <EtaPlanner v-if="!store.isNearbyMap" />
      <WeatherStrip />
      <NearbySearchPanel ref="nearbyPanelRef" @done="onNearbyDone" />
      <ControlPointsPanel />
      <PoiCategoryFilter />
      <PoiList />
      <PoiLegend compact />
    </aside>

    <main class="map-main">
      <header v-show="!rideMode" class="map-toolbar">
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
            :title="t('map.rideOn')"
            @click="enterRideMode"
          >
            {{ t('map.rideOn') }}
          </button>
          <button
            type="button"
            class="tool-btn nearby-enter"
            :title="nearbyFabLabel"
            :disabled="store.isNearbyMap && (nearbyRescanning || store.poisLoading)"
            @click="onNearbyFabClick"
          >
            {{ nearbyFabLabel }}
          </button>
          <button
            v-if="store.isNearbyMap"
            type="button"
            class="tool-btn nearby-opts"
            :title="t('nearby.mapFabOptions')"
            @click="openNearbyPanel"
          >
            {{ t('nearby.mapFabOptions') }}
          </button>
        </div>

        <div class="toolbar-title">
          <span class="route-name">{{ store.routeName }}</span>
          <span class="route-meta">
            <template v-if="store.isNearbyMap">
              {{ t('map.nearbyMeta', { m: store.poiRadiusM }) }}
            </template>
            <template v-else>
              {{ store.totalKm.toFixed(1) }} km · {{ rideDuration }}
              <template v-if="finishEta.clockLabel"> · ETA {{ finishEta.clockLabel }}</template>
            </template>
          </span>
        </div>

        <div class="toolbar-right desktop-actions">
          <div class="export-wrap">
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

              <p v-if="store.isNearbyMap" class="export-section">{{ t('map.deviceFavorites') }}</p>
              <button
                type="button"
                class="export-item"
                :class="{ featured: (store.isNearbyMap || !wahooConfigured) && favCount > 0 }"
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
                type="button"
                class="export-item"
                role="menuitem"
                @click="runExport(() => openQrExport('gpx'))"
              >
                <span class="export-icon">▦</span>
                <span class="export-text">
                  <strong>{{ t('map.qrToPhone') }}</strong>
                  <small>{{ t('map.qrToPhoneHint') }}</small>
                </span>
              </button>

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

                <p class="export-section">{{ t('map.deviceGarmin') }}</p>
                <button
                  type="button"
                  class="export-item"
                  role="menuitem"
                  @click="runExport(exportFitCourse)"
                >
                  <span class="export-icon">↓</span>
                  <span class="export-text">
                    <strong>{{ t('map.fitCourse') }}</strong>
                    <small>{{ t('map.fitCourseHint', { count: favCount }) }}</small>
                  </span>
                </button>
                <details class="export-howto-details">
                  <summary>{{ t('map.howToggle') }}</summary>
                  <ol class="export-howto">
                    <li>{{ t('map.howGarmin1') }}</li>
                    <li>{{ t('map.howGarmin2') }}</li>
                    <li>{{ t('map.howGarmin3') }}</li>
                    <li>{{ t('map.howGarmin4') }}</li>
                  </ol>
                  <p class="export-howto-warn">{{ t('map.howGarminWarn') }}</p>
                </details>

                <p class="export-section">{{ t('map.deviceCoros') }}</p>
                <button
                  type="button"
                  class="export-item"
                  role="menuitem"
                  @click="runExport(() => exportForCoros(true))"
                >
                  <span class="export-icon">▦</span>
                  <span class="export-text">
                    <strong>{{ t('map.sendCoros') }}</strong>
                    <small>{{ t('map.gpxCorosHint', { count: favCount }) }}</small>
                  </span>
                </button>
                <details class="export-howto-details">
                  <summary>{{ t('map.howToggle') }}</summary>
                  <ol class="export-howto">
                    <li>{{ t('map.howCoros1') }}</li>
                    <li>{{ t('map.howCoros2') }}</li>
                    <li>{{ t('map.howCoros3') }}</li>
                    <li>{{ t('map.howCoros4') }}</li>
                  </ol>
                  <p class="export-howto-warn">{{ t('map.howCorosWarn') }}</p>
                  <a
                    class="export-howto-help"
                    href="https://support.coros.com/hc/en-us/articles/26895703330196-Downloading-and-Syncing-Routes-to-DURA"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ t('map.howCorosHelp') }}</a>
                </details>
              </template>

              <div class="export-divider" />
              <p class="export-section">{{ t('map.print') }}</p>
              <button type="button" class="export-item" role="menuitem" @click="runExport(printFavorites)">
                <span class="export-icon">🖨️</span>
                <span class="export-text">
                  <strong>{{ t('map.cheatSheet') }}</strong>
                  <small>
                    {{ favCount > 0 ? t('map.cheatSheetHint', { count: favCount }) : t('map.cheatSheetEmpty') }}
                  </small>
                </span>
              </button>
            </div>
          </div>
          <button
            v-if="store.savedMapId"
            type="button"
            class="tool-btn share-btn"
            :title="shareCopied ? t('map.linkCopied') : t('map.shareHintCopy')"
            @click="shareMap()"
          >
            {{ shareCopied ? `✓ ${t('map.linkCopied')}` : `🔗 ${t('map.share')}` }}
          </button>
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
          v-if="!isOnline || store.loadedFromCache"
          class="offline-banner"
          role="status"
        >
          <div class="offline-banner-text">
            <strong v-if="!isOnline">{{ t('map.offline') }}</strong>
            <strong v-else>{{ t('map.fromCache') }}</strong>
            <span v-if="!isOnline">{{ t('map.offlineBanner') }}</span>
            <span v-else>{{ t('map.cachedBanner') }}</span>
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
        <MapCanvas ref="mapCanvasRef" :key="store.mapEpoch" :ride-mode="rideMode" />
        <p v-if="store.poisLoading" class="pois-loading-banner" role="status">
          {{ t('nearby.loadingPois') }}
        </p>
        <ElevationProfile v-if="!rideMode && !store.isNearbyMap" />

        <div
          v-if="!rideMode"
          class="map-cp-tools"
          :aria-label="t('nearby.panelTitle')"
        >
          <button
            type="button"
            class="map-cp-fab map-nearby-fab"
            :class="{
              active: mobilePanel === 'nearby',
              loading: nearbyRescanning || store.poisLoading,
            }"
            :title="nearbyFabLabel"
            :aria-busy="nearbyRescanning || store.poisLoading"
            :disabled="nearbyRescanning || store.poisLoading"
            @click="onNearbyFabClick"
          >
            <span aria-hidden="true">◎</span>
            <span class="map-cp-fab-label">{{ nearbyFabLabel }}</span>
          </button>
          <button
            v-if="store.isNearbyMap"
            type="button"
            class="map-cp-fab map-nearby-opts"
            :class="{ active: mobilePanel === 'nearby' }"
            :title="t('nearby.mapFabOptions')"
            :aria-expanded="mobilePanel === 'nearby'"
            @click="openNearbyPanel"
          >
            <span aria-hidden="true">⚙</span>
            <span class="map-cp-fab-label">{{ t('nearby.mapFabOptions') }}</span>
          </button>
          <template v-if="!store.isNearbyMap">
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
          </template>
        </div>

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
              <div class="ride-primary-meta">
                <span class="ride-eta">
                  {{ t('map.rideEtaIn', { duration: nextSupply.durationLabel }) }}
                  <template v-if="nextSupply.clockLabel"> · {{ nextSupply.clockLabel }}</template>
                </span>
                <span
                  v-if="rideOpenLabel(nextSupply)"
                  class="ride-open"
                  :class="`ride-open--${nextSupply.openStatus}`"
                >
                  {{ rideOpenLabel(nextSupply) }}
                </span>
              </div>
              <span class="ride-primary-name">{{ nextSupply.poi.name }}</span>
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
              <span class="ride-secondary-eta">
                {{ t('map.rideEtaIn', { duration: nextFavorite.durationLabel }) }}
              </span>
              <span
                v-if="rideOpenLabel(nextFavorite)"
                class="ride-open ride-open-sm"
                :class="`ride-open--${nextFavorite.openStatus}`"
              >
                {{ rideOpenLabel(nextFavorite) }}
              </span>
              <span class="ride-secondary-name">{{ store.favoriteLabel(nextFavorite.poi) }}</span>
            </button>
            <p v-else-if="rideFavorites.length" class="ride-secondary-empty">
              {{ t('map.rideNoFavAhead') }}
            </p>
            <p v-else class="ride-secondary-empty">{{ t('map.rideNoFavs') }}</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile bottom nav -->
    <nav v-show="!rideMode" class="mobile-nav" :aria-label="t('map.mobileNav')">
      <button
        v-if="!store.isNearbyMap"
        type="button"
        class="nav-item nav-ride"
        @click="enterRideMode"
      >
        <span class="nav-icon">🚴</span>
        <span>{{ t('map.rideOn') }}</span>
      </button>
      <button type="button" class="nav-item" @click="goHome">
        <span class="nav-icon">🏠</span>
        <span>{{ t('map.navStart') }}</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ active: mobilePanel === 'pois' }"
        @click="openMobilePanel('pois')"
      >
        <span class="nav-icon">📍</span>
        <span>{{ t('map.navPois', { count: store.displayPois.length }) }}</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ active: mobilePanel === 'legend' }"
        @click="openMobilePanel('legend')"
      >
        <span class="nav-icon">🗺️</span>
        <span>{{ t('map.navLegend') }}</span>
      </button>
      <button
        type="button"
        class="nav-item nav-export"
        :class="{ active: mobilePanel === 'export' }"
        @click="openMobilePanel('export')"
      >
        <span class="nav-icon">↓</span>
        <span>{{ t('map.navExport') }}</span>
      </button>
    </nav>

    <div v-if="mobilePanel !== 'none'" class="mobile-sheet" @click.self="closeMobilePanel">
      <div class="mobile-sheet-inner">
        <header class="sheet-header">
          <h2>
            {{
              mobilePanel === 'pois'
                ? t('map.sheetPois')
                : mobilePanel === 'export'
                  ? store.isNearbyMap
                    ? t('map.exportTitleNearby')
                    : t('map.sheetExport')
                  : mobilePanel === 'nearby'
                    ? t('map.sheetNearby')
                    : t('map.sheetLegend')
            }}
          </h2>
          <button type="button" class="sheet-close" @click="closeMobilePanel">×</button>
        </header>
        <div v-if="mobilePanel === 'nearby'" class="sheet-scroll nearby-sheet">
          <NearbyForm in-map @done="onNearbyDone" />
        </div>
        <div v-else-if="mobilePanel === 'pois'" class="sheet-scroll">
          <EtaPlanner v-if="!store.isNearbyMap" embedded />
          <WeatherStrip embedded />
          <ControlPointsPanel />
          <PoiCategoryFilter embedded />
          <PoiList embedded />
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

          <p v-if="store.isNearbyMap" class="export-sheet-section">{{ t('map.deviceFavorites') }}</p>
          <button
            type="button"
            class="export-sheet-btn"
            :class="{ featured: (store.isNearbyMap || !wahooConfigured) && favCount > 0 }"
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

            <p class="export-sheet-section">{{ t('map.deviceGarmin') }}</p>
            <button
              type="button"
              class="export-sheet-btn"
              @click="void exportFitCourse().then(() => closeMobilePanel())"
            >
              <span class="sheet-btn-icon">↓</span>
              <span>
                <strong>{{ t('map.fitCourseShort', { count: favCount }) }}</strong>
                <small>{{ t('map.fitCourseHint', { count: favCount }) }}</small>
              </span>
            </button>
            <details class="export-howto-details">
              <summary>{{ t('map.howToggle') }}</summary>
              <ol class="export-howto">
                <li>{{ t('map.howGarmin1') }}</li>
                <li>{{ t('map.howGarmin2') }}</li>
                <li>{{ t('map.howGarmin3') }}</li>
                <li>{{ t('map.howGarmin4') }}</li>
              </ol>
              <p class="export-howto-warn">{{ t('map.howGarminWarn') }}</p>
            </details>

            <p class="export-sheet-section">{{ t('map.deviceCoros') }}</p>
            <button
              type="button"
              class="export-sheet-btn"
              @click="void exportForCoros(false).then(() => closeMobilePanel())"
            >
              <span class="sheet-btn-icon">↓</span>
              <span>
                <strong>{{ t('map.sendCoros') }}</strong>
                <small>{{ t('map.gpxCorosHint', { count: favCount }) }}</small>
              </span>
            </button>
            <details class="export-howto-details">
              <summary>{{ t('map.howToggle') }}</summary>
              <ol class="export-howto">
                <li>{{ t('map.howCoros1') }}</li>
                <li>{{ t('map.howCoros2') }}</li>
                <li>{{ t('map.howCoros3') }}</li>
                <li>{{ t('map.howCoros4') }}</li>
              </ol>
              <p class="export-howto-warn">{{ t('map.howCorosWarn') }}</p>
              <a
                class="export-howto-help"
                href="https://support.coros.com/hc/en-us/articles/26895703330196-Downloading-and-Syncing-Routes-to-DURA"
                target="_blank"
                rel="noopener noreferrer"
              >{{ t('map.howCorosHelp') }}</a>
            </details>
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

          <p class="export-print-hint">
            {{ t('map.printHint') }}
          </p>
          <button type="button" class="export-sheet-btn export-sheet-print" @click="onPrintFavorites">
            <span class="sheet-btn-icon">🖨️</span>
            <span>
              <strong>{{ t('map.cheatSheet') }}</strong>
              <small>
                {{
                  favCount > 0
                    ? t('map.printBetterPc', { count: favCount })
                    : t('map.printNeedFav')
                }}
              </small>
            </span>
          </button>

        </div>
        <PoiLegend v-else embedded />
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
  grid-template-columns: 320px minmax(0, 1fr);
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
  border-right: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  transition: opacity 0.15s ease;
}

.sidebar.collapsed {
  opacity: 0;
  pointer-events: none;
  border-right: none;
}

.map-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.map-header h1 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.3;
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

.sidebar-brand {
  display: block;
  margin: 0 0 0.55rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.sidebar-brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 6px;
}

.sidebar-logo {
  display: block;
  height: 1.5rem;
  width: auto;
  max-width: 160px;
  object-fit: contain;
  object-position: left center;
  pointer-events: none;
}

.meta {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.sidebar-settings {
  margin-top: 0.65rem;
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
  gap: 0.65rem;
  min-height: 58px;
  padding: 0.7rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 5;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.toolbar-title {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.route-name {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-meta {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.tool-btn {
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font-size: 0.88rem;
  line-height: 1.2;
  white-space: nowrap;
}

.tool-btn:hover {
  background: var(--border);
}

.home-btn {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 700;
}

.home-btn:hover {
  background: var(--primary-dark, #1b4332);
  border-color: var(--primary-dark, #1b4332);
  color: #fff;
}

.share-btn {
  color: var(--primary);
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
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(45, 106, 79, 0.35);
}

.export-toggle:hover {
  background: var(--primary-dark);
  border-color: var(--primary-dark);
}

.export-toggle.active {
  background: var(--primary-dark);
  color: #fff;
  border-color: var(--primary-dark);
}

.offline-banner {
  position: absolute;
  top: 3.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 22;
  max-width: min(520px, calc(100% - 2rem));
  padding: 0.65rem 0.85rem;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.offline-banner-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.85rem;
}

.offline-banner-text strong {
  font-size: 0.9rem;
}

.offline-banner-text span {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.35;
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
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
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
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
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
  border: none;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.export-tip-btn:hover {
  background: var(--primary-dark);
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
  border: 1px solid var(--border);
  border-left: none;
  border-radius: 0 10px 10px 0;
  background: var(--surface);
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
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
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  pointer-events: none;
  white-space: nowrap;
}

.map-cp-tools {
  position: absolute;
  top: 54px;
  left: 10px;
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  pointer-events: none;
}

.map-cp-tools > * {
  pointer-events: auto;
}

.map-cp-fab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  background: #fff;
  color: #111;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1), 0 4px 14px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.map-cp-fab.active {
  background: var(--primary, #2d6a4f);
  color: #fff;
  box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.35), 0 4px 14px rgba(0, 0, 0, 0.18);
}

.map-cp-fab-label {
  letter-spacing: 0.02em;
}

.map-cp-menu {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 8.5rem;
  padding: 0.35rem;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(0, 0, 0, 0.14);
}

.map-cp-kind {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: none;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  background: transparent;
  color: #111;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.map-cp-kind:hover,
.map-cp-kind.active {
  background: #ecfdf5;
  color: var(--primary, #2d6a4f);
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
  .map-cp-tools {
    top: 10px;
    bottom: auto;
    left: 10px;
  }

  .map-cp-fab {
    width: 52px;
    height: 52px;
    padding: 0;
    justify-content: center;
    border-radius: 14px;
    font-size: 1.25rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .map-cp-fab-label {
    display: none;
  }

  /* Umgebung: readable one-thumb rescan pill */
  .map-nearby-fab {
    width: auto;
    min-width: 52px;
    min-height: 52px;
    height: auto;
    padding: 0.65rem 0.9rem;
    gap: 0.45rem;
    font-size: 0.92rem;
  }

  .map-nearby-fab .map-cp-fab-label {
    display: inline;
    font-size: 0.82rem;
    font-weight: 700;
    max-width: 9.5rem;
    line-height: 1.15;
    white-space: normal;
    text-align: left;
  }

  .map-nearby-fab.loading {
    opacity: 0.75;
  }

  .map-nearby-opts {
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
  }

  .map-cp-banner {
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: 72px;
    right: 12px;
    transform: none;
    max-width: none;
    border-radius: 12px;
  }

  .map-cp-tools:has(.map-nearby-fab) .map-cp-banner {
    left: auto;
  }
}

.mobile-only {
  display: none;
}

.tool-btn.ride-enter {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  font-weight: 700;
}

.tool-btn.nearby-enter {
  font-weight: 600;
}

.tool-btn.nearby-opts {
  font-weight: 600;
}

.ride-overlay {
  display: none;
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

@media (max-width: 1100px) {
  .toggle-label {
    display: none;
  }

  .toolbar-title {
    display: none;
  }

  .export-toggle {
    font-size: 0.82rem;
    padding: 0.55rem 0.75rem;
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

  .map-toolbar .toolbar-left .tool-btn:first-child {
    display: none;
  }

  .tool-btn.nearby-enter {
    display: none;
  }

  .toolbar-title {
    text-align: left;
  }

  .map-toolbar {
    min-height: 54px;
    padding: 0.6rem 0.75rem;
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
    bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    max-width: none;
  }

  .offline-banner {
    top: auto;
    bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    max-width: none;
  }

  .map-stack {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
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

  .nav-ride {
    color: var(--primary);
    font-weight: 700;
  }

  .map-layout.ride-mode .map-stack {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .map-layout.ride-mode .export-tip,
  .map-layout.ride-mode .offline-banner {
    bottom: calc(168px + env(safe-area-inset-bottom, 0px));
  }

  .map-layout.ride-mode .ride-overlay {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    padding: 0.45rem 0.55rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    padding-right: 4.25rem;
    pointer-events: none;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.48), transparent 70%);
  }

  .ride-exit {
    pointer-events: auto;
    align-self: flex-start;
    min-height: 36px;
    padding: 0.35rem 0.65rem;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
    color: #111;
    font-weight: 700;
    font-size: 0.78rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
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
    min-height: 36px;
    padding: 0.35rem 0.65rem;
    border: none;
    border-radius: 8px;
    background: var(--primary, #2d6a4f);
    color: #fff;
    font-weight: 700;
    font-size: 0.78rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
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
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    padding: 0.7rem 0.85rem;
    border: none;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.97);
    color: #111;
    text-align: left;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
    cursor: pointer;
  }

  .ride-primary-kind {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #4b5563;
  }

  .ride-primary-dist {
    font-size: 1.85rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--primary, #2d6a4f);
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
    font-size: 0.65rem;
    padding: 0.08rem 0.3rem;
  }

  .ride-primary-name {
    font-size: 0.92rem;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ride-primary-empty {
    pointer-events: none;
    margin: 0;
    padding: 0.7rem 0.85rem;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.88);
    color: #4b5563;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .ride-secondary {
    pointer-events: auto;
    width: 100%;
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    grid-template-areas:
      'kind dist eta open'
      'name name name name';
    column-gap: 0.45rem;
    row-gap: 0.1rem;
    align-items: baseline;
    padding: 0.45rem 0.65rem;
    border: none;
    border-radius: 10px;
    background: rgba(255, 251, 235, 0.96);
    color: #111;
    text-align: left;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
    cursor: pointer;
  }

  .ride-secondary-kind {
    grid-area: kind;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #92400e;
  }

  .ride-secondary strong {
    grid-area: dist;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    color: #92400e;
  }

  .ride-secondary-eta {
    grid-area: eta;
    font-size: 0.72rem;
    font-weight: 650;
    color: #78350f;
  }

  .ride-secondary .ride-open {
    grid-area: open;
    justify-self: end;
  }

  .ride-secondary-name {
    grid-area: name;
    font-size: 0.78rem;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0.2rem 0.15rem calc(0.2rem + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.45rem 0.15rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.68rem;
    line-height: 1.15;
    min-height: 56px;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-item.active {
    color: var(--primary);
    font-weight: 600;
  }

  .nav-export {
    color: var(--primary);
    font-weight: 700;
  }

  .nav-export.active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }

  .nav-icon {
    font-size: 1.35rem;
    line-height: 1;
  }

  .mobile-sheet {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    align-items: flex-end;
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  }

  .mobile-sheet-inner {
    background: var(--surface);
    width: 100%;
    max-height: min(78vh, 580px);
    border-radius: 16px 16px 0 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sheet-header h2 {
    margin: 0;
    font-size: 1rem;
  }

  .sheet-close {
    border: none;
    background: none;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0 0.25rem;
  }

  .mobile-sheet-inner :deep(.poi-list) {
    flex: 1;
    min-height: 0;
  }

  .sheet-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
  }

  .sheet-scroll :deep(.poi-list) {
    flex: none;
    min-height: auto;
  }

  .sheet-scroll :deep(.poi-list ul) {
    flex: none;
    min-height: auto;
    overflow: visible;
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
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
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface, #fff);
  color: var(--text);
  font-size: 0.9rem;
}

.export-name-field input:focus {
  outline: 2px solid var(--primary);
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
  background: var(--surface-hover, rgba(0, 0, 0, 0.06));
}

.export-item.featured {
  background: #f0f9ff;
}

.export-item.featured:hover {
  background: #e0f2fe;
}

.export-icon {
  flex-shrink: 0;
  font-size: 1.1rem;
  line-height: 1.4;
}

.export-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.export-text strong {
  font-size: 0.88rem;
}

.export-text small {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.3;
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
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  font-size: 0.9rem;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.export-sheet-btn.featured {
  background: #eff6ff;
  border-color: #93c5fd;
}

.export-sheet-btn strong {
  display: block;
}

.export-sheet-btn small {
  display: block;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
}

.sheet-btn-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.export-sheet-btn:hover {
  background: var(--surface-hover, rgba(0, 0, 0, 0.06));
}

.export-sheet-btn.featured:hover {
  background: #dbeafe;
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
</style>
