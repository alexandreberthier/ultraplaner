<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useSidebarSection } from '../composables/useSidebarSection'
import {
  DEFAULT_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
  MIN_AVG_SPEED_KMH,
  formatDuration,
  hoursForDistanceKm,
} from '../utils/eta'

const props = defineProps<{
  /** Mobile sheet layout (still collapsible). */
  embedded?: boolean
}>()

const store = useMapStore()
const { t } = useI18n()
const { open, toggle } = useSidebarSection('eta', false, props.embedded)

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const totalDuration = computed(() =>
  formatDuration(hoursForDistanceKm(store.totalKm, store.avgSpeedKmh))
)

const finishEta = computed(() => store.etaAtRouteKm(store.totalKm))

const startHour = computed(() => {
  const [h] = store.startTimeHHmm.split(':')
  return (h ?? '06').padStart(2, '0')
})

const startMinute = computed(() => {
  const m = Number(store.startTimeHHmm.split(':')[1] ?? 0)
  const snapped = Math.round(m / 5) * 5
  return String(snapped === 60 ? 55 : snapped).padStart(2, '0')
})

function setStartHour(h: string) {
  store.setStartTimeHHmm(`${h}:${startMinute.value}`)
}

function setStartMinute(m: string) {
  store.setStartTimeHHmm(`${startHour.value}:${m}`)
}

function nudgeHour(delta: number) {
  const next = (Number(startHour.value) + delta + 24) % 24
  setStartHour(String(next).padStart(2, '0'))
}

function nudgeMinute(delta: number) {
  const idx = MINUTES.indexOf(startMinute.value)
  const base = idx >= 0 ? idx : 0
  const next = (base + delta + MINUTES.length) % MINUTES.length
  setStartMinute(MINUTES[next]!)
}
</script>

<template>
  <section class="eta-planner" :class="{ open, embedded }" data-sidebar-section="eta" :aria-label="t('eta.title')">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('eta.title') }}</span>
      <span class="toggle-summary">
        {{ totalDuration }}
        <template v-if="finishEta.clockLabel"> · {{ t('eta.goal') }} {{ finishEta.clockLabel }}</template>
      </span>
      <span class="chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <div class="eta-fields">
        <label class="field speed-field">
          <span class="field-label">{{ t('eta.speed') }}</span>
          <div class="speed-row radius-row">
            <input
              class="radius-slider"
              :value="store.avgSpeedKmh"
              type="range"
              :min="MIN_AVG_SPEED_KMH"
              :max="MAX_AVG_SPEED_KMH"
              step="1"
              :aria-valuetext="`${store.avgSpeedKmh} km/h`"
              @input="store.setAvgSpeedKmh(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="radius-value speed-value">
              <input
                class="speed-num"
                type="number"
                inputmode="numeric"
                :min="MIN_AVG_SPEED_KMH"
                :max="MAX_AVG_SPEED_KMH"
                step="1"
                :value="store.avgSpeedKmh"
                @change="store.setAvgSpeedKmh(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="unit">km/h</span>
            </span>
          </div>
        </label>

        <div class="field time-field">
          <span class="field-label">{{ t('eta.start') }}</span>
          <div class="time-row" lang="de">
            <div class="time-group">
              <button
                type="button"
                class="time-step"
                :aria-label="`${t('eta.hour')} −`"
                @click="nudgeHour(-1)"
              >
                −
              </button>
              <select
                class="time-select"
                :value="startHour"
                :aria-label="t('eta.hour')"
                @change="setStartHour(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
              </select>
              <button
                type="button"
                class="time-step"
                :aria-label="`${t('eta.hour')} +`"
                @click="nudgeHour(1)"
              >
                +
              </button>
            </div>
            <span class="time-sep" aria-hidden="true">:</span>
            <div class="time-group">
              <button
                type="button"
                class="time-step"
                :aria-label="`${t('eta.minute')} −`"
                @click="nudgeMinute(-1)"
              >
                −
              </button>
              <select
                class="time-select"
                :value="startMinute"
                :aria-label="t('eta.minute')"
                @change="setStartMinute(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="m in MINUTES" :key="m" :value="m">{{ m }}</option>
              </select>
              <button
                type="button"
                class="time-step"
                :aria-label="`${t('eta.minute')} +`"
                @click="nudgeMinute(1)"
              >
                +
              </button>
            </div>
            <span class="unit time-unit">{{ t('eta.oclock') || 'Uhr' }}</span>
          </div>
        </div>
      </div>

      <div class="eta-filter-block">
        <label class="filter-toggle">
          <input
            type="checkbox"
            :checked="store.hideClosedAtEta"
            @change="store.setHideClosedAtEta(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('eta.filterOpenOnly') }}</span>
        </label>
        <p v-if="store.hideClosedAtEta" class="filter-meta">
          <template v-if="store.closedAtEtaHiddenCount > 0">
            {{ t('eta.filterHidden', { count: store.closedAtEtaHiddenCount }) }}
          </template>
          <template v-else>{{ t('eta.filterHiddenNone') }}</template>
        </p>
        <label v-if="store.hideClosedAtEta" class="field buffer-field">
          <span class="field-label">{{ t('eta.buffer') }}</span>
          <select
            class="buffer-select"
            :value="store.etaHoursBufferMinutes"
            :aria-label="t('eta.buffer')"
            @change="store.setEtaHoursBufferMinutes(Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="0">{{ t('eta.bufferNone') }}</option>
            <option :value="15">{{ t('eta.bufferMin', { min: 15 }) }}</option>
            <option :value="30">{{ t('eta.bufferMin', { min: 30 }) }}</option>
          </select>
        </label>
        <p v-if="store.hideClosedAtEta" class="eta-filter-hint">{{ t('eta.filterHint') }}</p>
      </div>

      <p class="eta-hint">
        {{ t('eta.hint', { speed: DEFAULT_AVG_SPEED_KMH }) }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.eta-planner {
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex-shrink: 0;
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
  background: color-mix(in srgb, var(--surface) 55%, transparent);
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
  text-align: center;
}

.section-body {
  padding: 0 1rem 0.75rem;
}

.embedded-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0.35rem;
}

