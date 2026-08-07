<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { formatDistance, formatKm } from '../services/geo'
import { poiCategoryLabel } from '../utils/poiLabels'
import { googleMapsDirectionsUrl } from '../services/navigation'
import {
  fetchPlaceOpeningHours,
  isGooglePlacesConfigured,
  type PlaceHoursResult,
} from '../services/googlePlaces'
import {
  hasOsmOpeningHours,
  isShopLikeWithoutHours,
  nextChangeLabel,
  prettifyOpeningHours,
  type OpenStatus,
} from '../utils/openingHours'
import { isAlwaysAvailableWater } from '../utils/poiNormalize'

const store = useMapStore()
const { t, locale } = useI18n()
const hoursLoading = ref(false)
const hoursError = ref('')
const hoursResult = ref<PlaceHoursResult | null>(null)

const isFavorite = computed(() =>
  store.selectedPoi ? store.favorites.has(store.selectedPoi.id) : false
)

const customNameDraft = ref('')
const noteDraft = ref('')
const metaEditing = ref(false)

function loadFavoriteMetaDrafts(id: string) {
  const meta = store.favoriteMeta.get(id)
  customNameDraft.value = meta?.customName ?? ''
  noteDraft.value = meta?.note ?? ''
}

watch(
  () => store.selectedPoi?.id,
  (id) => {
    hoursResult.value = null
    hoursError.value = ''
    metaEditing.value = false
    if (!id || !store.selectedPoi) {
      customNameDraft.value = ''
      noteDraft.value = ''
      return
    }
    loadFavoriteMetaDrafts(id)
  }
)

function saveFavoriteMeta() {
  if (!store.selectedPoi || !isFavorite.value) return
  store.updateFavoriteMeta(store.selectedPoi.id, {
    customName: customNameDraft.value,
    note: noteDraft.value,
  })
}

function startEditMeta() {
  if (!store.selectedPoi || !isFavorite.value) return
  loadFavoriteMetaDrafts(store.selectedPoi.id)
  metaEditing.value = true
}

function cancelEditMeta() {
  if (store.selectedPoi) loadFavoriteMetaDrafts(store.selectedPoi.id)
  metaEditing.value = false
}

function applyEditMeta() {
  saveFavoriteMeta()
  metaEditing.value = false
}

function onToggleFavorite() {
  if (!store.selectedPoi) return
  store.toggleFavorite(store.selectedPoi.id)
  metaEditing.value = false
  customNameDraft.value = ''
  noteDraft.value = ''
  // Keep sheet open so the user can re-star or leave intentionally.
}

const selectedEta = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return null
  return store.etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
})

const osmHours = computed(() => store.selectedPoi?.openingHours)
const hasOsm = computed(() => (store.selectedPoi ? hasOsmOpeningHours(store.selectedPoi) : false))

const etaOpenStatus = computed((): OpenStatus => {
  const poi = store.selectedPoi
  if (!poi) return 'unknown'
  return store.poiOpenStatusAtEta(poi)
})

const etaOpenLabel = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return t('detail.hoursMissing')
  if (isAlwaysAvailableWater(poi)) return t('detail.hoursAlways')
  if (!hasOsm.value) {
    if (isShopLikeWithoutHours(poi)) return t('detail.hoursShopUnknown')
    return t('detail.hoursMissing')
  }
  if (store.isNearbyMap) {
    if (etaOpenStatus.value === 'open') return t('detail.openNow')
    if (etaOpenStatus.value === 'closed') return t('detail.closedNow')
    return t('detail.hoursAtEtaUnknown')
  }
  if (!selectedEta.value?.arrival) return t('detail.hoursNoEta')
  if (etaOpenStatus.value === 'open') return t('detail.hoursAtEtaOpen')
  if (etaOpenStatus.value === 'closed') return t('detail.hoursAtEtaClosed')
  return t('detail.hoursAtEtaUnknown')
})

const showHoursUnknownHint = computed(() => {
  const poi = store.selectedPoi
  if (!poi || isAlwaysAvailableWater(poi)) return false
  if (!hasOsm.value) return true
  return etaOpenStatus.value === 'unknown'
})

const hoursStatusClass = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return 'unknown'
  if (isAlwaysAvailableWater(poi)) return 'open'
  // No OSM data → unknown (never style as closed)
  if (!hasOsm.value) return 'unknown'
  return etaOpenStatus.value
})

