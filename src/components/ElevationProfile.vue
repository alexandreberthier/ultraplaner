<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import {
  analyzeElevationSegment,
  buildElevationSamples,
  hasElevationData,
  pointAtRouteKm,
  routeElevationGainLoss,
} from '../utils/route'
import { formatDuration, hoursForDistanceKm } from '../utils/eta'
import { formatElevM, formatKmInt } from '../services/geo'
import { gradeToColor, colorblindMode } from '../config/mapStyle'
import type { RouteSurfaceBucketId } from '../../shared/types'
import {
  SURFACE_COLORS,
  SURFACE_I18N_KEYS,
  surfaceBarShares,
} from '../utils/surface'

const ELEV_OPEN_KEY = 'onroute-elevation-open-v2'
const MIN_TICK_PX = 48

const store = useMapStore()
const { t, locale } = useI18n()
const plotRef = ref<HTMLElement | null>(null)
const hoverKm = ref<number | null>(null)
const plotSize = ref({ width: 800, height: 180 })
const profileOpen = ref(true)

const selectAnchorKm = ref<number | null>(null)
const selectEndKm = ref<number | null>(null)
const isSelecting = ref(false)

const padding = { left: 44, right: 16, top: 16, bottom: 28 }

const samples = computed(() => buildElevationSamples(store.routePoints, 600))
const hasData = computed(() => hasElevationData(store.routePoints))
const totalKm = computed(() => store.totalKm)
const surfaceBuckets = computed(() => store.surfaceSummary?.buckets ?? [])
const hasSurface = computed(() => surfaceBuckets.value.length > 0)
const surfaceBar = computed(() => surfaceBarShares(store.surfaceSummary))

function surfaceLabel(id: RouteSurfaceBucketId) {
  return t(SURFACE_I18N_KEYS[id])
}

const stats = computed(() => {
  const pts = samples.value
  if (!pts.length) return null

  let min = pts[0]!
  let max = pts[0]!
  for (const p of pts) {
    if (p.elevation < min.elevation) min = p
    if (p.elevation > max.elevation) max = p
  }

  // Gain from full route (smoothed + noise threshold), not chart downsamples
  const { ascentM, descentM } = routeElevationGainLoss(store.routePoints)
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
  const t = maxKm > minKm ? (km - minKm) / (maxKm - minKm) : 0
  return padding.left + t * innerW.value
}

function yForElev(elev: number) {
  const { minElev, maxElev } = bounds.value
  const t = maxElev > minElev ? (elev - minElev) / (maxElev - minElev) : 0
  return padding.top + innerH.value - t * innerH.value
}

function kmFromClientX(clientX: number): number {
  if (!plotRef.value) return 0
  const rect = plotRef.value.getBoundingClientRect()
  const x = clientX - rect.left
  const ratio = (x - padding.left) / innerW.value
  return (
    bounds.value.minKm +
    Math.max(0, Math.min(1, ratio)) * (bounds.value.maxKm - bounds.value.minKm)
  )
}

const selectionRange = computed(() => {
  if (selectAnchorKm.value == null || selectEndKm.value == null) return null
  const lo = Math.min(selectAnchorKm.value, selectEndKm.value)
  const hi = Math.max(selectAnchorKm.value, selectEndKm.value)
  if (hi - lo < 0.15) return null
  return { lo, hi }
})

/** Gaps ≥ this distance (km) without a visible supply POI. */
const SUPPLY_GAP_KM = 25

const supplyGaps = computed(() => {
  const total = totalKm.value
  if (total < SUPPLY_GAP_KM) return [] as { startKm: number; endKm: number }[]

  const kms = store.displayPois
    .map((p) => p.distanceAlongRouteKm ?? 0)
    .filter((k) => Number.isFinite(k) && k >= 0 && k <= total + 0.5)
    .sort((a, b) => a - b)

  const gaps: { startKm: number; endKm: number }[] = []
  let prev = 0
  for (const k of kms) {
    if (k - prev >= SUPPLY_GAP_KM) gaps.push({ startKm: prev, endKm: k })
    if (k > prev) prev = k
  }
  if (total - prev >= SUPPLY_GAP_KM) gaps.push({ startKm: prev, endKm: total })
  return gaps
})

const supplyGapSummary = computed(() => {
  const gaps = supplyGaps.value
  if (!gaps.length) {
    if (totalKm.value < SUPPLY_GAP_KM) return null
    return { count: 0, longestKm: 0, fromKm: 0, toKm: 0 }
  }
  let longest = gaps[0]!
  let longestKm = longest.endKm - longest.startKm
  for (const g of gaps) {
    const len = g.endKm - g.startKm
    if (len > longestKm) {
      longest = g
      longestKm = len
    }
  }
  return {
    count: gaps.length,
    longestKm,
    fromKm: longest.startKm,
    toKm: longest.endKm,
  }
})

const segmentStats = computed(() => {
  if (!selectionRange.value) return null
  const s = analyzeElevationSegment(
    store.routePoints,
    selectionRange.value.lo,
    selectionRange.value.hi
  )
  if (!s) return null
  const duration = formatDuration(
    hoursForDistanceKm(s.lengthKm, store.avgSpeedKmh)
  )
  return { ...s, duration }
})

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
    if (pxGap >= MIN_TICK_PX * 0.7) {
      ticks.push(end)
    }
  }
  return ticks
})

