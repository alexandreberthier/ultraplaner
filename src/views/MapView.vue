<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapStore } from '../stores/mapStore'
import { useMapExport } from '../composables/useMapExport'
import MapCanvas from '../components/MapCanvas.vue'
import ElevationProfile from '../components/ElevationProfile.vue'
import PoiList from '../components/PoiList.vue'
import PoiCategoryFilter from '../components/PoiCategoryFilter.vue'
import PoiDetailSheet from '../components/PoiDetailSheet.vue'
import PoiLegend from '../components/PoiLegend.vue'
import EtaPlanner from '../components/EtaPlanner.vue'

const store = useMapStore()
const route = useRoute()
const router = useRouter()
const { exportGpxAll, exportGpxFavorites, exportCsv, printFavorites } = useMapExport()

const sidebarOpen = ref(true)
const mobilePanel = ref<'none' | 'pois' | 'legend' | 'export'>('none')
const shareCopied = ref(false)
const showExportMenu = ref(false)
const showFavHint = ref(false)
const showExportTip = ref(false)

const EXPORT_TIP_KEY = 'ultraplaner-export-tip-seen'

const favCount = computed(() => store.favorites.size)
const finishEta = computed(() => store.etaAtRouteKm(store.totalKm))
const rideDuration = computed(() => finishEta.value.durationLabel)

