<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
  MIN_AVG_SPEED_KMH,
  formatDuration,
  hoursForDistanceKm,
} from '../utils/eta'

const store = useMapStore()

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
</script>

<template>
  <section class="eta-planner" aria-label="Zeitplanung">
    <header class="eta-head">
      <h3>Zeitplanung</h3>
      <p class="eta-summary">
        {{ totalDuration }}
        <template v-if="finishEta.clockLabel"> · Ziel {{ finishEta.clockLabel }}</template>
      </p>
    </header>

    <div class="eta-fields">
      <label class="field">
        <span class="field-label">Schnitt</span>
        <div class="speed-row">
          <input
            :value="store.avgSpeedKmh"
            type="range"
            :min="MIN_AVG_SPEED_KMH"
            :max="MAX_AVG_SPEED_KMH"
            step="1"
            @input="store.setAvgSpeedKmh(Number(($event.target as HTMLInputElement).value))"
          />
          <input
            class="speed-num"
            type="number"
            :min="MIN_AVG_SPEED_KMH"
            :max="MAX_AVG_SPEED_KMH"
            step="1"
            :value="store.avgSpeedKmh"
            @change="store.setAvgSpeedKmh(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="unit">km/h</span>
        </div>
      </label>

      <div class="field">
        <span class="field-label">Start (24h)</span>
        <div class="time-row" lang="de">
          <select
            class="time-select"
            :value="startHour"
            aria-label="Stunde"
            @change="setStartHour(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
          </select>
          <span class="time-sep">:</span>
          <select
            class="time-select"
            :value="startMinute"
            aria-label="Minute"
            @change="setStartMinute(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="m in MINUTES" :key="m" :value="m">{{ m }}</option>
          </select>
          <span class="unit">Uhr</span>
        </div>
      </div>
    </div>

    <p class="eta-hint">
      ETA an POIs &amp; im Höhenprofil · Standard {{ DEFAULT_AVG_SPEED_KMH }} km/h
    </p>
  </section>
</template>

<style scoped>
.eta-planner {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex-shrink: 0;
}

.eta-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
}

.eta-head h3 {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.eta-summary {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.eta-fields {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.65rem 0.75rem;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.speed-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.speed-row input[type='range'] {
  flex: 1;
  min-width: 0;
}

.speed-num {
  width: 3.2rem;
  padding: 0.3rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 600;
}

.unit {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.time-select {
  padding: 0.35rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.time-sep {
  font-weight: 700;
  color: var(--text);
  padding: 0 0.1rem;
}

.eta-hint {
  margin: 0.45rem 0 0;
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.35;
}

@media (max-width: 768px) {
  .eta-fields {
    grid-template-columns: 1fr;
  }
}
</style>
