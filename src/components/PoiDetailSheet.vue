<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useRideMode } from '../composables/useRideMode'
import { useRidePosition } from '../composables/useRidePosition'
import { formatDistance, formatKm, haversineM } from '../services/geo'
import { poiCategoryEmoji, poiCategoryLabel } from '../utils/poiLabels'
import { googleMapsDirectionsUrl, googleMapsPlaceUrl, reverseGeocodeAddress } from '../services/navigation'
import { hasOsmOpeningHours, openStatusAtEta } from '../utils/openingHours'

const store = useMapStore()
const { t } = useI18n()
const { rideMode } = useRideMode()
const { rideKmAlong, rideLatLng } = useRidePosition()

const isFavorite = computed(() =>
  store.selectedPoi ? store.favorites.has(store.selectedPoi.id) : false
)

const displayName = computed(() =>
  store.selectedPoi ? store.favoriteLabel(store.selectedPoi) : ''
)

const customNameDraft = ref('')
const renameOpen = ref(false)
const renameInput = ref<HTMLInputElement | null>(null)

function loadFavoriteMetaDrafts(id: string) {
  const meta = store.favoriteMeta.get(id)
  customNameDraft.value = meta?.customName ?? ''
}

function persistFavName() {
  if (!store.selectedPoi || !isFavorite.value) return
  store.updateFavoriteMeta(store.selectedPoi.id, {
    customName: customNameDraft.value,
  })
}

watch(
  () => store.selectedPoi?.id,
  (id) => {
    renameOpen.value = false
    if (!id || !store.selectedPoi) {
      customNameDraft.value = ''
      return
    }
    loadFavoriteMetaDrafts(id)
  }
)

function onToggleFavorite() {
  if (!store.selectedPoi) return
  const wasFav = isFavorite.value
  store.toggleFavorite(store.selectedPoi.id)
  if (wasFav) {
    customNameDraft.value = ''
    renameOpen.value = false
    return
  }
  loadFavoriteMetaDrafts(store.selectedPoi.id)
}

async function toggleRename() {
  if (renameOpen.value) {
    saveRename()
    return
  }
  if (store.selectedPoi) {
    loadFavoriteMetaDrafts(store.selectedPoi.id)
    if (!customNameDraft.value) customNameDraft.value = store.selectedPoi.name
  }
  renameOpen.value = true
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function saveRename() {
  if (!store.selectedPoi) {
    renameOpen.value = false
    return
  }
  const name = customNameDraft.value.trim()
  const original = store.selectedPoi.name
  if (name && name !== original && !isFavorite.value) {
    store.toggleFavorite(store.selectedPoi.id)
  }
  if (isFavorite.value || (name && name !== original)) {
    store.updateFavoriteMeta(store.selectedPoi.id, {
      customName: name === original ? '' : name,
    })
  }
  renameOpen.value = false
}

const selectedEta = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return null
  return store.etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
})

function onClose() {
  if (renameOpen.value) saveRename()
  else persistFavName()
  store.closePoiDetail()
}

function onSheetKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') onClose()
}

watch(
  () => store.selectedPoi,
  (poi) => {
    if (poi) document.addEventListener('keydown', onSheetKeydown)
    else document.removeEventListener('keydown', onSheetKeydown)
  }
)

onUnmounted(() => {
  document.removeEventListener('keydown', onSheetKeydown)
})

const googlePlaceHref = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return '#'
  return googleMapsPlaceUrl(poi.lat, poi.lng, displayName.value || poi.name, {
    categoryLabel: poiCategoryLabel(poi.category),
    address: poi.address,
  })
})

const googleNavHref = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return '#'
  return googleMapsDirectionsUrl(poi.lat, poi.lng)
})

const placeLinkBusy = ref(false)

async function onOpenPlace(e: Event) {
  const poi = store.selectedPoi
  if (!poi) return
  // Already have OSM address → sync href is enough
  if (poi.address?.trim()) return
  e.preventDefault()
  if (placeLinkBusy.value) return
  placeLinkBusy.value = true
  try {
    const resolved = await reverseGeocodeAddress(poi.lat, poi.lng)
    const href = googleMapsPlaceUrl(poi.lat, poi.lng, displayName.value || poi.name, {
      categoryLabel: poiCategoryLabel(poi.category),
      address: resolved,
    })
    window.open(href, '_blank', 'noopener,noreferrer')
  } catch {
    window.open(googlePlaceHref.value, '_blank', 'noopener,noreferrer')
  } finally {
    placeLinkBusy.value = false
  }
}

