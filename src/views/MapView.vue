<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapStore } from '../stores/mapStore'
import MapCanvas from '../components/MapCanvas.vue'
import ElevationProfile from '../components/ElevationProfile.vue'
import PoiList from '../components/PoiList.vue'
import PoiDetailSheet from '../components/PoiDetailSheet.vue'
import PoiLegend from '../components/PoiLegend.vue'

const store = useMapStore()
const route = useRoute()
const router = useRouter()

async function loadIfNeeded() {
  const id = route.params.id as string
  if (id === 'view') return
  if (!id) return
  if (store.savedMapId === id && store.mapReady) return
  await store.loadSavedMap(id)
}

onMounted(() => {
  if (store.mode === 'loading' && !store.mapReady) {
    void loadIfNeeded()
  } else if (!store.mapReady) {
    void loadIfNeeded()
  }
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

async function copyShare() {
  const url = shareUrl()
  if (!url) return
  await navigator.clipboard.writeText(url)
}

function goHome() {
  store.backToLanding()
  void router.push('/')
}
</script>

<template>
  <div v-if="store.mapReady" class="map-layout">
    <aside class="sidebar">
      <header class="map-header">
        <button type="button" class="back" @click="goHome">← Zurück</button>
        <h1>{{ store.routeName }}</h1>
        <p class="meta">{{ store.totalKm.toFixed(1) }} km · {{ store.displayPois.length }} POIs</p>
        <button
          v-if="store.savedMapId"
          type="button"
          class="share-btn"
          @click="copyShare"
        >
          Link kopieren
        </button>
      </header>
      <PoiList />
      <PoiLegend />
    </aside>

    <main class="map-main">
      <MapCanvas />
      <ElevationProfile />
    </main>

    <button
      type="button"
      class="mobile-poi-toggle"
      @click="store.showPoiList = !store.showPoiList"
    >
      POIs ({{ store.displayPois.length }})
    </button>

    <div v-if="store.showPoiList" class="mobile-sheet" @click.self="store.showPoiList = false">
      <div class="mobile-sheet-inner">
        <PoiList />
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
  grid-template-columns: 320px 1fr;
  height: 100vh;
  height: 100dvh;
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
}

.map-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.map-header h1 {
  margin: 0.5rem 0 0;
  font-size: 1.1rem;
}

.meta {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.back {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
}

.share-btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--primary);
  border-radius: 6px;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.85rem;
}

.map-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.map-main :deep(.map-canvas) {
  flex: 1;
}

.mobile-poi-toggle,
.mobile-sheet {
  display: none;
}

.error-page {
  max-width: 480px;
  margin: 4rem auto;
  text-align: center;
  padding: 1rem;
}

@media (max-width: 768px) {
  .map-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .sidebar {
    display: none;
  }

  .mobile-poi-toggle {
    display: block;
    position: fixed;
    bottom: 150px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  }

  .mobile-sheet {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.35);
    align-items: flex-end;
  }

  .mobile-sheet-inner {
    background: var(--surface);
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    overflow: hidden;
  }
}
</style>
