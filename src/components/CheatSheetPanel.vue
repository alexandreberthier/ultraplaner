<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PrintFavorite } from '../services/export'
import { printFavoritesSheet } from '../services/export'
import { useMapStore } from '../stores/mapStore'
import { poiCategoryEmoji } from '../utils/poiLabels'
import { isAlwaysAvailableWater } from '../utils/poiNormalize'
import type { OpenStatus } from '../utils/openingHours'

const props = defineProps<{
  open: boolean
  routeName: string
  totalKm: number
  stops: PrintFavorite[]
}>()

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const store = useMapStore()
const nightContrast = ref(false)

type CheatRow = PrintFavorite & {
  etaText: string
  hours: { status: OpenStatus; label: string } | null
}

function etaTextFor(km: number): string {
  const eta = store.etaAtRouteKm(km)
  return eta.clockLabel ?? eta.durationLabel
}

function hoursBadge(poi: PrintFavorite): { status: OpenStatus; label: string } | null {
  const eta = store.etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
  if (!eta.arrival) return null
  if (isAlwaysAvailableWater(poi)) {
    return { status: 'open', label: t('detail.hoursOpenShort') }
  }
  const status = store.poiOpenStatusAtEta(poi)
  if (status === 'open') {
    return { status, label: t('detail.hoursOpenShort') }
  }
  if (status === 'closed') {
    return { status, label: t('detail.hoursClosedShort') }
  }
  return { status: 'unknown', label: t('detail.hoursUnknownShort') }
}

const rows = computed((): CheatRow[] =>
  [...props.stops]
    .sort((a, b) => (a.distanceAlongRouteKm ?? 0) - (b.distanceAlongRouteKm ?? 0))
    .map((p) => ({
      ...p,
      etaText: etaTextFor(p.distanceAlongRouteKm ?? 0),
      hours: hoursBadge(p),
    }))
)

const metaLine = computed(() => {
  const parts = [`${store.avgSpeedKmh} km/h`]
  if (store.startTimeHHmm) {
    parts.push(`${t('eta.start')} ${store.startTimeHHmm}`)
  }
  const finish = store.etaAtRouteKm(props.totalKm)
  if (finish.clockLabel) {
    parts.push(`${t('eta.goal')} ${finish.clockLabel}`)
  }
  return parts.join(' · ')
})

function formatKm(km: number) {
  return `${Math.round(km)} km`
}

function onPrint() {
  const pois: PrintFavorite[] = rows.value.map(({ etaText, hours, ...p }) => ({
    ...p,
    etaLabel: etaText,
    hoursLabel: hours?.label,
    hoursStatus: hours?.status,
  }))
  printFavoritesSheet(props.routeName, props.totalKm, pois, {
    nightContrast: nightContrast.value,
    metaLine: metaLine.value,
  })
}
</script>

<template>
  <div
    v-if="open"
    class="cheat-sheet"
    :class="{ night: nightContrast }"
    role="dialog"
    :aria-label="t('map.cheatSheet')"
  >
    <header class="cheat-head">
      <div>
        <strong>{{ t('map.cheatSheet') }}</strong>
        <p>{{ routeName }} · {{ totalKm.toFixed(1) }} km · {{ rows.length }}</p>
        <p class="meta">{{ metaLine }}</p>
      </div>
      <button type="button" class="close" :aria-label="t('controls.cancel')" @click="emit('close')">
        ×
      </button>
    </header>

    <label class="night-toggle">
      <input v-model="nightContrast" type="checkbox" />
      {{ t('cheatSheet.nightContrast') }}
    </label>

    <ol v-if="rows.length" class="cheat-list">
      <li v-for="p in rows" :key="p.id" class="cheat-row">
        <span class="km">{{ formatKm(p.distanceAlongRouteKm ?? 0) }}</span>
        <span class="emoji" aria-hidden="true">{{ poiCategoryEmoji(p.category) }}</span>
        <div class="text">
          <strong>{{ p.label || p.name }}</strong>
          <span class="row-meta">
            <span class="eta">{{ p.etaText }}</span>
            <span
              v-if="p.hours"
              class="hours"
              :data-status="p.hours.status"
            >{{ p.hours.label }}</span>
          </span>
          <small v-if="p.note">{{ p.note }}</small>
        </div>
      </li>
    </ol>
    <p v-else class="empty">{{ t('map.cheatSheetEmpty') }}</p>

    <footer class="cheat-foot">
      <button type="button" class="btn-secondary" @click="emit('close')">
        {{ t('controls.cancel') }}
      </button>
      <button type="button" class="btn-primary" :disabled="!rows.length" @click="onPrint">
        {{ t('cheatSheet.print') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.cheat-sheet {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  background: #f8faf8;
  color: #111;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  transition: background 0.15s ease, color 0.15s ease;
}

.cheat-sheet.night {
  background: #0a0a0a;
  color: #f5f5f5;
}

.cheat-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.cheat-head strong {
  font-size: 1.15rem;
}

.cheat-head p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #4b5563;
}

.cheat-sheet.night .cheat-head p {
  color: #a3a3a3;
}

.cheat-head .meta {
  font-variant-numeric: tabular-nums;
}

.close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.75rem;
  line-height: 1;
  padding: 0 0.25rem;
  cursor: pointer;
}

