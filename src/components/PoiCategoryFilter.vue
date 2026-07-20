<script setup lang="ts">
import { computed } from 'vue'
import type { PoiCategory } from '../../shared/types'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'
import { POI_COLORS } from '../config/mapStyle'
import { useMapStore } from '../stores/mapStore'

const store = useMapStore()

const loadedCategories = computed(() =>
  POI_CATEGORY_DEFS.filter((c) => (store.categoryCounts.get(c.id) ?? 0) > 0)
)

function isVisible(id: PoiCategory) {
  return store.visibleCategories.includes(id)
}

function toggle(id: PoiCategory) {
  store.toggleCategoryVisibility(id)
}
</script>

<template>
  <div v-if="loadedCategories.length" class="category-filter">
    <h3>Kategorien</h3>
    <p class="hint">Antippen zum Ein- und Ausblenden auf der Karte</p>
    <ul>
      <li v-for="cat in loadedCategories" :key="cat.id">
        <button
          type="button"
          class="cat-btn"
          :class="{ off: !isVisible(cat.id) }"
          :title="isVisible(cat.id) ? `${cat.label} ausblenden` : `${cat.label} einblenden`"
          @click="toggle(cat.id)"
        >
          <span class="swatch" :style="{ background: POI_COLORS[cat.id] }" />
          <span class="icon">{{ cat.icon }}</span>
          <span class="label">{{ cat.label }}</span>
          <span class="count">{{ store.categoryCounts.get(cat.id) }}</span>
          <span class="eye">{{ isVisible(cat.id) ? '👁' : '—' }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.category-filter {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

h3 {
  margin: 0 0 0.15rem;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.hint {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.3;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.cat-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  font-size: 0.78rem;
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
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.icon {
  flex-shrink: 0;
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
  font-size: 0.75rem;
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}
</style>
