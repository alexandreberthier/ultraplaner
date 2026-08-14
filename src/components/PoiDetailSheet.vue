<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { formatDistance, formatKm } from '../services/geo'
import { poiCategoryLabel } from '../utils/poiLabels'
import { googleMapsDirectionsUrl } from '../services/navigation'

const store = useMapStore()
const { t } = useI18n()

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

const googleNavHref = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return '#'
  return googleMapsDirectionsUrl(poi.lat, poi.lng)
})

function onNavigate() {
  if (renameOpen.value) saveRename()
  else persistFavName()
  onClose()
}
</script>

<template>
  <div
    v-if="store.selectedPoi"
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
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(0.75rem, env(safe-area-inset-top, 0px)) 0.75rem
    max(0.75rem, env(safe-area-inset-bottom, 0px));
  touch-action: none;
  overscroll-behavior: none;
}

.sheet {
  background: var(--surface);
  width: 100%;
  max-width: 480px;
  max-height: min(88dvh, 88vh);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
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
  background: var(--surface);
  z-index: 2;
}

.sheet-top h3,
.rename-input {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
  padding-right: 0.15rem;
}

.rename-input {
  font: inherit;
  font-weight: 700;
  color: var(--text);
  padding: 0.35rem 0.5rem;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  background: #fffbeb;
}

.icon-btn,
.close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -0.35rem 0 0;
  border: none;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text);
}

.close {
  margin-right: -0.25rem;
  font-size: 1.6rem;
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
}

dl {
  margin: 0;
}

dt {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

dt:first-child {
  margin-top: 0;
}

dd {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
}

.eta-sub {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.9em;
}

.actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 1.25rem 0.75rem;
  background: var(--surface);
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
  border-radius: 10px;
  background: var(--surface-2);
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  color: inherit;
  font: inherit;
  font-size: 1.02rem;
  font-weight: 600;
}

.fav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 52px;
  border-color: #f59e0b;
  background: #f59e0b;
  color: #fff;
  font-size: 1.08rem;
  font-weight: 800;
}

.fav-star {
  font-size: 1.35em;
  line-height: 1;
}

.fav-btn.active {
  background: #dc2626;
  border-color: #b91c1c;
  color: #fff;
}

.nav-btn {
  padding: 0.7rem 0.85rem;
  min-height: 46px;
  border-color: var(--primary);
  background: var(--surface);
  color: var(--primary);
  font-weight: 700;
}

@media (max-width: 768px) {
  .sheet-backdrop {
    padding: max(0.4rem, env(safe-area-inset-top, 0px)) 0.5rem
      max(0.4rem, env(safe-area-inset-bottom, 0px));
  }

  .sheet {
    max-width: none;
    max-height: min(92dvh, 92vh);
  }

  .sheet-top {
    padding: 1rem 1rem 0.8rem 1.2rem;
  }

  .sheet-top h3,
  .rename-input {
    font-size: 1.5rem;
  }

  .icon-btn,
  .close {
    width: 52px;
    height: 52px;
  }

  .close {
    font-size: 2rem;
  }

  .icon-btn {
    font-size: 1.45rem;
  }

  .actions {
    padding: 1rem 1.2rem 0.9rem;
    gap: 0.75rem;
  }

  .sheet-scroll {
    font-size: 1.22rem;
    padding: 1rem 1.2rem 1.5rem;
  }

  dt {
    font-size: 1.05rem;
  }

  dd {
    font-size: 1.28rem;
  }

  .fav-btn {
    min-height: 64px;
    font-size: 1.28rem;
    border-radius: 14px;
  }

  .nav-btn {
    min-height: 56px;
    font-size: 1.18rem;
    border-radius: 14px;
  }
}
</style>