.night-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.55rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.cheat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1 1 auto;
  -webkit-overflow-scrolling: touch;
  background: #fff;
  border-radius: var(--radius);
  border: 1px solid #e5e7eb;
}

.cheat-sheet.night .cheat-list {
  background: #111;
  border-color: #333;
}

.cheat-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid #eee;
}

.cheat-sheet.night .cheat-row {
  border-bottom-color: #2a2a2a;
}

.cheat-row:last-child {
  border-bottom: none;
}

.km {
  flex: 0 0 4.2rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: 1rem;
}

.emoji {
  flex: 0 0 auto;
  font-size: 1.15rem;
  line-height: 1.2;
}

.text {
  flex: 1 1 auto;
  min-width: 0;
}

.text strong {
  display: block;
  font-size: 1.02rem;
  line-height: 1.25;
  word-break: break-word;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
  margin-top: 0.2rem;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.eta {
  color: #374151;
}

.cheat-sheet.night .eta {
  color: #d4d4d4;
}

.hours {
  text-transform: lowercase;
}

.hours[data-status='open'] {
  color: #15803d;
}

.hours[data-status='closed'] {
  color: #b91c1c;
  font-weight: 700;
}

.hours[data-status='unknown'] {
  color: #6b7280;
  font-weight: 500;
  font-style: italic;
}

.cheat-sheet.night .hours[data-status='open'] {
  color: #4ade80;
}

.cheat-sheet.night .hours[data-status='closed'] {
  color: #fca5a5;
  text-decoration: underline;
  font-weight: 700;
}

.cheat-sheet.night .hours[data-status='unknown'] {
  color: #a3a3a3;
  font-style: italic;
  font-weight: 500;
}

.text small {
  display: block;
  margin-top: 0.2rem;
  color: #4b5563;
  font-size: 0.85rem;
  line-height: 1.3;
}

.cheat-sheet.night .text small {
  color: #a3a3a3;
}

.empty {
  margin: 2rem 0;
  text-align: center;
  color: #6b7280;
}

.cheat-foot {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn-secondary,
.btn-primary {
  flex: 1 1 0;
  border-radius: var(--radius);
  padding: 0.85rem 0.75rem;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
}

.btn-secondary {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111;
}

.cheat-sheet.night .btn-secondary {
  border-color: #525252;
  background: #1a1a1a;
  color: #f5f5f5;
}

.btn-primary {
  border: 1px solid var(--primary, #2d6a4f);
  background: var(--primary, #2d6a4f);
  color: #fff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (min-width: 769px) {
  .cheat-sheet {
    inset: auto;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 2rem));
    max-height: min(85vh, 720px);
    border-radius: var(--radius);
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    border: 1px solid #e5e7eb;
  }

  .cheat-sheet.night {
    border-color: #333;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.6);
  }
}
</style>