const hoverPoint = computed(() => {
  if (hoverKm.value == null || isSelecting.value) return null
  return pointAtRouteKm(store.routePoints, hoverKm.value)
})

const hoverLabel = computed(() => {
  if (!hoverPoint.value) return null
  void colorblindMode.value
  const km = hoverPoint.value.distanceFromStart ?? hoverKm.value ?? 0
  const elev = hoverPoint.value.elevation
  const eta = store.etaAtRouteKm(km)
  const grade = hoverPoint.value.gradient
  return {
    km: km.toFixed(1),
    elev: elev != null ? formatElevM(elev, locale.value) : '–',
    grade:
      grade != null
        ? `${grade >= 0 ? '+' : ''}${grade.toFixed(1)}%`
        : null,
    gradeColor: grade != null ? gradeToColor(grade) : undefined,
    eta: eta.clockLabel ? eta.clockLabel : eta.durationLabel,
    etaIsClock: !!eta.clockLabel,
  }
})

const segmentGradeColor = computed(() => {
  if (!segmentStats.value) return undefined
  void colorblindMode.value
  return gradeToColor(segmentStats.value.avgGradePct)
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

function clearSelection() {
  selectAnchorKm.value = null
  selectEndKm.value = null
  isSelecting.value = false
}

function onPointerDown(e: PointerEvent) {
  if (!plotRef.value || !hasData.value || e.button !== 0) return
  isSelecting.value = true
  plotRef.value.setPointerCapture(e.pointerId)
  const km = kmFromClientX(e.clientX)
  selectAnchorKm.value = km
  selectEndKm.value = km
  hoverKm.value = null
  store.routeCursor = null
}

function onPointerMove(e: PointerEvent) {
  if (!plotRef.value || !hasData.value) return

  if (isSelecting.value) {
    selectEndKm.value = kmFromClientX(e.clientX)
    return
  }

  const km = kmFromClientX(e.clientX)
  updateCursor(km)
}

function onPointerUp(e: PointerEvent) {
  if (!isSelecting.value) return
  isSelecting.value = false
  plotRef.value?.releasePointerCapture(e.pointerId)
  if (!selectionRange.value) {
    clearSelection()
  }
}

function onPointerLeave() {
  if (!isSelecting.value) {
    hoverKm.value = null
    store.routeCursor = null
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearSelection()
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

function loadProfileOpen(): boolean {
  try {
    const v = localStorage.getItem(ELEV_OPEN_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  // Desktop open by default; mobile collapsed for more map space
  return !isMobileViewport()
}

function toggleProfile() {
  profileOpen.value = !profileOpen.value
  try {
    localStorage.setItem(ELEV_OPEN_KEY, profileOpen.value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function bindPlotObserver() {
  if (!plotRef.value || !resizeObserver) return
  resizeObserver.observe(plotRef.value)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  profileOpen.value = loadProfileOpen()
  window.addEventListener('keydown', onKeyDown)
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const { width, height } = entry.contentRect
    plotSize.value = {
      width: Math.max(Math.round(width), 280),
      height: Math.max(Math.round(height), 100),
    }
  })
  if (profileOpen.value) bindPlotObserver()
})

watch(profileOpen, async (open) => {
  if (!open) {
    hoverKm.value = null
    store.routeCursor = null
    clearSelection()
    return
  }
  await nextTick()
  bindPlotObserver()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  resizeObserver?.disconnect()
  store.routeCursor = null
})
</script>

<template>
  <div
    v-if="store.routePoints.length >= 2"
    class="elevation-profile"
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
            {{ formatKmInt(totalKm, locale) }} · ↑{{ formatElevM(stats.ascent, locale) }}
          </span>
        </div>
        <span class="chevron-wrap" aria-hidden="true">
          <span class="chevron">{{ profileOpen ? '▾' : '▴' }}</span>
        </span>
      </button>

      <div v-show="profileOpen" class="profile-body">
        <header class="profile-header">
          <div class="header-left">
            <p class="select-hint">{{ t('elevation.selectHint') }}</p>
            <p
              v-if="supplyGapSummary"
              class="gap-summary"
              :class="supplyGapSummary.count > 0 ? 'gap-summary--warn' : 'gap-summary--ok'"
            >
              <template v-if="supplyGapSummary.count > 0">
                {{
                  t('elevation.supplySummary', {
                    count: supplyGapSummary.count,
                    threshold: SUPPLY_GAP_KM,
                    longest: Math.round(supplyGapSummary.longestKm),
                    from: supplyGapSummary.fromKm.toFixed(0),
                    to: supplyGapSummary.toKm.toFixed(0),
                  })
                }}
              </template>
              <template v-else>
                {{ t('elevation.supplySummaryNone', { threshold: SUPPLY_GAP_KM }) }}
              </template>
            </p>
          </div>
          <div class="header-stats" aria-live="polite">
            <template v-if="segmentStats">
              <div class="live-chip live-chip--segment">
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.range') }}</span>
                  <strong>km {{ segmentStats.startKm.toFixed(1) }}–{{ segmentStats.endKm.toFixed(1) }}</strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.length') }}</span>
                  <strong>{{ segmentStats.lengthKm.toFixed(1) }} km</strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.ascent') }}</span>
                  <strong>{{ formatElevM(segmentStats.ascentM, locale) }}</strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.grade') }}</span>
                  <strong class="live-grade" :style="{ color: segmentGradeColor }">
                    {{ segmentStats.avgGradePct >= 0 ? '+' : '' }}{{ segmentStats.avgGradePct.toFixed(1) }}%
                  </strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ t('eta.time') }}</span>
                  <strong>~{{ segmentStats.duration }}</strong>
                </span>
                <button type="button" class="live-clear" :aria-label="t('common.cancel')" @click="clearSelection">
                  ×
                </button>
              </div>
            </template>
            <div v-else class="live-chip live-chip--hover" :class="{ 'is-empty': !hoverLabel }">
              <template v-if="hoverLabel">
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.km') }}</span>
                  <strong>{{ hoverLabel.km }}</strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ t('elevation.height') }}</span>
                  <strong>{{ hoverLabel.elev }}</strong>
                </span>
                <span v-if="hoverLabel.grade" class="live-cell">
                  <span class="live-kicker">{{ t('elevation.grade') }}</span>
                  <strong class="live-grade" :style="{ color: hoverLabel.gradeColor }">
                    {{ hoverLabel.grade }}
                  </strong>
                </span>
                <span class="live-cell">
                  <span class="live-kicker">{{ hoverLabel.etaIsClock ? 'ETA' : t('eta.time') }}</span>
                  <strong>{{ hoverLabel.eta }}</strong>
                </span>
              </template>
              <span v-else class="live-placeholder">{{ t('elevation.hoverHint') }}</span>
            </div>
          </div>
        </header>

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
          class="plot-area"
          :class="{ selecting: isSelecting }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
          @pointercancel="onPointerUp"
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
              <filter id="cursor-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#2d6a4f" flood-opacity="0.55" />
              </filter>
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

            <g v-if="supplyGaps.length" class="supply-gaps" aria-hidden="true">
              <rect
                v-for="(g, i) in supplyGaps"
                :key="`gap-${i}`"
                :x="xForKm(g.startKm)"
                :y="padding.top"
                :width="Math.max(2, xForKm(g.endKm) - xForKm(g.startKm))"
                :height="innerH"
                class="supply-gap-fill"
              />
            </g>

            <g clip-path="url(#elev-clip)">
              <path :d="areaPath" class="area" />
              <path :d="linePath" class="line" />
            </g>

            <g v-if="selectionRange" class="selection">
              <rect
                :x="xForKm(selectionRange.lo)"
                :y="padding.top"
                :width="Math.max(2, xForKm(selectionRange.hi) - xForKm(selectionRange.lo))"
                :height="innerH"
                class="selection-fill"
              />
              <line
                :x1="xForKm(selectionRange.lo)"
                :y1="padding.top"
                :x2="xForKm(selectionRange.lo)"
                :y2="chartHeight - padding.bottom"
                class="selection-edge"
              />
              <line
                :x1="xForKm(selectionRange.hi)"
                :y1="padding.top"
                :x2="xForKm(selectionRange.hi)"
                :y2="chartHeight - padding.bottom"
                class="selection-edge"
              />
            </g>

            <g class="axis-labels">
              <text
                v-for="tick in yTicks"
                :key="`yl-${tick}`"
                :x="padding.left - 6"
                :y="yForElev(tick) + 4"
                text-anchor="end"
              >
                {{ tick }}
              </text>
              <text :x="padding.left - 6" :y="padding.top - 4" text-anchor="end" class="unit">
                m
              </text>
            </g>

            <g class="axis-labels x-labels">
              <text
                v-for="(tick, i) in xTicks"
                :key="`xl-${tick}`"
                :x="xForKm(tick)"
                :y="chartHeight - 8"
                :text-anchor="i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'"
              >
                {{ tick }}{{ i === 0 ? ` ${t('elevation.km')}` : '' }}
              </text>
            </g>

            <g v-if="hoverKm != null && !isSelecting && !selectionRange" class="cursor">
              <line
                v-if="hoverPoint?.elevation != null"
                :x1="padding.left"
                :y1="yForElev(hoverPoint.elevation)"
                :x2="chartWidth - padding.right"
                :y2="yForElev(hoverPoint.elevation)"
                class="cursor-elev-line"
              />
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
                r="10"
                class="cursor-ring"
              />
              <circle
                v-if="hoverPoint?.elevation != null"
                :cx="xForKm(hoverKm)"
                :cy="yForElev(hoverPoint.elevation)"
                r="5.5"
                class="cursor-dot"
                filter="url(#cursor-glow)"
              />
            </g>
          </svg>
        </div>
      </div>
    </template>

    <p v-else class="no-data">{{ t('elevation.noData') }}</p>
  </div>
</template>

<style scoped>
.elevation-profile {
  flex-shrink: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
}

.profile-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.9rem;
  min-height: 48px;
  border: none;
  border-bottom: 1px solid transparent;
  background: var(--surface-2);
  cursor: pointer;
  text-align: left;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
}

.elevation-profile:not(.collapsed) .profile-toggle {
  border-bottom-color: var(--border);
}

.toggle-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.chevron-wrap {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.chevron {
  color: var(--text);
  font-size: 1.15rem;
  line-height: 1;
  font-weight: 700;
}

.title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.subtitle {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.85rem;
  padding: 0.35rem 1rem 0.2rem;
}

.header-left {
  min-width: 0;
  flex: 1;
}

.gap-hint {
  margin: 0.15rem 0 0;
  font-size: 0.68rem;
  font-weight: 600;
  color: #b91c1c;
  line-height: 1.3;
}

.gap-summary {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.35;
}

.gap-summary--warn {
  color: #b91c1c;
}

.gap-summary--ok {
  color: #166534;
}

.select-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.surface-summary {
  padding: 0 1rem 0.2rem;
}

.surface-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.surface-title {
  flex-shrink: 0;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted);
  line-height: 1;
}

.surface-stack {
  flex: 1;
  min-width: 0;
  display: flex;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--border);
}

