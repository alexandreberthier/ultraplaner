<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteCursor, RoutePoint, RouteSurfaceBucketId, RouteSurfaceSummary } from '../../shared/types'
import {
  buildElevationSamples,
  hasElevationData,
  pointAtRouteKm,
  routeElevationGainLoss,
} from '../utils/route'
import { formatElevM, formatKmInt } from '../services/geo'
import {
  SURFACE_COLORS,
  SURFACE_I18N_KEYS,
  surfaceBarShares,
} from '../utils/surface'

const props = defineProps<{
  points: RoutePoint[]
  surfaceSummary?: RouteSurfaceSummary | null
}>()

const emit = defineEmits<{
  'update:cursor': [cursor: RouteCursor | null]
}>()

const { t, locale } = useI18n()
const plotRef = ref<HTMLElement | null>(null)
const plotSize = ref({ width: 640, height: 160 })
const profileOpen = defineModel<boolean>('open', { default: true })
const hoverKm = ref<number | null>(null)
const scrubbing = ref(false)
const PLANNER_ELEV_OPEN_KEY = 'up-planner-elev-open'

const padding = { left: 40, right: 12, top: 10, bottom: 22 }
const MIN_TICK_PX = 48

const samples = computed(() => buildElevationSamples(props.points, 400))
const hasData = computed(() => hasElevationData(props.points))
const totalKm = computed(() => props.points.at(-1)?.distanceFromStart ?? 0)
const surfaceBuckets = computed(() => props.surfaceSummary?.buckets ?? [])
const hasSurface = computed(() => surfaceBuckets.value.length > 0)
const surfaceBar = computed(() => surfaceBarShares(props.surfaceSummary))

const stats = computed(() => {
  const pts = samples.value
  if (!pts.length) return null
  let min = pts[0]!
  let max = pts[0]!
  for (const p of pts) {
    if (p.elevation < min.elevation) min = p
    if (p.elevation > max.elevation) max = p
  }
  const { ascentM, descentM } = routeElevationGainLoss(props.points)
  return { min, max, ascent: ascentM, descent: descentM }
})

const bounds = computed(() => {
  if (!samples.value.length) {
    return { minElev: 0, maxElev: 100, minKm: 0, maxKm: totalKm.value || 1 }
  }
  const elevations = samples.value.map((s) => s.elevation)
  const rawMin = Math.min(...elevations)
  const rawMax = Math.max(...elevations)
  const range = Math.max(rawMax - rawMin, 20)
  const pad = range * 0.06
  return {
    minElev: Math.floor((rawMin - pad) / 10) * 10,
    maxElev: Math.ceil((rawMax + pad) / 10) * 10,
    minKm: 0,
    maxKm: totalKm.value || samples.value.at(-1)!.km,
  }
})

const chartWidth = computed(() => plotSize.value.width)
const chartHeight = computed(() => plotSize.value.height)
const innerW = computed(() => chartWidth.value - padding.left - padding.right)
const innerH = computed(() => chartHeight.value - padding.top - padding.bottom)

function xForKm(km: number) {
  const { minKm, maxKm } = bounds.value
  const span = Math.max(maxKm - minKm, 0.001)
  return padding.left + ((km - minKm) / span) * innerW.value
}

function yForElev(elev: number) {
  const { minElev, maxElev } = bounds.value
  const span = Math.max(maxElev - minElev, 1)
  return padding.top + ((maxElev - elev) / span) * innerH.value
}

const areaPath = computed(() => {
  if (!samples.value.length) return ''
  const baseY = yForElev(bounds.value.minElev)
  const line = samples.value
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xForKm(s.km)} ${yForElev(s.elevation)}`)
    .join(' ')
  const last = samples.value.at(-1)!
  const first = samples.value[0]!
  return `${line} L ${xForKm(last.km)} ${baseY} L ${xForKm(first.km)} ${baseY} Z`
})

const linePath = computed(() => {
  if (!samples.value.length) return ''
  return samples.value
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xForKm(s.km)} ${yForElev(s.elevation)}`)
    .join(' ')
})

const yTicks = computed(() => {
  const { minElev, maxElev } = bounds.value
  const range = Math.max(maxElev - minElev, 1)
  let step = 100
  if (range <= 80) step = 20
  else if (range <= 150) step = 25
  else if (range <= 300) step = 50
  else if (range <= 600) step = 100
  else if (range <= 1200) step = 200
  else step = 250
  const ticks: number[] = []
  const start = Math.ceil(minElev / step) * step
  for (let v = start; v <= maxElev + 0.001; v += step) ticks.push(Math.round(v))
  if (!ticks.length) ticks.push(Math.round(minElev), Math.round(maxElev))
  return ticks
})

