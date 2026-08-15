<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { PoiCategory } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  MIN_POI_RADIUS_M,
  NEARBY_DEFAULT_POI_CATEGORIES,
  NEARBY_DEFAULT_POI_RADIUS_M,
  NEARBY_MAX_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { poiCategoryLabel } from '../utils/poiLabels'
import { isAppleMobile, isStandalonePwa } from '../utils/geoDevice'
import { nearbyGeoBlockedReason, nearbyGeoErrorI18nKey, NEARBY_GEO_OPTIONS } from '../utils/nearbyGeo'

const props = defineProps<{
  /** Embedded in MapView — stay on map, no Landing navigation. */
  inMap?: boolean
}>()

const emit = defineEmits<{
  done: []
}>()

const { t } = useI18n()
const store = useMapStore()
const router = useRouter()
const showIosGeoHint = isAppleMobile()
const iosGeoHintKey = isStandalonePwa() ? 'nearby.geoHintIosApp' : 'nearby.geoHintIos'

function initialRadius(): number {
  if (props.inMap && store.isNearbyMap && store.poiRadiusM > 0) {
    return Math.min(
      NEARBY_MAX_POI_RADIUS_M,
      Math.max(MIN_POI_RADIUS_M, store.poiRadiusM)
    )
  }
  return NEARBY_DEFAULT_POI_RADIUS_M
}

function initialCategories(): PoiCategory[] {
  if (props.inMap && store.activeCategories.length) {
    return [...store.activeCategories]
  }
  return [...NEARBY_DEFAULT_POI_CATEGORIES]
}

const radiusM = ref(initialRadius())
const selected = ref<PoiCategory[]>(initialCategories())
const formError = ref('')
const creating = ref(false)

const introKey = computed(() => {
  if (!props.inMap) return 'nearby.introMapFirst'
  return store.isNearbyMap ? 'nearby.introMap' : 'nearby.introMapRoute'
})

const searchLabelKey = computed(() => {
  if (!props.inMap) return 'nearby.openMap'
  return store.isNearbyMap ? 'nearby.searchRescan' : 'nearby.searchMapKeepRoute'
})

function toggleCategory(id: PoiCategory) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) {
    if (selected.value.length <= 1) {
      formError.value = t('gpx.minCategory')
      return
    }
    selected.value.splice(idx, 1)
  } else {
    selected.value.push(id)
  }
  formError.value = ''
}

function geoErrorMessage(code: number): string {
  if (code === 1) {
    if (isAppleMobile()) {
      return t(isStandalonePwa() ? 'nearby.geoDeniedApp' : 'nearby.geoDenied')
    }
    return t('nearby.geoDenied')
  }
  return t(nearbyGeoErrorI18nKey(code))
}

function keepRouteOnScan(): boolean {
  return Boolean(props.inMap && !store.isNearbyMap && store.routePoints.length >= 2)
}

function ensureGeoReady(): boolean {
  formError.value = ''
  store.error = ''

  const blocked = nearbyGeoBlockedReason()
  if (blocked === 'insecure') {
    formError.value = t('nearby.geoInsecure')
    return false
  }
  if (blocked === 'unsupported') {
    formError.value = t('nearby.geoUnsupported')
    return false
  }
  return true
}

/** Landing: GPS → map shell with marker → navigate → load POIs (map stays visible). */
function openMapFirst() {
  if (creating.value) return
  if (!ensureGeoReady()) return
  creating.value = true

  // Sync call inside click handler — required for iOS geolocation permission
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        store.prepareNearbyCenter(lat, lng, radiusM.value, [...selected.value])
        await router.push('/map/view')
        await store.refreshNearbyPois(radiusM.value, [...selected.value])
        if (store.error) formError.value = store.error
      } catch (err) {
        formError.value = err instanceof Error ? err.message : t('store.unknownError')
      } finally {
        creating.value = false
      }
    },
    (err) => {
      creating.value = false
      formError.value = geoErrorMessage(err.code)
    },
    NEARBY_GEO_OPTIONS
  )
}

