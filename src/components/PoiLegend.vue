<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { climbMarkerColor, gradeLegend } from '../config/mapStyle'
import { useColorblindMode } from '../composables/useColorblindMode'
import { useSidebarSection } from '../composables/useSidebarSection'
import { useMapStore } from '../stores/mapStore'
import { hasElevationData } from '../utils/route'

const props = defineProps<{
  /** Collapsible (desktop sidebar). Ignored when embedded. */
  compact?: boolean
  /** Mobile sheet: no title, always open. */
  embedded?: boolean
}>()

const store = useMapStore()
const { colorblindMode, setColorblindMode } = useColorblindMode()
const { open, toggle } = useSidebarSection('legend', false)
const { t } = useI18n()

const showBody = computed(() => props.embedded || !props.compact || open.value)
const showGrades = computed(() => hasElevationData(store.routePoints))
const legendGrades = computed(() => {
  const colors = gradeLegend()
  const labels = [
    t('legend.downhill'),
    t('legend.gradeLt2'),
    t('legend.grade2to5'),
    t('legend.grade5to8'),
    t('legend.grade8to12'),
    t('legend.gradeGt12'),
  ]
  return colors.map((g, i) => ({ label: labels[i] ?? g.label, color: g.color }))
})

const summary = computed(() => {
  if (colorblindMode.value) return t('legend.colorblindOn')
  if (showGrades.value) return t('legend.gradeColors')
  return t('legend.colors')
})
const climbColor = computed(() => climbMarkerColor())
</script>

<template>
  <div class="legend" :class="{ compact, open, embedded }">
    <button
      v-if="compact && !embedded"
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('legend.title') }}</span>
      <span class="toggle-summary">{{ summary }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>
    <h3 v-else-if="!embedded">{{ t('legend.title') }}</h3>

    <div v-show="showBody" class="legend-body">
      <div v-if="showGrades" class="grade-block">
        <p class="grade-title">{{ t('legend.gradeTitle') }}</p>
        <div class="grade-row">
          <span
            v-for="g in legendGrades"
            :key="g.label"
            class="grade-chip"
            :title="g.label"
          >
            <span class="grade-bar" :style="{ background: g.color }" />
            <span class="grade-label">{{ g.label }}</span>
          </span>
        </div>
        <p class="climb-hint">
          <span
            class="swatch climb-swatch"
            :style="{ background: climbColor, boxShadow: `0 0 0 1px ${climbColor}` }"
          />
          {{ t('legend.climb') }}
        </p>
        <p class="km-hint">
          <span class="swatch km-swatch" />
          {{ t('legend.kmMarkers') }}
        </p>
      </div>

      <label class="colorblind-toggle">
        <input
          type="checkbox"
          :checked="colorblindMode"
          @change="setColorblindMode(($event.target as HTMLInputElement).checked)"
        />
        <span class="colorblind-copy">
          <strong>{{ t('legend.colorblind') }}</strong>
          <span>{{ t('legend.colorblindHint') }}</span>
        </span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.legend {
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
}

.legend:not(.compact):not(.embedded) {
  padding: 0.75rem 1rem 1rem;
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

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
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
  color: var(--text-muted);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.legend-body {
  padding: 0 1rem 0.85rem;
}

.legend:not(.compact):not(.embedded) .legend-body,
.legend.embedded .legend-body {
  padding: 0;
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.grade-block {
  margin: 0;
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

.climb-hint,
.km-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  color: var(--text);
  line-height: 1.3;
}

.climb-swatch {
  border-color: #fff;
}

.km-swatch {
  background: #fff;
  border: 2px solid #374151;
}

.colorblind-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  font-size: 0.78rem;
  line-height: 1.35;
}

.colorblind-toggle input {
  margin-top: 0.15rem;
  flex-shrink: 0;
  accent-color: var(--primary);
}

.colorblind-copy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  color: var(--text);
}

.colorblind-copy strong {
  font-size: 0.8rem;
}

.colorblind-copy span:last-child {
  color: var(--text-muted);
  font-size: 0.72rem;
}

@media (max-width: 768px) {
  .legend:not(.embedded) {
    border-top: none;
    padding: 0 1rem 1rem;
  }
}
</style>