const osmPretty = computed(() =>
  prettifyOpeningHours(osmHours.value, locale.value.slice(0, 2))
)

const osmNextChange = computed(() => {
  const poi = store.selectedPoi
  if (!poi?.openingHours) return null
  const at = store.isNearbyMap ? new Date() : selectedEta.value?.arrival
  if (!at) return null
  const next = nextChangeLabel(poi.openingHours, at, poi.lat, poi.lng)
  return next ? t('detail.hoursNext', { time: next }) : null
})

async function loadOpeningHours() {
  const poi = store.selectedPoi
  if (!poi || !isGooglePlacesConfigured()) return

  hoursLoading.value = true
  hoursError.value = ''
  hoursResult.value = null

  try {
    const result = await fetchPlaceOpeningHours(poi)
    if (!result) {
      hoursError.value = t('detail.hoursNone')
      return
    }
    hoursResult.value = result
  } catch (err) {
    hoursError.value = err instanceof Error ? err.message : t('detail.hoursError')
  } finally {
    hoursLoading.value = false
  }
}

function onClose() {
  hoursResult.value = null
  hoursError.value = ''
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
  onClose()
}
</script>

<template>
  <div v-if="store.selectedPoi" class="sheet-backdrop" @click.self="onClose()">
    <div class="sheet" role="dialog" aria-modal="true">
      <header class="sheet-top">
        <h3>{{ store.selectedPoi.name }}</h3>
        <button type="button" class="close" :aria-label="t('detail.close')" @click="onClose()">
          ×
        </button>
      </header>

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

      <div v-if="isFavorite" class="fav-edit">
        <template v-if="!metaEditing">
          <div class="fav-view-row">
            <span class="fav-view-label">{{ t('detail.favCustomName') }}</span>
            <span class="fav-view-value" :class="{ muted: !customNameDraft }">
              {{ customNameDraft || store.selectedPoi.name }}
            </span>
          </div>
          <div class="fav-view-row">
            <span class="fav-view-label">{{ t('detail.favNote') }}</span>
            <span class="fav-view-value" :class="{ muted: !noteDraft }">
              {{ noteDraft || t('detail.favNoteEmpty') }}
            </span>
          </div>
          <button type="button" class="fav-edit-btn" @click="startEditMeta">
            {{ t('detail.favEdit') }}
          </button>
        </template>
        <template v-else>
          <label class="fav-field">
            <span>{{ t('detail.favCustomName') }}</span>
            <input
              v-model="customNameDraft"
              type="text"
              maxlength="40"
              :placeholder="store.selectedPoi.name"
            />
          </label>
          <label class="fav-field">
            <span>{{ t('detail.favNote') }}</span>
            <textarea
              v-model="noteDraft"
              rows="2"
              maxlength="80"
              :placeholder="t('detail.favNoteHint')"
            />
          </label>
          <div class="fav-edit-actions">
            <button type="button" class="fav-apply-btn" @click="applyEditMeta">
              {{ t('detail.favApply') }}
            </button>
            <button type="button" class="fav-cancel-btn" @click="cancelEditMeta">
              {{ t('common.cancel') }}
            </button>
          </div>
        </template>
      </div>

      <div class="hours-box osm-hours" :class="`status-${hoursStatusClass}`">
        <p class="open-now">
          <span class="hours-source">{{ t('detail.hoursOsm') }}</span>
          {{ etaOpenLabel }}
        </p>
        <p v-if="osmNextChange && hasOsm && etaOpenStatus !== 'unknown'" class="hours-next">{{ osmNextChange }}</p>
        <p v-if="osmPretty" class="hours-raw">{{ osmPretty }}</p>
        <p v-if="showHoursUnknownHint" class="hours-hint">{{ t('detail.hoursUnknownHint') }}</p>
      </div>

      <div class="actions" :class="{ 'nearby-nav': store.isNearbyMap }">
        <a
          class="nav-btn nav-btn-primary"
          :href="googleNavHref"
          target="_blank"
          rel="noopener noreferrer"
          @click="onNavigate"
        >
          {{ t('detail.navigate') }}
        </a>
        <button
          type="button"
          class="fav-btn"
          :class="{ active: isFavorite }"
          @click="onToggleFavorite"
        >
          {{ isFavorite ? t('detail.removeFavorite') : t('detail.addFavorite') }}
        </button>
        <button
          v-if="isGooglePlacesConfigured() && !hasOsm"
          type="button"
          class="hours-btn"
          :disabled="hoursLoading"
          @click="loadOpeningHours"
        >
          {{ hoursLoading ? t('detail.hoursLoading') : t('detail.hoursLoad') }}
        </button>
      </div>

      <p v-if="hoursError" class="hours-error">{{ hoursError }}</p>
      <div v-if="hoursResult" class="hours-box">
        <p v-if="hoursResult.openNow != null" class="open-now">
          {{ hoursResult.openNow ? t('detail.openNow') : t('detail.closedNow') }}
        </p>
        <ul v-if="hoursResult.weekdayText.length">
          <li v-for="line in hoursResult.weekdayText" :key="line">{{ line }}</li>
        </ul>
        <p v-else class="hours-muted">{{ t('detail.hoursEmpty') }}</p>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  background: var(--surface);
  width: 100%;
  max-width: 480px;
  max-height: min(92dvh, 92vh);
  display: flex;
  flex-direction: column;
  border-radius: 16px 16px 0 0;
  position: relative;
  overflow: hidden;
}