/** In-map: rescan nearby or enrich route POIs (unchanged semantics). */
function searchNearby() {
  if (!ensureGeoReady()) return
  creating.value = true

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        if (keepRouteOnScan()) {
          await store.enrichPoisAroundGps(
            pos.coords.latitude,
            pos.coords.longitude,
            radiusM.value,
            [...selected.value]
          )
        } else if (store.isNearbyMap) {
          store.prepareNearbyCenter(
            pos.coords.latitude,
            pos.coords.longitude,
            radiusM.value,
            [...selected.value]
          )
          await store.refreshNearbyPois(radiusM.value, [...selected.value])
        } else {
          await store.createMapFromNearby(
            pos.coords.latitude,
            pos.coords.longitude,
            radiusM.value,
            [...selected.value]
          )
        }
        if (store.mapReady && !store.error) {
          emit('done')
        } else if (store.error) {
          formError.value = store.error
        }
      } catch (err) {
        formError.value = err instanceof Error ? err.message : t('store.unknownError')
      } finally {
        creating.value = false
      }
    },
    (err) => {
      creating.value = false
      formError.value = geoErrorMessage(err.code)
    },
    NEARBY_GEO_OPTIONS
  )
}

function onSubmit() {
  if (props.inMap) searchNearby()
  else openMapFirst()
}

defineExpose({ openMapFirst, searchNearby })
</script>

<template>
  <form class="nearby-form" :class="{ 'in-map': inMap, 'map-first': !inMap }" @submit.prevent="onSubmit">
    <p class="intro">{{ t(introKey) }}</p>
    <p v-if="!inMap" class="load-summary">
      {{ t('nearby.loadSummary', { m: radiusM, count: selected.length }) }}
    </p>
    <p v-if="showIosGeoHint" class="ios-geo-hint">{{ t(iosGeoHintKey) }}</p>

    <label class="field">
      <span class="field-label">{{ t('nearby.radius') }}</span>
      <div
        class="radius-row"
        @touchstart.stop
        @touchmove.stop
        @pointerdown.stop
      >
        <input
          v-model.number="radiusM"
          type="range"
          class="radius-slider"
          :min="MIN_POI_RADIUS_M"
          :max="NEARBY_MAX_POI_RADIUS_M"
          step="50"
          :aria-valuetext="`${radiusM} m`"
        />
        <span class="radius-value">{{ radiusM }}&nbsp;m</span>
      </div>
    </label>

    <fieldset class="categories">
      <legend>{{ t('gpx.categories') }}</legend>
      <div class="category-grid">
        <button
          v-for="cat in POI_CATEGORY_DEFS"
          :key="cat.id"
          type="button"
          class="cat-chip"
          :class="{ active: selected.includes(cat.id) }"
          @click="toggleCategory(cat.id)"
        >
          <span>{{ cat.icon }}</span>
          {{ poiCategoryLabel(cat.id) }}
        </button>
      </div>
    </fieldset>

    <p v-if="formError || store.error" class="error">{{ formError || store.error }}</p>

    <button type="submit" class="btn-primary" :disabled="creating">
      {{ creating ? t('nearby.searching') : t(searchLabelKey) }}
    </button>
  </form>
</template>

<style scoped>
.nearby-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.nearby-form.in-map {
  gap: 1.1rem;
}

.nearby-form.map-first {
  gap: 1rem;
}

.intro {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.45;
}

.in-map .intro {
  font-size: 0.95rem;
  line-height: 1.45;
  color: #111;
}

.in-map .ios-geo-hint {
  margin: 0;
  padding: 0.7rem 0.8rem;
  font-size: 0.92rem;
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  color: #111;
}

.in-map .field-label,
.in-map .categories legend {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #111;
  margin-bottom: 0.45rem;
}

.in-map .radius-slider,
.in-map .radius-row input[type='range'] {
  accent-color: #111;
}

.in-map .radius-slider::-webkit-slider-runnable-track,
.in-map .radius-row input[type='range']::-webkit-slider-runnable-track {
  height: 10px;
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
  box-sizing: border-box;
}

.in-map .radius-slider::-moz-range-track,
.in-map .radius-row input[type='range']::-moz-range-track {
  height: 10px;
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
}

.in-map .radius-slider::-webkit-slider-thumb,
.in-map .radius-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 36px;
  height: 36px;
  margin-top: -15px;
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
}

.in-map .radius-slider::-moz-range-thumb,
.in-map .radius-row input[type='range']::-moz-range-thumb {
  width: 36px;
  height: 36px;
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
}

.in-map .radius-value {
  flex-basis: 7.25rem;
  width: 7.25rem;
  font-size: 0.95rem;
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  color: #111;
  box-shadow: none;
  font-weight: 800;
}

.in-map .cat-chip {
  padding: 0.7rem 1rem;
  min-height: 48px;
  font-size: 1rem;
  gap: 0.4rem;
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  color: #111;
  font-weight: 700;
}

.in-map .cat-chip.active {
  background: var(--cta);
  color: #111;
  border-color: #111;
  font-weight: 800;
}

