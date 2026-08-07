<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ControlPointKind } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import { useSidebarSection } from '../composables/useSidebarSection'
import { poiCategoryEmoji } from '../utils/poiLabels'

const { t } = useI18n()
const store = useMapStore()
const { open, toggle } = useSidebarSection('controls', false)

const kinds: { id: ControlPointKind; labelKey: string }[] = [
  { id: 'cp', labelKey: 'controls.kindCp' },
  { id: 'sleep', labelKey: 'controls.kindSleep' },
]

const placing = computed(() => store.controlPointPlaceKind)
const count = computed(() => store.controlPoints.length)

function formatKm(km: number) {
  return `${Math.round(km)} km`
}

function kindEmoji(kind: ControlPointKind) {
  if (kind === 'cp') return poiCategoryEmoji('checkpoint')
  if (kind === 'sleep') return poiCategoryEmoji('sleep')
  return poiCategoryEmoji('border')
}
</script>

<template>
  <section v-if="!store.isNearbyMap" class="controls-panel" :class="{ open }" data-sidebar-section="controls">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('controls.title') }}</span>
      <span class="toggle-summary">
        {{ count > 0 ? t('controls.summary', { count }) : t('controls.emptyShort') }}
      </span>
      <span class="chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <p class="hint">{{ t('controls.hint') }}</p>

      <div class="kind-row" role="group" :aria-label="t('controls.title')">
        <button
          v-for="k in kinds"
          :key="k.id"
          type="button"
          class="kind-btn"
          :class="{ active: placing === k.id }"
          @click="store.beginPlaceControlPoint(k.id)"
        >
          {{ kindEmoji(k.id) }} {{ t(k.labelKey) }}
        </button>
      </div>

      <p v-if="placing" class="place-hint" role="status">
        {{ t('controls.placeHint') }}
        <button type="button" class="linkish" @click="store.cancelPlaceControlPoint()">
          {{ t('controls.cancel') }}
        </button>
      </p>

      <ul v-if="store.controlPoints.length" class="cp-list">
        <li v-for="cp in store.controlPoints" :key="cp.id" class="cp-item">
          <span class="cp-emoji" aria-hidden="true">{{ kindEmoji(cp.kind) }}</span>
          <div class="cp-fields">
            <input
              class="cp-name"
              type="text"
              maxlength="40"
              :value="cp.name"
              :aria-label="t('controls.name')"
              @change="
                store.updateControlPoint(cp.id, {
                  name: ($event.target as HTMLInputElement).value,
                })
              "
            />
            <span class="cp-km">{{ formatKm(cp.distanceAlongRouteKm ?? 0) }}</span>
          </div>
          <button
            type="button"
            class="cp-remove"
            :title="t('controls.remove')"
            @click="store.removeControlPoint(cp.id)"
          >
            ×
          </button>
        </li>
      </ul>
      <p v-else class="empty">{{ t('controls.empty') }}</p>
    </div>
  </section>
</template>

<style scoped>
.controls-panel {
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.toggle-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #6b7280);
  flex-shrink: 0;
}

.toggle-summary {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text, #111);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--muted, #6b7280);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.section-body {
  padding: 0 0.85rem 0.85rem;
}

.hint,
.empty,
.place-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
  line-height: 1.35;
}

.kind-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.kind-btn {
  border: 1px solid var(--border, #d1d5db);
  background: #fff;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.kind-btn.active {
  background: var(--primary, #2d6a4f);
  border-color: var(--primary, #2d6a4f);
  color: #fff;
}

.place-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  margin-top: 0.45rem;
  color: var(--primary, #2d6a4f);
  font-weight: 600;
}

.linkish {
  border: none;
  background: none;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.cp-list {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.cp-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.cp-emoji {
  flex: 0 0 auto;
}

.cp-fields {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.cp-name {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
}

.cp-km {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted, #6b7280);
}

.cp-remove {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: var(--muted, #6b7280);
  padding: 0.15rem 0.35rem;
}
</style>