const rideDistanceKm = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return 0
  if (poi.distanceAlongRouteKm != null && rideKmAlong.value != null) {
    return Math.abs(poi.distanceAlongRouteKm - rideKmAlong.value)
  }
  if (rideLatLng.value) {
    return haversineM(rideLatLng.value, { lat: poi.lat, lng: poi.lng }) / 1000
  }
  return (poi.distanceToRouteM ?? 0) / 1000
})

const rideOpen = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return null
  const status = openStatusAtEta(poi, new Date(), { bufferMinutes: 0 })
  if (status === 'open') return { status, label: t('map.rideOpenNow') }
  if (status === 'closed') return { status, label: t('map.rideClosedNow') }
  if (hasOsmOpeningHours(poi)) return { status: 'unknown', label: t('map.rideHoursUnknown') }
  return null
})

function onNavigate() {
  if (renameOpen.value) saveRename()
  else persistFavName()
  onClose()
}
</script>

<template>
  <div
    v-if="store.selectedPoi && rideMode"
    class="ride-peek"
  >
    <div
      class="ride-peek-card"
      role="dialog"
      :aria-label="displayName"
    >
      <div class="ride-peek-row">
        <span class="ride-peek-emoji" aria-hidden="true">{{
          poiCategoryEmoji(store.selectedPoi.category)
        }}</span>
        <div class="ride-peek-text">
          <strong>{{ displayName }}</strong>
          <div class="ride-peek-meta">
            <span class="ride-peek-dist">{{ formatKm(rideDistanceKm) }}</span>
            <span
              v-if="rideOpen"
              class="ride-open"
              :class="`ride-open--${rideOpen.status}`"
            >
              {{ rideOpen.label }}
            </span>
          </div>
        </div>
        <button type="button" class="ride-peek-close" :aria-label="t('detail.close')" @click="onClose()">
          ×
        </button>
      </div>
      <div class="ride-peek-actions">
        <a
          class="ride-peek-maps ride-peek-nav"
          :href="googleNavHref"
          target="_blank"
          rel="noopener noreferrer"
          @click="onNavigate"
        >
          {{ t('detail.navigate') }}
        </a>
        <a
          class="ride-peek-maps"
          :href="googlePlaceHref"
          target="_blank"
          rel="noopener noreferrer"
          @click="onOpenPlace"
        >
          {{ t('detail.openPlace') }}
        </a>
        <button
          type="button"
          class="ride-peek-fav"
          :class="{ active: isFavorite }"
          :aria-label="isFavorite ? t('detail.removeFavorite') : t('detail.addFavorite')"
          @click="onToggleFavorite"
        >
          {{ isFavorite ? '★' : '☆' }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-else-if="store.selectedPoi"
    class="sheet-backdrop"
    @click.self="onClose()"
    @touchmove.self.prevent
    @wheel.self.prevent
  >
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      @touchmove.stop
      @pointerdown.stop
      @wheel.stop
    >
      <header class="sheet-top">
        <input
          v-if="renameOpen"
          ref="renameInput"
          v-model="customNameDraft"
          class="rename-input"
          type="text"
          maxlength="40"
          :aria-label="t('detail.renamePoi')"
          @keydown.enter.prevent="saveRename"
          @keydown.escape.stop="saveRename"
        />
        <h3 v-else>{{ displayName }}</h3>
        <button
          type="button"
          class="icon-btn"
          :aria-label="renameOpen ? t('detail.favApply') : t('detail.renamePoi')"
          :title="renameOpen ? t('detail.favApply') : t('detail.renamePoi')"
          @click="toggleRename"
        >
          {{ renameOpen ? '✓' : '✎' }}
        </button>
        <button type="button" class="close" :aria-label="t('detail.close')" @click="onClose()">
          ×
        </button>
      </header>

      <div class="actions" :class="{ 'nearby-nav': store.isNearbyMap }">
        <button
          type="button"
          class="fav-btn"
          :class="{ active: isFavorite }"
          @click="onToggleFavorite"
        >
          <span class="fav-star" aria-hidden="true">{{ isFavorite ? '★' : '☆' }}</span>
          {{ isFavorite ? t('detail.removeFavorite') : t('detail.addFavorite') }}
        </button>

        <a
          class="nav-btn"
          :href="googlePlaceHref"
          target="_blank"
          rel="noopener noreferrer"
          @click="onOpenPlace"
        >
          {{ t('detail.openPlace') }}
        </a>
        <a
          class="nav-btn nav-btn-secondary"
          :href="googleNavHref"
          target="_blank"
          rel="noopener noreferrer"
          @click="onNavigate"
        >
          {{ t('detail.navigate') }}
        </a>
      </div>

      <div class="sheet-scroll">
        <dl>
          <dt>{{ t('detail.category') }}</dt>
          <dd>{{ poiCategoryLabel(store.selectedPoi.category) }}</dd>
          <dt>{{ store.isNearbyMap ? t('detail.distanceAway') : t('detail.routeKm') }}</dt>
          <dd>{{ formatKm(store.selectedPoi.distanceAlongRouteKm ?? 0) }}</dd>
          <template v-if="!store.isNearbyMap">
            <dt>{{ t('eta.time') }}</dt>
            <dd v-if="selectedEta">
              <template v-if="selectedEta.clockLabel">
                {{ selectedEta.clockLabel }}
                <span class="eta-sub">{{ t('detail.etaFromStart', { duration: selectedEta.durationLabel }) }}</span>
              </template>
              <template v-else>{{ t('detail.etaFromStartShort', { duration: selectedEta.durationLabel }) }}</template>
            </dd>
          </template>
          <dt>{{ store.isNearbyMap ? t('detail.distCenter') : t('detail.distRoute') }}</dt>
          <dd>{{ formatDistance(store.selectedPoi.distanceToRouteM ?? 0) }}</dd>
          <dt v-if="store.selectedPoi.subType">{{ t('detail.type') }}</dt>
          <dd v-if="store.selectedPoi.subType">{{ store.selectedPoi.subType }}</dd>
        </dl>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(0.75rem, env(safe-area-inset-top, 0px)) 0.75rem
    max(0.75rem, env(safe-area-inset-bottom, 0px));
  touch-action: none;
  overscroll-behavior: none;
}

