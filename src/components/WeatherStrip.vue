<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { fetchRouteWeather, type RouteWeather, type WeatherSample } from '../services/weather'
import { useOnline } from '../composables/useOnline'
import { useSidebarSection } from '../composables/useSidebarSection'

const props = defineProps<{
  embedded?: boolean
}>()

const store = useMapStore()
const { isOnline } = useOnline()
const { t } = useI18n()
const { open, toggle } = useSidebarSection('weather', false, props.embedded)

const weather = ref<RouteWeather | null>(null)
const loading = ref(false)
const error = ref('')

let debounce: ReturnType<typeof setTimeout> | null = null

function rainLevel(pct: number | null): 'none' | 'low' | 'mid' | 'high' {
  if (pct == null) return 'none'
  if (pct >= 60) return 'high'
  if (pct >= 35) return 'mid'
  if (pct >= 15) return 'low'
  return 'none'
}

const maxRain = computed(() => {
  const samples = weather.value?.samples ?? []
  let max = 0
  for (const s of samples) {
    if (s.precipProb != null && s.precipProb > max) max = s.precipProb
  }
  return max
})

const summary = computed(() => {
  if (loading.value) return t('weather.loading')
  if (error.value && !weather.value) return t('weather.unavailable')
  const samples = weather.value?.samples
  if (!samples?.length) return '—'
  const temps = samples.map((s) => s.tempC).filter((v): v is number => v != null)
  const tempPart = temps.length
    ? (() => {
        const min = Math.min(...temps)
        const max = Math.max(...temps)
        return min === max ? `${min}°` : `${min}–${max}°`
      })()
    : t('weather.points', { count: samples.length })
  const rain = maxRain.value
  if (rain >= 35) return `${tempPart} · ${t('weather.rainShort', { pct: rain })}`
  return tempPart
})

function chipClass(s: WeatherSample) {
  return `rain-${rainLevel(s.precipProb)}`
}

async function load() {
  if (!store.mapReady || store.routeCoords.length < 2) {
    weather.value = null
    return
  }

  loading.value = true
  error.value = ''
  try {
    const result = await fetchRouteWeather({
      mapId: store.savedMapId,
      routeCoords: store.routeCoords,
      routePoints: store.routePoints,
      favoritePois: store.favoritePois,
      startTimeHHmm: store.startTimeHHmm,
      avgSpeedKmh: store.avgSpeedKmh,
    })
    weather.value = result
    if (!result && !isOnline.value) {
      error.value = t('weather.offlineError')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('weather.failed')
  } finally {
    loading.value = false
  }
}

function scheduleLoad() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    void load()
  }, 400)
}

watch(
  () =>
    [
      store.mapReady,
      store.savedMapId,
      store.startTimeHHmm,
      store.avgSpeedKmh,
      store.routeCoords.length,
      store.favorites.size,
    ] as const,
  scheduleLoad,
  { immediate: true }
)
</script>

<template>
  <section v-if="store.mapReady" class="weather-strip" :class="{ open, embedded }" :aria-label="t('weather.title')">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('weather.title') }}</span>
      <span class="toggle-summary" :class="{ 'has-rain': maxRain >= 35 }">{{ summary }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <p v-if="error && !weather" class="weather-error">{{ error }}</p>

      <div v-else-if="weather?.samples.length" class="weather-row">
        <div
          v-for="(s, i) in weather.samples"
          :key="`${s.label}-${i}`"
          class="weather-chip"
          :class="chipClass(s)"
        >
          <strong>{{ s.title }}</strong>
          <span class="weather-temp">{{ s.tempC != null ? `${s.tempC}°` : '—' }}</span>
          <span
            v-if="s.precipProb != null"
            class="weather-rain"
            :class="chipClass(s)"
          >
            {{ t('weather.rain', { pct: s.precipProb }) }}
          </span>
          <span v-if="s.windKmh != null" class="weather-detail">{{ s.windKmh }} km/h</span>
          <span v-if="s.atHour" class="weather-time">{{ t('weather.approx', { time: s.atHour }) }}</span>
        </div>
      </div>

      <p v-else-if="!loading" class="weather-empty">{{ t('weather.empty') }}</p>
    </div>
  </section>
</template>

<style scoped>
.weather-strip {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
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

.toggle-summary.has-rain {
  color: #1d4ed8;
}

.chevron {
  color: var(--text-muted);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.section-body {
  padding: 0 1rem 0.75rem;
}

.weather-strip.embedded .section-body {
  padding-top: 0;
}

.weather-row {
  display: flex;
  gap: 0.45rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
  -webkit-overflow-scrolling: touch;
}

.weather-chip {
  flex: 0 0 auto;
  min-width: 5.5rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.weather-chip.rain-low {
  border-color: #93c5fd;
  background: #eff6ff;
}

.weather-chip.rain-mid {
  border-color: #60a5fa;
  background: #dbeafe;
}

.weather-chip.rain-high {
  border-color: #2563eb;
  background: #bfdbfe;
}

.weather-chip strong {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 600;
}

.weather-temp {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.weather-rain {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.25;
  color: #1e40af;
}

.weather-rain.rain-high {
  font-size: 0.85rem;
  color: #1e3a8a;
}

.weather-detail,
.weather-time {
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.25;
}

.weather-error,
.weather-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}
</style>