const xTicks = computed(() => {
  const max = bounds.value.maxKm
  if (max <= 0) return [0]
  const width = Math.max(innerW.value, 80)
  const maxTicks = Math.max(2, Math.floor(width / MIN_TICK_PX))
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200]
  let step = niceSteps[niceSteps.length - 1]!
  for (const s of niceSteps) {
    if (max / s <= maxTicks - 1) {
      step = s
      break
    }
  }
  const ticks: number[] = [0]
  for (let km = step; km < max - 1e-6; km += step) {
    ticks.push(Math.round(km * 10) / 10)
  }
  const last = ticks.at(-1)!
  const end = Math.round(max * 10) / 10
  if (end > last) {
    const pxGap = ((end - last) / max) * width
    if (pxGap >= MIN_TICK_PX * 0.55) ticks.push(end)
    else ticks[ticks.length - 1] = end
  }
  return ticks
})

const hoverSample = computed(() => {
  if (hoverKm.value == null || !samples.value.length) return null
  const km = hoverKm.value
  let best = samples.value[0]!
  let bestD = Math.abs(best.km - km)
  for (const s of samples.value) {
    const d = Math.abs(s.km - km)
    if (d < bestD) {
      best = s
      bestD = d
    }
  }
  return best
})

function surfaceLabel(id: RouteSurfaceBucketId) {
  return t(SURFACE_I18N_KEYS[id])
}

function toggleProfile() {
  profileOpen.value = !profileOpen.value
}

function clearCursor() {
  hoverKm.value = null
  emit('update:cursor', null)
}

function updateCursor(km: number) {
  hoverKm.value = km
  const pt = pointAtRouteKm(props.points, km)
  if (!pt) {
    emit('update:cursor', null)
    return
  }
  emit('update:cursor', {
    km: pt.distanceFromStart ?? km,
    lat: pt.lat,
    lng: pt.lng,
    elevation: pt.elevation,
  })
}

function kmFromEvent(e: PointerEvent) {
  const el = plotRef.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const { minKm, maxKm } = bounds.value
  const tNorm = Math.min(1, Math.max(0, (x - padding.left) / Math.max(innerW.value, 1)))
  return minKm + tNorm * (maxKm - minKm)
}

function onPointerDown(e: PointerEvent) {
  if (!plotRef.value || !hasData.value || e.button !== 0) return
  scrubbing.value = true
  plotRef.value.setPointerCapture(e.pointerId)
  updateCursor(kmFromEvent(e))
}

function onPointerMove(e: PointerEvent) {
  if (!plotRef.value || !hasData.value) return
  updateCursor(kmFromEvent(e))
}

function onPointerUp(e: PointerEvent) {
  if (!scrubbing.value) return
  scrubbing.value = false
  plotRef.value?.releasePointerCapture(e.pointerId)
}

function onPointerLeave() {
  if (!scrubbing.value) clearCursor()
}

let resizeObserver: ResizeObserver | null = null

function bindPlotObserver() {
  resizeObserver?.disconnect()
  if (!plotRef.value) return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const { width, height } = entry.contentRect
    plotSize.value = {
      width: Math.max(Math.round(width), 240),
      height: Math.max(Math.round(height), 90),
    }
  })
  resizeObserver.observe(plotRef.value)
}

onMounted(async () => {
  await nextTick()
  if (profileOpen.value) bindPlotObserver()
})

