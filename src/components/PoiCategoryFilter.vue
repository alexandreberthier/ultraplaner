<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PoiCategory } from '../../shared/types'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'
import { colorblindMode, poiColors } from '../config/mapStyle'
import { useMapStore } from '../stores/mapStore'
import { useSidebarSection } from '../composables/useSidebarSection'

import { poiCategoryLabel } from '../utils/poiLabels'

const props = defineProps<{
  embedded?: boolean
}>()

const store = useMapStore()
const { t } = useI18n()
const { open, toggle } = useSidebarSection('categories', true, props.embedded)

const loadedCategories = computed(() =>
  POI_CATEGORY_DEFS.filter((c) => (store.categoryCounts.get(c.id) ?? 0) > 0)
)

const categoryColors = computed(() => {
  void colorblindMode.value
  return poiColors()
})

const hiddenCount = computed(
  () => loadedCategories.value.filter((c) => !store.visibleCategories.includes(c.id)).length
)

const mapTotal = computed(() => store.displayPois.length)
const mapShown = computed(() => store.mapPois.length)

const summary = computed(() => {
  const n = loadedCategories.value.length
  if (!n) return ''
  if (hiddenCount.value === 0) return t('categories.allActive', { count: n })
  return t('categories.partialActive', { visible: n - hiddenCount.value, count: n })
})

function isVisible(id: PoiCategory) {
  return store.visibleCategories.includes(id)
}

function toggleCat(id: PoiCategory) {
  store.toggleCategoryVisibility(id)
}
</script>

<template>
  <div v-if="loadedCategories.length" class="category-filter" :class="{ open, embedded }" data-sidebar-section="categories">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('categories.title') }}</span>
      <span class="toggle-summary">{{ summary }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <p class="hint">{{ t('categories.hint') }}</p>
      <div class="map-poi-bar">
        <p class="map-poi-status">
          <template v-if="store.showAllPoisOnMap || mapTotal === mapShown">
            {{ t('categories.mapAll', { count: mapShown }) }}
          </template>
          <template v-else>
            {{ t('categories.mapPartial', { shown: mapShown, total: mapTotal }) }}
          </template>
        </p>
        <label v-if="mapTotal > mapShown || store.showAllPoisOnMap" class="map-poi-toggle">
          <input
            type="checkbox"
            :checked="store.showAllPoisOnMap"
            @change="store.setShowAllPoisOnMap(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('categories.mapShowAll') }}</span>
        </label>
        <p v-if="!store.showAllPoisOnMap && mapTotal > mapShown" class="map-poi-thin-hint">
          {{ t('categories.mapThinHint') }}
        </p>
      </div>
      <ul>
        <li v-for="cat in loadedCategories" :key="cat.id">
          <button
            type="button"
            class="cat-btn"
            :class="{ off: !isVisible(cat.id) }"
            :title="isVisible(cat.id) ? t('categories.hide', { label: poiCategoryLabel(cat.id) }) : t('categories.show', { label: poiCategoryLabel(cat.id) })"
            @click="toggleCat(cat.id)"
          >
            <span class="swatch" :style="{ background: categoryColors[cat.id] }" />
            <span class="icon">{{ cat.icon }}</span>
            <span class="label">{{ poiCategoryLabel(cat.id) }}</span>
            <span class="count">{{ store.categoryCounts.get(cat.id) }}</span>
            <span class="eye">{{ isVisible(cat.id) ? '👁' : '—' }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.category-filter {
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  min-height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text);
}

.section-toggle:hover {
  background: var(--surface-2);
}

.toggle-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  flex-shrink: 0;
}

.toggle-summary {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--text);
  font-size: 1.15rem;
  font-weight: 800;
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.section-body {
  padding: 0 1rem 0.75rem;
  max-height: 220px;
  overflow-y: auto;
}

.category-filter.embedded .section-body {
  max-height: none;
}

.embedded-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0.35rem;
}

.category-filter.embedded .section-body {
  padding-top: 0;
}

.hint {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.map-poi-bar {
  margin: 0 0 0.55rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.map-poi-status {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.35;
}

.map-poi-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.4rem 0 0;
  min-height: 44px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1.35;
}

.map-poi-toggle input {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0;
  flex-shrink: 0;
}

.map-poi-thin-hint {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.35;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.cat-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  font-size: 0.82rem;
  text-align: left;
  transition: opacity 0.15s, background 0.15s;
}

.cat-btn:hover {
  background: var(--surface-2);
}

.cat-btn.off {
  opacity: 0.45;
  background: var(--surface-2);
}

.swatch {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex-shrink: 0;
}

.icon {
  flex-shrink: 0;
  font-size: 1.05rem;
  line-height: 1;
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-size: 0.7rem;
  color: var(--text-muted);
  min-width: 1.2rem;
  text-align: right;
}

.eye {
  font-size: 0.85rem;
  width: 1.25rem;
  text-align: center;
  flex-shrink: 0;
}

@media (min-width: 769px) {
  .cat-btn {
    padding: 0.4rem 0.5rem;
    min-height: 0;
    font-size: 0.78rem;
  }

  .section-toggle {
    min-height: 0;
  }

  .map-poi-toggle {
    min-height: 0;
  }
}
</style>