async function loadIfNeeded() {
  const id = route.params.id as string
  if (id === 'view') return
  if (!id) return
  if (store.savedMapId === id && store.mapReady) return
  await store.loadSavedMap(id)
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
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
  if (favHintTimer) clearTimeout(favHintTimer)
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
        text: `Route „${store.routeName}“ auf UltraPlaner`,
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
  mobilePanel.value = 'none'
  store.backToLanding()
  void router.push('/')
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function openMobilePanel(panel: 'pois' | 'legend' | 'export') {
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

function openExportMenuFromTip() {
  dismissExportTip()
  if (isMobileLayout()) {
    openMobilePanel('export')
    return
  }
  showExportMenu.value = true
}

function runExport(action: () => void) {
  action()
  closeExportMenu()
}

let favHintTimer: ReturnType<typeof setTimeout> | null = null
watch(favCount, (count, prev) => {
  if (count > prev && count > 0) {
    showFavHint.value = true
    if (favHintTimer) clearTimeout(favHintTimer)
    favHintTimer = setTimeout(() => {
      showFavHint.value = false
    }, 6000)
  }
})

function onDocClick(e: MouseEvent) {
  if (!showExportMenu.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.export-wrap')) closeExportMenu()
}
</script>

<template>
  <div v-if="store.mapReady" class="map-layout" :class="{ 'sidebar-closed': !sidebarOpen }">
    <aside class="sidebar" :class="{ collapsed: !sidebarOpen }" :aria-hidden="!sidebarOpen">
      <header class="map-header">
        <h1>{{ store.routeName }}</h1>
        <p class="meta">
          {{ store.totalKm.toFixed(1) }} km · {{ rideDuration }}
          <template v-if="finishEta.clockLabel"> · Ziel {{ finishEta.clockLabel }}</template>
          · {{ store.displayPois.length }} POIs
        </p>
      </header>
      <EtaPlanner />
      <PoiCategoryFilter />
      <PoiList />
      <PoiLegend />
    </aside>

    <main class="map-main">
      <header class="map-toolbar">
        <div class="toolbar-left">
          <button
            type="button"
            class="tool-btn sidebar-toggle"
            :aria-expanded="sidebarOpen"
            @click="toggleSidebar"
          >
            <span class="toggle-chevron">{{ sidebarOpen ? '‹' : '›' }}</span>
            <span class="toggle-label">{{ sidebarOpen ? 'Liste ausblenden' : 'Liste einblenden' }}</span>
          </button>
          <button type="button" class="tool-btn home-btn" title="Startseite" @click="goHome">
            <span class="home-label-full">← Start</span>
            <span class="home-label-short" aria-hidden="true">←</span>
          </button>
        </div>

        <div class="toolbar-title">
          <span class="route-name">{{ store.routeName }}</span>
          <span class="route-meta">
            {{ store.totalKm.toFixed(1) }} km · {{ rideDuration }}
            <template v-if="finishEta.clockLabel"> · ETA {{ finishEta.clockLabel }}</template>
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
              title="Route exportieren und Spickzettel"
              @click.stop="toggleExportMenu"
            >
              ↓ Route exportieren ▾
            </button>
            <div v-if="showExportMenu" class="export-menu" role="menu" @click.stop>
              <header class="export-menu-head">
                <strong>Route exportieren</strong>
                <p>GPX, CSV oder Spickzettel für Garmin, Komoot &amp; Co.</p>
              </header>

              <p class="export-section">Dateien</p>
              <button
                type="button"
                class="export-item featured"
                role="menuitem"
                @click="runExport(exportGpxAll)"
              >
                <span class="export-icon">↓</span>
                <span class="export-text">
                  <strong>GPX — Route + alle POIs</strong>
                  <small>Empfohlen · Garmin, Komoot, RideWithGPS</small>
                </span>
              </button>
              <button type="button" class="export-item" role="menuitem" @click="runExport(exportGpxFavorites)">
                <span class="export-icon">↓</span>
                <span class="export-text">
                  <strong>GPX — nur Favoriten</strong>
                  <small>{{ favCount }} markierte Versorgungspunkte</small>
                </span>
              </button>
              <button type="button" class="export-item" role="menuitem" @click="runExport(exportCsv)">
                <span class="export-icon">↓</span>
                <span class="export-text">
                  <strong>CSV — POI-Liste</strong>
                  <small>Tabellenformat mit km-Position</small>
                </span>
              </button>

              <div class="export-divider" />
              <p class="export-section">Drucken</p>
              <button type="button" class="export-item" role="menuitem" @click="runExport(printFavorites)">
                <span class="export-icon">🖨️</span>
                <span class="export-text">
                  <strong>Spickzettel drucken</strong>
                  <small>
                    {{ favCount > 0 ? `${favCount} Favoriten · km-Liste für den Vorbau` : 'Zuerst POIs als ★ Favorit markieren' }}
                  </small>
                </span>
              </button>
            </div>
          </div>
          <button
            v-if="store.savedMapId"
            type="button"
            class="tool-btn share-btn"
            :title="shareCopied ? 'Kopiert!' : canNativeShare ? 'Karte teilen' : 'Link zur Karte kopieren'"
            @click="shareMap()"
          >
            {{ shareCopied ? '✓ Kopiert' : '🔗 Teilen' }}
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
        <span>POI-Liste</span>
      </button>

      <Transition name="toast">
        <div v-if="showExportTip" class="export-tip" role="status">
          <div class="export-tip-text">
            <strong>Route exportieren?</strong>
            <span class="tip-desktop">Oben rechts: GPX, CSV oder Spickzettel für Garmin &amp; Komoot.</span>
            <span class="tip-mobile">Unten auf „Export“ tippen — GPX, CSV oder Spickzettel.</span>
          </div>
          <button type="button" class="export-tip-btn tip-desktop" @click="openExportMenuFromTip">
            Menü öffnen
          </button>
          <button type="button" class="export-tip-btn tip-mobile" @click="openExportMenuFromTip">
            Export öffnen
          </button>
          <button type="button" class="toast-close" aria-label="Schließen" @click="dismissExportTip()">
            ×
          </button>
        </div>
      </Transition>

      <Transition name="toast">
        <div v-if="showFavHint" class="fav-toast" role="status">
          <p>
            <strong>★ Favorit gespeichert</strong>
            <span class="tip-desktop" v-if="favCount === 1"> — markiere weitere POIs, dann Spickzettel drucken.</span>
            <span class="tip-desktop" v-else> — {{ favCount }} Favoriten bereit zum Drucken.</span>
            <span class="tip-mobile" v-if="favCount === 1"> — weitere markieren; Spickzettel am besten am Desktop.</span>
            <span class="tip-mobile" v-else> — {{ favCount }} Favoriten · Spickzettel am besten am Desktop.</span>
          </p>
          <button
            type="button"
            class="toast-print tip-desktop"
            @click="printFavorites(); showFavHint = false"
          >
            🖨️ Jetzt drucken
          </button>
          <button
            type="button"
            class="toast-print tip-mobile"
            @click="showFavHint = false; openMobilePanel('export')"
          >
            Zum Export
          </button>
          <button type="button" class="toast-close" aria-label="Schließen" @click="showFavHint = false">×</button>
        </div>
      </Transition>

      <div class="map-stack">
        <MapCanvas />
        <ElevationProfile />
      </div>
    </main>

    <!-- Mobile bottom nav -->
    <nav class="mobile-nav" aria-label="Kartenmenü">
      <button type="button" class="nav-item" @click="goHome">
        <span class="nav-icon">🏠</span>
        <span>Start</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ active: mobilePanel === 'pois' }"
        @click="openMobilePanel('pois')"
      >
        <span class="nav-icon">📍</span>
        <span>POIs ({{ store.displayPois.length }})</span>
      </button>
      <button
        type="button"
        class="nav-item"
        :class="{ active: mobilePanel === 'legend' }"
        @click="openMobilePanel('legend')"
      >
        <span class="nav-icon">🗺️</span>
        <span>Legende</span>
      </button>
      <button
        type="button"
        class="nav-item nav-export"
        :class="{ active: mobilePanel === 'export' }"
        @click="openMobilePanel('export')"
      >
        <span class="nav-icon">↓</span>
        <span>Export</span>
      </button>
    </nav>

    <div v-if="mobilePanel !== 'none'" class="mobile-sheet" @click.self="closeMobilePanel">
      <div class="mobile-sheet-inner">
        <header class="sheet-header">
          <h2>{{ mobilePanel === 'pois' ? 'Versorgungspunkte' : mobilePanel === 'export' ? 'Route exportieren' : 'Legende' }}</h2>
          <button type="button" class="sheet-close" @click="closeMobilePanel">×</button>
        </header>
        <EtaPlanner v-if="mobilePanel === 'pois'" />
        <PoiCategoryFilter v-if="mobilePanel === 'pois'" />
        <PoiList v-if="mobilePanel === 'pois'" />
        <div v-else-if="mobilePanel === 'export'" class="export-sheet-body">
          <p class="export-sheet-intro">
            Route als Datei speichern — z. B. für Garmin, Komoot oder RideWithGPS.
          </p>
          <button
            type="button"
            class="export-sheet-btn featured"
            @click="exportGpxAll(); closeMobilePanel()"
          >
            <span class="sheet-btn-icon">↓</span>
            <span>
              <strong>GPX — Route + POIs</strong>
              <small>Empfohlen · funktioniert mit den meisten Rad-Apps</small>
            </span>
          </button>
          <button type="button" class="export-sheet-btn" @click="exportGpxFavorites(); closeMobilePanel()">
            <span class="sheet-btn-icon">↓</span>
            <span><strong>GPX</strong> — nur Favoriten ({{ favCount }})</span>
          </button>
          <button type="button" class="export-sheet-btn" @click="exportCsv(); closeMobilePanel()">
            <span class="sheet-btn-icon">↓</span>
            <span><strong>CSV</strong> — POI-Liste</span>
          </button>

          <button
            v-if="store.savedMapId"
            type="button"
            class="export-sheet-btn"
            @click="shareMap(true)"
          >
            <span class="sheet-btn-icon">🔗</span>
            <span>
              <strong>{{ shareCopied ? 'Link kopiert' : 'Karte teilen' }}</strong>
              <small>{{ canNativeShare ? 'Über die Teilen-Funktion des Handys' : 'Link in die Zwischenablage' }}</small>
            </span>
          </button>

          <p class="export-print-hint">
            Spickzettel ist am Desktop am übersichtlichsten — auf dem Handy oft unhandlich.
          </p>
          <button type="button" class="export-sheet-btn export-sheet-print" @click="onPrintFavorites">
            <span class="sheet-btn-icon">🖨️</span>
            <span>
              <strong>Spickzettel drucken</strong>
              <small>{{ favCount > 0 ? `${favCount} Favoriten · besser am PC` : 'Zuerst ★ Favoriten setzen' }}</small>
            </span>
          </button>
        </div>
        <PoiLegend v-else embedded />
      </div>
    </div>

    <PoiDetailSheet />
  </div>

  <div v-else-if="store.error" class="error-page">
    <p>{{ store.error }}</p>
    <button type="button" @click="goHome">Zur Startseite</button>
  </div>

  <div v-else class="error-page">
    <p>Keine Karte geladen.</p>
    <button type="button" @click="goHome">Zur Startseite</button>
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

.meta {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
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
  color: var(--primary);
  font-weight: 500;
}

.home-label-short {
  display: none;
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

.fav-toast {
  position: absolute;
  top: 3.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(520px, calc(100% - 2rem));
  padding: 0.65rem 0.85rem;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.fav-toast p {
  margin: 0;
  font-size: 0.85rem;
  flex: 1;
}

.toast-print {
  flex-shrink: 0;
  padding: 0.4rem 0.65rem;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
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
}

.map-stack :deep(.map-canvas-wrap) {
  flex: 1;
  min-height: 0;
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

  .home-label-full {
    display: none;
  }

  .home-label-short {
    display: inline;
  }

  .tip-desktop {
    display: none !important;
  }

  .tip-mobile {
    display: inline !important;
  }

  .export-tip-btn.tip-mobile,
  .toast-print.tip-mobile {
    display: inline-flex !important;
  }

  .export-tip {
    top: auto;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    left: 0.75rem;
    right: 0.75rem;
    transform: none;
    max-width: none;
  }

  .map-stack {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
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
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0.5rem 0.25rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.65rem;
    min-height: 56px;
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
    font-size: 1.1rem;
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

.export-section {
  margin: 0.5rem 1rem 0.25rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
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
