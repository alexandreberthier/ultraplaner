<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { PoiCategory } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_POI_CATEGORIES,
  MIN_POI_RADIUS_M,
  NEARBY_DEFAULT_POI_RADIUS_M,
  NEARBY_MAX_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'
import { poiCategoryLabel } from '../utils/poiLabels'
import { isAppleMobile, isStandalonePwa } from '../utils/geoDevice'

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
  return [...DEFAULT_POI_CATEGORIES]
}

const radiusM = ref(initialRadius())
const selected = ref<PoiCategory[]>(initialCategories())
const formError = ref('')
const creating = ref(false)

const introKey = computed(() => {
  if (!props.inMap) return 'nearby.intro'
  return store.isNearbyMap ? 'nearby.introMap' : 'nearby.introMapRoute'
})

const searchLabelKey = computed(() => {
  if (!props.inMap) return 'nearby.search'
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
  if (code === 2) return t('nearby.geoUnavailable')
  if (code === 3) return t('nearby.geoTimeout')
  return t('nearby.geoFailed')
}

function keepRouteOnScan(): boolean {
  return Boolean(props.inMap && !store.isNearbyMap && store.routePoints.length >= 2)
}

function searchNearby() {
  formError.value = ''
  store.error = ''

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    formError.value = t('nearby.geoInsecure')
    return
  }
  if (!navigator.geolocation) {
    formError.value = t('nearby.geoUnsupported')
    return
  }

  creating.value = true

  // Sync call inside click handler — required for iOS geolocation permission
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
        } else {
          await store.createMapFromNearby(
            pos.coords.latitude,
            pos.coords.longitude,
            radiusM.value,
            [...selected.value]
          )
        }
        if (store.mapReady && !store.error) {
          if (props.inMap) {
            emit('done')
          } else {
            await router.push('/map/view')
          }
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
    {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 20_000,
    }
  )
}
</script>

<template>
  <form class="nearby-form" :class="{ 'in-map': inMap }" @submit.prevent="searchNearby">
    <p class="intro">{{ t(introKey) }}</p>
    <p v-if="showIosGeoHint" class="ios-geo-hint">{{ t(iosGeoHintKey) }}</p>

    <label class="field">
      <span class="field-label">{{ t('nearby.radius') }}</span>
      <div class="radius-row">
        <input
          v-model.number="radiusM"
          type="range"
          :min="MIN_POI_RADIUS_M"
          :max="NEARBY_MAX_POI_RADIUS_M"
          step="50"
        />
        <span>{{ radiusM }} m</span>
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
  gap: 0.85rem;
}

.intro {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.45;
}

.in-map .intro {
  font-size: 0.8rem;
  line-height: 1.35;
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

.in-map .ios-geo-hint {
  margin: 0;
  padding: 0.5rem 0.6rem;
  font-size: 0.75rem;
}

.field-label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.in-map .field-label {
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}

.radius-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.radius-row input[type='range'] {
  flex: 1;
}

.categories {
  border: none;
  padding: 0;
}

.categories legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.in-map .categories legend {
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.in-map .category-grid {
  gap: 0.35rem;
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

.in-map .cat-chip {
  padding: 0.5rem 0.75rem;
  min-height: 44px;
  font-size: 0.82rem;
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
    padding: 0.3rem 0.55rem;
    min-height: 0;
    font-size: 0.75rem;
  }
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
}

.in-map .error {
  font-size: 0.8rem;
}

.btn-primary {
  padding: 0.85rem 1.5rem;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.in-map .btn-primary {
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
