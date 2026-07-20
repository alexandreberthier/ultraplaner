<script setup lang="ts">
import { computed, ref } from 'vue'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'
import { GRADE_LEGEND, POI_COLORS } from '../config/mapStyle'
import { useMapStore } from '../stores/mapStore'
import { hasElevationData } from '../utils/route'

const props = defineProps<{
  /** Collapsible (desktop sidebar). Ignored when embedded. */
  compact?: boolean
  /** Mobile sheet: no title, always open. */
  embedded?: boolean
}>()

const store = useMapStore()
const expanded = ref(false)

const showList = () => props.embedded || !props.compact || expanded.value
const showGrades = computed(() => hasElevationData(store.routePoints))
</script>

<template>
  <div class="legend" :class="{ compact, expanded, embedded }">
    <button
      v-if="compact && !embedded"
      type="button"
      class="legend-toggle"
      @click="expanded = !expanded"
    >
      <span>Legende</span>
      <span class="chevron">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <h3 v-else-if="!embedded">Legende</h3>

    <div v-show="showList()" class="legend-body">
      <ul>
        <li v-for="cat in POI_CATEGORY_DEFS" :key="cat.id">
          <span class="swatch" :style="{ background: POI_COLORS[cat.id] }" />
          <span class="icon">{{ cat.icon }}</span>
          <span class="label">{{ cat.label }}</span>
        </li>
        <li class="km-hint">
          <span class="swatch km-swatch" />
          <span class="label">km-Markierung alle 25 km</span>
        </li>
      </ul>

      <div v-if="showGrades" class="grade-block">
        <p class="grade-title">Steigung (Route)</p>
        <div class="grade-row">
          <span
            v-for="g in GRADE_LEGEND"
            :key="g.label"
            class="grade-chip"
            :title="g.label"
          >
            <span class="grade-bar" :style="{ background: g.color }" />
            <span class="grade-label">{{ g.label }}</span>
          </span>
        </div>
        <p class="climb-hint">
          <span class="swatch climb-swatch" />
          Anstieg ≥ 70 m (Markierung am Gipfel)
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legend {
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
}

.legend.embedded {
  border-top: none;
  padding: 0 1rem 1rem;
}

.legend h3 {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.legend-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}

.chevron {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.legend.compact .legend-body {
  margin-top: 0.6rem;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem 0.75rem;
}

.legend.embedded ul {
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  line-height: 1.3;
}

.legend.embedded li {
  font-size: 0.9rem;
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.icon {
  flex-shrink: 0;
  font-size: 0.9rem;
}

.label {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-hint {
  grid-column: 1 / -1;
  margin-top: 0.25rem;
  padding-top: 0.35rem;
  border-top: 1px dashed var(--border);
}

.km-swatch {
  background: #fff;
  border: 2px solid #374151;
}

.grade-block {
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px dashed var(--border);
}

.grade-title {
  margin: 0 0 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.grade-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
}

.grade-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.72rem;
  color: var(--text);
}

.grade-bar {
  width: 14px;
  height: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}

.climb-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  color: var(--text);
  line-height: 1.3;
}

.climb-swatch {
  background: #7c2d12;
  border-color: #fff;
  box-shadow: 0 0 0 1px #7c2d12;
}

@media (max-width: 768px) {
  .legend:not(.embedded) {
    border-top: none;
    padding: 0 1rem 1rem;
  }

  ul {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  li {
    font-size: 0.9rem;
  }
}
</style>