.sheet-top {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.85rem 1rem 0.65rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  z-index: 2;
}

.sheet-top h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
  padding-right: 0.25rem;
}

.close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -0.35rem -0.25rem 0 0;
  border: none;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text);
}

.sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0.75rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
}

.fav-edit {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin: 0 0 1rem;
  padding: 0.75rem;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
}

.fav-view-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.fav-view-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.fav-view-value {
  font-size: 0.9rem;
  color: var(--text);
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

.fav-view-value.muted {
  color: var(--text-muted);
  font-style: italic;
}

.fav-edit-btn,
.fav-apply-btn,
.fav-cancel-btn {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.fav-edit-btn {
  border-color: #f59e0b;
  color: #b45309;
  background: #fff;
}

.fav-edit-actions {
  display: flex;
  gap: 0.5rem;
}

.fav-apply-btn {
  flex: 1;
  border-color: #f59e0b;
  background: #f59e0b;
  color: #fff;
}

.fav-cancel-btn {
  flex: 1;
}

.fav-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.fav-field input,
.fav-field textarea {
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  resize: vertical;
}

dl {
  margin: 0 0 1rem;
}

dt {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

dd {
  margin: 0.15rem 0 0;
}

.eta-sub {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.9em;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.actions.nearby-nav {
  gap: 0.65rem;
}

.fav-btn,
.hours-btn,
.nav-btn {
  width: 100%;
  padding: 0.65rem;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  color: inherit;
  font: inherit;
}

.nav-btn-primary {
  order: -1;
  padding: 0.85rem 1rem;
  min-height: 48px;
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  font-size: 1.05rem;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 35%, transparent);
}

.actions.nearby-nav .nav-btn-primary {
  padding: 1rem 1.1rem;
  min-height: 52px;
  font-size: 1.1rem;
}

.fav-btn.active {
  background: #fffbeb;
  border-color: #f59e0b;
  color: #b45309;
  font-weight: 600;
}

.fav-hint {
  padding: 0.75rem;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
}

.fav-hint p {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: #1e40af;
  line-height: 1.35;
}

.print-btn {
  width: 100%;
  padding: 0.55rem;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #fff;
  color: #1d4ed8;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.hours-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.hours-error {
  margin: 0.75rem 0 0;
  color: #b42318;
  font-size: 0.85rem;
}

.hours-box {
  margin: 0 0 1rem;
  padding: 0.75rem;
  background: var(--surface-2);
  border-radius: 8px;
  font-size: 0.85rem;
  border: 1px solid var(--border);
}

.osm-hours.status-open {
  background: #ecfdf5;
  border-color: #6ee7b7;
}

.osm-hours.status-closed {
  background: #fef2f2;
  border-color: #fca5a5;
}

.osm-hours.status-unknown,
.osm-hours.status-missing {
  background: var(--surface-2);
  border-style: dashed;
  color: var(--text-muted);
}

.hours-box ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}

.open-now {
  margin: 0;
  font-weight: 600;
}

.hours-source {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: middle;
}

.hours-next,
.hours-raw,
.hours-hint {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.35;
  white-space: pre-wrap;
}

.hours-muted {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .print-hint-desktop {
    display: none;
  }

  .fav-hint:has(.print-hint-desktop) p {
    margin-bottom: 0;
  }
}
</style>