.surface-seg {
  display: block;
  height: 100%;
  min-width: 0;
}

.surface-list {
  list-style: none;
  margin: 0.15rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem 0.55rem;
}

.surface-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.73rem;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.surface-swatch {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
  align-self: center;
}

.surface-name {
  color: var(--text-muted);
}

.surface-pct {
  font-weight: 800;
  font-size: 0.73rem;
}

.header-stats {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  min-height: 2.35rem;
  min-width: min(19rem, 48vw);
}

.live-chip {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 0.35rem 0.55rem;
  max-width: min(360px, 55vw);
  min-height: 2.2rem;
  padding: 0.28rem 0.5rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--surface);
  box-sizing: border-box;
}

.live-chip--hover {
  border-color: #34d399;
  background: #ecfdf5;
  box-shadow: none;
}

.live-chip--hover.is-empty {
  border-color: var(--border);
  background: var(--surface-2);
  align-items: center;
}

.live-placeholder {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-chip--segment {
  border-color: #f59e0b;
  background: #fffbeb;
  padding-right: 1.5rem;
  position: relative;
  flex-wrap: wrap;
  max-width: min(420px, 62vw);
}

.live-cell {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 2.2rem;
}

.live-kicker {
  font-size: 0.52rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.live-cell strong {
  font-size: 0.78rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #111;
  line-height: 1.15;
}

.supply-gap-fill {
  fill: rgba(185, 28, 28, 0.16);
  pointer-events: none;
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

.live-grade {
  font-weight: 900 !important;
}

.live-clear {
  position: absolute;
  top: 0.15rem;
  right: 0.25rem;
  border: none;
  background: none;
  font-size: 1.15rem;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 0.2rem;
}

.live-clear:hover {
  color: #b91c1c;
}

@keyframes live-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.plot-area {
  height: clamp(160px, 22vh, 240px);
  padding: 0.25rem 0.75rem 0.4rem;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.plot-area.selecting {
  cursor: col-resize;
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

.selection-fill {
  fill: rgba(45, 106, 79, 0.18);
}

.selection-edge {
  stroke: var(--primary);
  stroke-width: 2;
  stroke-dasharray: 4 3;
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
  stroke: var(--primary);
  stroke-width: 2.5;
  stroke-dasharray: 6 4;
  opacity: 1;
}

.cursor-elev-line {
  stroke: var(--primary);
  stroke-width: 1.5;
  stroke-dasharray: 4 5;
  opacity: 0.45;
}

.cursor-ring {
  fill: rgba(45, 106, 79, 0.2);
  stroke: var(--primary);
  stroke-width: 2.5;
}

.cursor-dot {
  fill: var(--primary);
  stroke: #fff;
  stroke-width: 2.5;
}

.no-data {
  margin: 0;
  padding: 1.25rem 1rem;
  font-size: 0.88rem;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 768px) {
  .profile-toggle {
    padding: 0.7rem 0.85rem;
    min-height: 52px;
  }

  .chevron-wrap {
    width: 2.5rem;
    height: 2.5rem;
  }

  .chevron {
    font-size: 1.3rem;
  }

  .subtitle {
    font-size: 0.78rem;
  }

  .profile-header {
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem 0.15rem;
  }

  .surface-summary {
    padding-inline: 0.75rem;
  }

  .header-stats {
    width: 100%;
    justify-content: flex-start;
  }

  .live-chip {
    max-width: 100%;
  }

  .plot-area {
    height: clamp(180px, 28vh, 260px);
    padding-inline: 0.35rem;
  }

  .axis-labels text {
    font-size: 10px;
  }
}

@media (max-width: 640px) {
  .live-chip {
    max-width: 100%;
  }
}
</style>