.sheet {
  background: #fff;
  width: 100%;
  max-width: 480px;
  max-height: min(88dvh, 88vh);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow);
  touch-action: pan-y;
  overscroll-behavior: contain;
}

.sheet-top {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  padding: 0.85rem 1rem 0.65rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: var(--cream);
  z-index: 2;
}

.sheet-top h3,
.rename-input {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.3;
  padding-right: 0.15rem;
  color: #111;
}

.rename-input {
  font: inherit;
  font-weight: 800;
  color: #111;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow);
}

.icon-btn,
.close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -0.35rem 0 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: #111;
  font-weight: 800;
  box-shadow: var(--shadow);
}

.close {
  margin-right: -0.25rem;
  font-size: 1.6rem;
}

.icon-btn:hover,
.close:hover {
  background: var(--cream);
}

.sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding: 0.75rem 1.25rem 1.25rem;
  font-size: 1.02rem;
  background: #fff;
}

dl {
  margin: 0;
}

dt {
  font-size: 0.78rem;
  color: #111;
  margin-top: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.65;
}

dt:first-child {
  margin-top: 0;
}

dd {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #111;
}

.eta-sub {
  color: #111;
  opacity: 0.65;
  font-weight: 600;
  font-size: 0.9em;
}

.actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 1.25rem 0.75rem;
  background: #fff;
  border-bottom: 1px solid var(--border);
}

.actions.nearby-nav {
  gap: 0.65rem;
}

.fav-btn,
.nav-btn {
  width: 100%;
  padding: 0.75rem 0.85rem;
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  color: #111;
  font: inherit;
  font-size: 1.02rem;
  font-weight: 600;
  box-shadow: var(--shadow);
}

.fav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 52px;
  background: var(--cta);
  color: var(--cta-text);
  font-size: 1.08rem;
  font-weight: 700;
}

.fav-star {
  font-size: 1.35em;
  line-height: 1;
}

.fav-btn.active {
  background: #dc2626;
  border-color: var(--border);
  color: #fff;
}

.fav-btn:hover,
.nav-btn:hover {
  box-shadow: var(--shadow);
}

