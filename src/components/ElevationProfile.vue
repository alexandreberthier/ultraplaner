<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import {
  buildElevationSamples,
  hasElevationData,
  pointAtRouteKm,
} from '../utils/route'

const store = useMapStore()
const plotRef = ref<HTMLElement | null>(null)
const hoverKm = ref<number | null>(null)
const plotSize = ref({ width: 800, height: 180 })

const padding = { left: 52, right: 20, top: 16, bottom: 32 }

const samples = computed(() => buildElevationSamples(store.routePoints, 600))
const hasData = computed(() => hasElevationData(store.routePoints))
const totalKm = computed(() => store.totalKm)

const stats = computed(() => {
  const pts = samples.value
  if (!pts.length) return null

  let min = pts[0]!
  let max = pts[0]!
  let ascent = 0
  let descent = 0

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (p.elevation < min.elevation) min = p
    if (p.elevation > max.elevation) max = p
    if (i > 0) {
      const diff = p.elevation - pts[i - 1]!.elevation
      if (diff > 0) ascent += diff
      else descent -= diff
    }
  }

  return { min, max, ascent, descent }
})

const bounds = computed(() => {
  if (!samples.value.length) {
    return { minElev: 0, maxElev: 100, minKm: 0, maxKm: totalKm.value || 1 }
  }

  const elevations = samples.value.map((s) => s.elevation)
  const rawMin = Math.min(...elevations)
  const rawMax = Math.max(...elevations)
  const range = Math.max(rawMax - rawMin, 20)
  const pad = range * 0.12

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
  const t = maxKm > minKm ? (km - minKm) / (maxKm - minKm) : 0
  return padding.left + t * innerW.value
}

function yForElev(elev: number) {
  const { minElev, maxElev } = bounds.value
  const t = maxElev > minElev ? (elev - minElev) / (maxElev - minElev) : 0
  return padding.top + innerH.value - t * innerH.value
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
  const range = maxElev - minElev
  let step = 50
  if (range <= 80) step = 20
  else if (range <= 200) step = 25
  else if (range <= 400) step = 50
  else step = 100

  const ticks: number[] = []
  const start = Math.ceil(minElev / step) * step
  for (let v = start; v <= maxElev; v += step) ticks.push(v)
  if (!ticks.length) ticks.push(minElev, maxElev)
  return ticks
})

const xTicks = computed(() => {
  const max = bounds.value.maxKm
  let step = 5
  if (max > 200) step = 50
  else if (max > 100) step = 20
  else if (max > 40) step = 10
  else if (max > 15) step = 5
  else step = 2

  const ticks: number[] = [0]
  for (let km = step; km < max; km += step) ticks.push(km)
  if (ticks.at(-1) !== max) ticks.push(Math.round(max))
  return ticks
})

const hoverPoint = computed(() => {
  if (hoverKm.value == null) return null
  return pointAtRouteKm(store.routePoints, hoverKm.value)
})

const hoverLabel = computed(() => {
  if (!hoverPoint.value) return null
  const km = hoverPoint.value.distanceFromStart ?? hoverKm.value ?? 0
  const elev = hoverPoint.value.elevation
  return {
    km: km.toFixed(1),
    elev: elev != null ? `${Math.round(elev)} m` : '–',
  }
})

const plotClip = computed(
  () =>
    `M ${padding.left} ${padding.top} ` +
    `L ${chartWidth.value - padding.right} ${padding.top} ` +
    `L ${chartWidth.value - padding.right} ${chartHeight.value - padding.bottom} ` +
    `L ${padding.left} ${chartHeight.value - padding.bottom} Z`
)

function updateCursor(km: number) {
  hoverKm.value = km
  const pt = pointAtRouteKm(store.routePoints, km)
  if (!pt) {
    store.routeCursor = null
    return
  }
  store.routeCursor = {
    km: pt.distanceFromStart ?? km,
    lat: pt.lat,
    lng: pt.lng,
    elevation: pt.elevation,
  }
}

function onPointerMove(e: PointerEvent) {
  if (!plotRef.value || !hasData.value) return
  const rect = plotRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const ratio = (x - padding.left) / innerW.value
  const km =
    bounds.value.minKm +
    Math.max(0, Math.min(1, ratio)) * (bounds.value.maxKm - bounds.value.minKm)
  updateCursor(km)
}

function onPointerLeave() {
  hoverKm.value = null
  store.routeCursor = null
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!plotRef.value) return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const { width, height } = entry.contentRect
    plotSize.value = {
      width: Math.max(Math.round(width), 320),
      height: Math.max(Math.round(height), 140),
    }
  })
  resizeObserver.observe(plotRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  store.routeCursor = null
})
</script>