.in-map .btn-primary {
  margin-top: 0.15rem;
  padding: 0.85rem 1rem;
  font-size: 0.88rem;
  min-height: 48px;
  border: 3px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  box-shadow: 4px 4px 0 #111;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.in-map .btn-primary:disabled {
  opacity: 1;
  background: #e8e4dc;
  box-shadow: none;
}

@media (max-width: 768px) {
  .in-map .radius-slider::-webkit-slider-thumb,
  .in-map .radius-row input[type='range']::-webkit-slider-thumb {
    width: 52px;
    height: 52px;
    margin-top: -22px;
  }

  .in-map .radius-slider::-moz-range-thumb,
  .in-map .radius-row input[type='range']::-moz-range-thumb {
    width: 52px;
    height: 52px;
  }
}

.load-summary {
  margin: -0.35rem 0 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  min-height: 2.6em;
}

.ios-geo-hint {
  margin: -0.5rem 0 0;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1.4;
}

.field-label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.radius-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 56px;
  padding: 0.45rem 0.15rem 0.7rem;
  touch-action: none;
  /* Keep slider + value on one row so sheet width/height stay put while dragging */
  min-width: 0;
  box-sizing: border-box;
}

.radius-slider,
.radius-row input[type='range'] {
  flex: 1;
  min-width: 0;
  min-height: 56px;
  height: 56px;
  margin: 0;
  padding: 0;
  touch-action: none;
  accent-color: var(--cta);
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.radius-slider::-webkit-slider-runnable-track,
.radius-row input[type='range']::-webkit-slider-runnable-track {
  height: 10px;
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
  box-sizing: border-box;
}

.radius-slider::-moz-range-track,
.radius-row input[type='range']::-moz-range-track {
  height: 10px;
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
  box-sizing: border-box;
}

.radius-slider::-webkit-slider-thumb,
.radius-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 36px;
  height: 36px;
  margin-top: -15px;
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
  cursor: grab;
}

.radius-slider::-moz-range-thumb,
.radius-row input[type='range']::-moz-range-thumb {
  width: 36px;
  height: 36px;
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: none;
  cursor: grab;
}

/* Mobile: large thumb + reserved row height so nothing below jumps */
@media (max-width: 768px) {
  .radius-row {
    min-height: 68px;
    padding: 0.55rem 0.1rem 0.85rem;
  }

  .radius-slider,
  .radius-row input[type='range'] {
    min-height: 68px;
    height: 68px;
  }

  .radius-slider::-webkit-slider-runnable-track,
  .radius-row input[type='range']::-webkit-slider-runnable-track {
    height: 12px;
  }

  .radius-slider::-moz-range-track,
  .radius-row input[type='range']::-moz-range-track {
    height: 12px;
  }

  .radius-slider::-webkit-slider-thumb,
  .radius-row input[type='range']::-webkit-slider-thumb {
    width: 52px;
    height: 52px;
    margin-top: -22px;
    border-width: 3px;
    box-shadow: none;
  }

  .radius-slider::-moz-range-thumb,
  .radius-row input[type='range']::-moz-range-thumb {
    width: 52px;
    height: 52px;
    border-width: 3px;
    box-shadow: none;
  }
}

.radius-value {
  /* Fixed slot for "10000 m" — avoids reflow when digits change (3000 → 10000) */
  flex: 0 0 7.25rem;
  width: 7.25rem;
  box-sizing: border-box;
  padding: 0.45rem 0.4rem;
  min-height: 2.75rem;
  border-radius: 0;
  background: #fff;
  border: 2px solid #111;
  box-shadow: none;
  color: #111;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 0.95rem;
  line-height: 1.2;
}

.categories {
  border: none;
  padding: 0;
  margin: 0;
}

.categories legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  padding: 0;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.in-map .category-grid {
  gap: 0.45rem;
}

.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.9rem;
  -webkit-tap-highlight-color: transparent;
}

.cat-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

@media (min-width: 769px) {
  .cat-chip {
    padding: 0.4rem 0.75rem;
    min-height: 0;
    font-size: 0.85rem;
  }

  .in-map .cat-chip {
    padding: 0.35rem 0.65rem;
    min-height: 0;
    font-size: 0.78rem;
  }
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
  margin: 0;
}

.in-map .error {
  font-size: 0.82rem;
}

.btn-primary {
  padding: 0.85rem 1.5rem;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.map-first .btn-primary {
  padding: 1rem 1.5rem;
  font-size: 1.05rem;
  min-height: 52px;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