.nav-btn {
  padding: 0.7rem 0.85rem;
  min-height: 46px;
  background: #fff;
  color: #111;
}

.nav-btn-secondary {
  font-weight: 600;
  font-size: 0.95rem;
  min-height: 42px;
}

@media (max-width: 768px) {
  .sheet-backdrop {
    padding: max(0.35rem, env(safe-area-inset-top, 0px)) 0.55rem
      max(0.35rem, env(safe-area-inset-bottom, 0px));
    align-items: flex-end;
  }

  .sheet {
    max-width: none;
    max-height: min(72dvh, 72vh);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .sheet-top {
    padding: 0.65rem 0.75rem 0.5rem 0.9rem;
    gap: 0.25rem;
  }

  .sheet-top h3,
  .rename-input {
    font-size: 1.05rem;
    line-height: 1.25;
  }

  .icon-btn,
  .close {
    width: 40px;
    height: 40px;
    margin: -0.15rem 0 0;
  }

  .close {
    font-size: 1.45rem;
    margin-right: -0.1rem;
  }

  .icon-btn {
    font-size: 1.1rem;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0.55rem 0.85rem 0.5rem;
    gap: 0.4rem;
  }

  .fav-btn {
    grid-column: 1 / -1;
    min-height: 44px;
    font-size: 0.95rem;
    padding: 0.55rem 0.7rem;
  }

  .fav-star {
    font-size: 1.15em;
  }

  .nav-btn {
    min-height: 40px;
    font-size: 0.82rem;
    padding: 0.45rem 0.4rem;
    font-weight: 600;
  }

  .nav-btn-secondary {
    min-height: 40px;
    font-size: 0.82rem;
  }

  .sheet-scroll {
    font-size: 0.95rem;
    padding: 0.55rem 0.9rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  }

  dt {
    margin-top: 0.45rem;
    font-size: 0.7rem;
  }

  dd {
    font-size: 0.95rem;
    font-weight: 650;
  }
}

.ride-peek {
  position: fixed;
  left: 0.45rem;
  right: 0.45rem;
  bottom: calc(0.45rem + env(safe-area-inset-bottom, 0px));
  z-index: 45;
  pointer-events: none;
}

.ride-peek-card {
  pointer-events: auto;
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  padding: 0.55rem 0.65rem 0.6rem;
  border: 1px solid var(--border);
  background: #fff;
  box-shadow: var(--shadow);
}

.ride-peek-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.ride-peek-emoji {
  flex-shrink: 0;
  font-size: 1.45rem;
  line-height: 1.2;
}

.ride-peek-text {
  flex: 1;
  min-width: 0;
}

.ride-peek-text strong {
  display: block;
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ride-peek-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
  margin-top: 0.2rem;
}

.ride-peek-dist {
  font-size: 1.15rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--primary, #2d6a4f);
}

.ride-open {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.12rem 0.4rem;
  border: 1px solid var(--border);
  background: #e5e7eb;
  color: #111;
}

.ride-open--open {
  background: color-mix(in srgb, var(--primary, #2d6a4f) 22%, #fff);
}

.ride-open--closed {
  background: #fecaca;
}

.ride-open--unknown {
  background: var(--cream);
}

.ride-peek-close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -0.15rem -0.1rem 0 0;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 1.55rem;
  font-weight: 800;
  line-height: 1;
  color: #111;
  cursor: pointer;
  box-shadow: var(--shadow);
}

.ride-peek-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.ride-peek-maps {
  flex: 1 1 calc(50% - 1.6rem);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  background: #fff;
  color: #111;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
  box-shadow: var(--shadow);
}

.ride-peek-nav {
  background: var(--cream, #f7f3eb);
}

.ride-peek-fav {
  flex-shrink: 0;
  width: 44px;
  min-height: 44px;
  border: 1px solid transparent;
  background: var(--cta, #2d6a4f);
  color: var(--cta-text, #fff);
  font-size: 1.25rem;
  cursor: pointer;
  box-shadow: var(--shadow);
}

.ride-peek-fav.active {
  background: #dc2626;
  color: #fff;
}

@media (min-width: 769px) {
  .ride-peek {
    left: auto;
    right: 1rem;
    bottom: 1rem;
    width: min(22rem, calc(100vw - 2rem));
  }
}
</style>