watch(profileOpen, async (open) => {
  try {
    localStorage.setItem(PLANNER_ELEV_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (!open) {
    clearCursor()
    return
  }
  await nextTick()
  bindPlotObserver()
})

watch(
  () => props.points,
  () => clearCursor()
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  emit('update:cursor', null)
})
</script>

<template>
  <div
    v-if="points.length >= 2"
    class="planner-elev"
    :class="{ collapsed: !profileOpen }"
  >
    <template v-if="hasData && stats">
      <button
        type="button"
        class="profile-toggle"
        :aria-expanded="profileOpen"
        :aria-label="profileOpen ? t('elevation.collapse') : t('elevation.expand')"
        @click="toggleProfile"
      >
        <div class="toggle-main">
          <span class="title">{{ t('elevation.title') }}</span>
          <span class="subtitle">
            {{ formatKmInt(totalKm, locale) }}
            · ↑{{ formatElevM(stats.ascent, locale) }}
            · ↓{{ formatElevM(stats.descent, locale) }}
          </span>
        </div>
        <span class="chevron-wrap" aria-hidden="true">
          <span class="chevron">{{ profileOpen ? '▾' : '▴' }}</span>
        </span>
      </button>

      <div v-show="profileOpen" class="profile-body">
        <div v-if="hasSurface" class="surface-summary">
          <div class="surface-row">
            <span class="surface-title">{{ t('elevation.surfaceTitle') }}</span>
            <div class="surface-stack" role="img" :aria-label="t('elevation.surfaceTitle')">
              <span
                v-for="(b, i) in surfaceBar"
                :key="`${b.id}-${i}`"
                class="surface-seg"
                :style="{ width: `${b.percent}%`, background: SURFACE_COLORS[b.id] }"
                :title="`${surfaceLabel(b.id)} ${b.percent}%`"
              />
            </div>
          </div>
          <ul class="surface-list">
            <li v-for="b in surfaceBuckets" :key="`l-${b.id}`" class="surface-item">
              <span class="surface-swatch" :style="{ background: SURFACE_COLORS[b.id] }" />
              <span class="surface-name">{{ surfaceLabel(b.id) }}</span>
              <strong class="surface-pct">{{ b.percent }}%</strong>
            </li>
          </ul>
        </div>

        <div
          ref="plotRef"
          class="plot"
          :class="{ scrubbing }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerLeave"
        >
          <svg
            :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="t('elevation.title')"
          >
            <defs>
              <clipPath id="planner-elev-clip">
                <rect
                  :x="padding.left"
                  :y="padding.top"
                  :width="innerW"
                  :height="innerH"
                />
              </clipPath>
            </defs>
            <g class="grid" aria-hidden="true">
              <line
                v-for="tick in yTicks"
                :key="`y-${tick}`"
                :x1="padding.left"
                :y1="yForElev(tick)"
                :x2="chartWidth - padding.right"
                :y2="yForElev(tick)"
                class="faint"
              />
            </g>
            <g clip-path="url(#planner-elev-clip)">
              <path :d="areaPath" class="area" />
              <path :d="linePath" class="line" />
            </g>
            <g class="axis-labels">
              <text
                v-for="tick in yTicks"
                :key="`yl-${tick}`"
                :x="padding.left - 6"
                :y="yForElev(tick) + 3"
                text-anchor="end"
              >
                {{ tick }}
              </text>
            </g>
            <g class="axis-labels x-labels">
              <text
                v-for="(tick, i) in xTicks"
                :key="`xl-${tick}`"
                :x="xForKm(tick)"
                :y="chartHeight - 6"
                :text-anchor="i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'"
              >
                {{ tick }}{{ i === 0 ? ` ${t('elevation.km')}` : '' }}
              </text>
            </g>
            <g v-if="hoverSample" class="cursor" aria-hidden="true">
              <line
                :x1="xForKm(hoverSample.km)"
                :y1="padding.top"
                :x2="xForKm(hoverSample.km)"
                :y2="chartHeight - padding.bottom"
                class="cursor-line"
              />
              <circle
                :cx="xForKm(hoverSample.km)"
                :cy="yForElev(hoverSample.elevation)"
                r="4"
                class="cursor-dot"
              />
            </g>
          </svg>
          <p v-if="hoverSample" class="hover-chip" aria-live="polite">
            {{ hoverSample.km.toFixed(1) }} km · {{ formatElevM(hoverSample.elevation, locale) }}
          </p>
        </div>
      </div>
    </template>
    <p v-else class="no-data">{{ t('elevation.noData') }}</p>
  </div>
</template>

<style scoped>
.planner-elev {
  flex-shrink: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.05);
  z-index: 2;
}

.profile-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.85rem;
  min-height: 44px;
  border: none;
  border-bottom: 1px solid transparent;
  background: var(--surface-2);
  cursor: pointer;
  text-align: left;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
}

.planner-elev:not(.collapsed) .profile-toggle {
  border-bottom-color: var(--border);
}

.toggle-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.subtitle {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron-wrap {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.chevron {
  font-size: 1.05rem;
  font-weight: 700;
}

.profile-body {
  padding: 0.35rem 0 0.45rem;
}

.surface-summary {
  padding: 0 0.85rem 0.25rem;
}

.surface-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.surface-title {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
}

.surface-stack {
  flex: 1;
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--border);
}

.surface-seg {
  display: block;
  height: 100%;
  min-width: 2px;
}

.surface-list {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.55rem;
}

.surface-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.surface-swatch {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  flex-shrink: 0;
  align-self: center;
}

.surface-name {
  font-weight: 600;
}

.surface-pct {
  font-weight: 800;
  color: var(--text);
}

.plot {
  position: relative;
  height: 110px;
  margin: 0 0.35rem;
  touch-action: none;
  cursor: crosshair;
}

.plot.scrubbing {
  cursor: grabbing;
}

.plot svg {
  width: 100%;
  height: 100%;
  display: block;
}

.faint {
  stroke: var(--border);
  stroke-width: 1;
}

.area {
  fill: color-mix(in srgb, var(--primary) 18%, transparent);
}

.line {
  fill: none;
  stroke: var(--primary);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.axis-labels text {
  fill: var(--text-muted);
  font-size: 10px;
}

.cursor-line {
  stroke: var(--text);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.55;
}

.cursor-dot {
  fill: var(--primary);
  stroke: #fff;
  stroke-width: 1.5;
}

.hover-chip {
  position: absolute;
  top: 4px;
  right: 8px;
  margin: 0;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.88);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  pointer-events: none;
}

.no-data {
  margin: 0;
  padding: 0.55rem 0.85rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

@media (max-width: 899px) {
  .plot {
    height: 168px;
  }

  .profile-toggle {
    min-height: 52px;
    padding: 0.75rem 0.9rem;
  }

  .title {
    font-size: 0.75rem;
  }

  .subtitle {
    font-size: 0.9rem;
  }

  .chevron-wrap {
    width: 2.5rem;
    height: 2.5rem;
  }

  .surface-list {
    display: none;
  }
}
</style>