.eta-planner.embedded .section-body {
  padding-top: 0;
}

.eta-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
  align-items: stretch;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 800;
  color: #111;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.speed-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.speed-value {
  flex: 0 0 auto;
  width: auto;
  min-width: 6.5rem;
  gap: 0.25rem;
  padding: 0.2rem 0.45rem;
}

.speed-num {
  width: 2.75rem;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  font-size: 1rem;
  font-weight: 800;
  color: #111;
  text-align: center;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}

.speed-num::-webkit-outer-spin-button,
.speed-num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit {
  font-size: 0.78rem;
  color: #111;
  font-weight: 800;
  opacity: 0.7;
}

.time-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.time-group {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--border);
  background: #fff;
  box-shadow: var(--shadow);
}

.time-step {
  width: 2.75rem;
  min-height: 52px;
  border: none;
  border-radius: var(--radius);
  background: #f3efe6;
  color: #111;
  font: inherit;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .time-step:hover {
    background: var(--cta);
    color: var(--cta-text);
  }
}

.time-step:active {
  background: var(--cta-hover);
  color: var(--cta-text);
}

.time-select {
  min-width: 3.6rem;
  min-height: 52px;
  padding: 0.35rem 0.2rem;
  border: none;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  color: #111;
  font-size: 1.25rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.time-sep {
  font-weight: 800;
  font-size: 1.35rem;
  color: #111;
  padding: 0 0.05rem;
}

.time-unit {
  margin-left: 0.15rem;
}

.eta-hint {
  margin: 0.45rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.eta-filter-block {
  margin-top: 0.65rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border);
}

.filter-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1.35;
  color: #111;
}

.filter-toggle input {
  margin-top: 0.1rem;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--cta);
}

.filter-meta {
  margin: 0.35rem 0 0 1.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent);
}

.buffer-field {
  margin: 0.5rem 0 0 1.35rem;
}

.buffer-select {
  padding: 0.55rem 0.65rem;
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow);
}

.eta-filter-hint {
  margin: 0.35rem 0 0 1.35rem;
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.35;
}

@media (max-width: 768px) {
  .time-step {
    width: 3rem;
    min-height: 56px;
    font-size: 1.5rem;
  }

  .time-select {
    min-width: 4rem;
    min-height: 56px;
    font-size: 1.4rem;
  }

  .speed-num {
    font-size: 1.1rem;
    width: 3rem;
  }
}
</style>