<template>
  <div v-if="store.routePoints.length >= 2" class="elevation-profile">
    <template v-if="hasData && stats">
      <header class="profile-header">
        <div class="header-left">
          <h2 class="title">Höhenprofil</h2>
          <p class="subtitle">
            {{ totalKm.toFixed(1) }} km ·
            ↑ {{ Math.round(stats.ascent) }} m ·
            ↓ {{ Math.round(stats.descent) }} m
          </p>
        </div>
        <div class="header-stats">
          <div class="stat">
            <span class="stat-label">Min</span>
            <span class="stat-value">{{ Math.round(stats.min.elevation) }} m</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max</span>
            <span class="stat-value accent">{{ Math.round(stats.max.elevation) }} m</span>
          </div>
          <div v-if="hoverLabel" class="hover-chip">
            km {{ hoverLabel.km }} · {{ hoverLabel.elev }}
          </div>
        </div>
      </header>

      <div
        ref="plotRef"
        class="plot-area"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      >
        <svg
          class="chart"
          :width="chartWidth"
          :height="chartHeight"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
        >
          <defs>
            <linearGradient id="elev-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#374151" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#374151" stop-opacity="0.03" />
            </linearGradient>
            <clipPath id="elev-clip">
              <path :d="plotClip" />
            </clipPath>
          </defs>

          <rect
            :x="padding.left"
            :y="padding.top"
            :width="innerW"
            :height="innerH"
            class="plot-frame"
            rx="4"
          />

          <g class="grid">
            <line
              v-for="tick in yTicks"
              :key="`y-${tick}`"
              :x1="padding.left"
              :y1="yForElev(tick)"
              :x2="chartWidth - padding.right"
              :y2="yForElev(tick)"
            />
            <line
              v-for="tick in xTicks"
              :key="`x-${tick}`"
              :x1="xForKm(tick)"
              :y1="padding.top"
              :x2="xForKm(tick)"
              :y2="chartHeight - padding.bottom"
              class="faint"
            />
          </g>

          <g clip-path="url(#elev-clip)">
            <path :d="areaPath" class="area" />
            <path :d="linePath" class="line" />
          </g>

          <g class="axis-labels">
            <text
              v-for="tick in yTicks"
              :key="`yl-${tick}`"
              :x="padding.left - 8"
              :y="yForElev(tick) + 4"
              text-anchor="end"
            >
              {{ tick }}
            </text>
            <text :x="padding.left - 8" :y="padding.top - 4" text-anchor="end" class="unit">
              m
            </text>
          </g>

          <g class="axis-labels x-labels">
            <text
              v-for="tick in xTicks"
              :key="`xl-${tick}`"
              :x="xForKm(tick)"
              :y="chartHeight - 10"
              text-anchor="middle"
            >
              {{ tick }}
            </text>
            <text
              :x="chartWidth - padding.right"
              :y="chartHeight - 10"
              text-anchor="end"
              class="unit"
            >
              km
            </text>
          </g>

          <g v-if="hoverKm != null" class="cursor">
            <line
              :x1="xForKm(hoverKm)"
              :y1="padding.top"
              :x2="xForKm(hoverKm)"
              :y2="chartHeight - padding.bottom"
              class="cursor-line"
            />
            <circle
              v-if="hoverPoint?.elevation != null"
              :cx="xForKm(hoverKm)"
              :cy="yForElev(hoverPoint.elevation)"
              r="7"
              class="cursor-ring"
            />
            <circle
              v-if="hoverPoint?.elevation != null"
              :cx="xForKm(hoverKm)"
              :cy="yForElev(hoverPoint.elevation)"
              r="4"
              class="cursor-dot"
            />
          </g>
        </svg>
      </div>
    </template>

    <p v-else class="no-data">Keine Höhendaten in der GPX-Datei</p>
  </div>
</template>

<style scoped>
.elevation-profile {
  flex-shrink: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
}

.profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 1rem 0.35rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.header-left {
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--text);
  font-weight: 500;
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  padding: 0.25rem 0.6rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 56px;
}

.stat-label {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.stat-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.stat-value.accent {
  color: var(--primary);
}

.hover-chip {
  font-size: 0.78rem;
  font-weight: 700;
  color: #111;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  white-space: nowrap;
}

.plot-area {
  height: clamp(150px, 22vh, 220px);
  padding: 0.35rem 0.75rem 0.5rem;
  cursor: crosshair;
  touch-action: none;
}

.chart {
  display: block;
  width: 100%;
  height: 100%;
}

.plot-frame {
  fill: color-mix(in srgb, var(--surface-2) 80%, transparent);
  stroke: var(--border);
  stroke-width: 1;
}

.grid line {
  stroke: var(--border);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.grid line.faint {
  opacity: 0.5;
}

.area {
  fill: url(#elev-gradient);
}

.line {
  fill: none;
  stroke: #111;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.axis-labels text {
  fill: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
}

.axis-labels text.unit {
  font-size: 10px;
  font-weight: 600;
}

.cursor-line {
  stroke: #111;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  opacity: 0.85;
}

.cursor-ring {
  fill: rgba(17, 17, 17, 0.12);
  stroke: #111;
  stroke-width: 2;
}

.cursor-dot {
  fill: #111;
  stroke: #fff;
  stroke-width: 2;
}

.no-data {
  margin: 0;
  padding: 1.25rem 1rem;
  font-size: 0.88rem;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .profile-header {
    flex-direction: column;
    gap: 0.5rem;
  }

  .header-stats {
    width: 100%;
    justify-content: flex-start;
  }

  .plot-area {
    height: clamp(130px, 20vh, 180px);
    padding-inline: 0.5rem;
  }
}
</style>
