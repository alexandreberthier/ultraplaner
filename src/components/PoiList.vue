<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useSidebarSection } from '../composables/useSidebarSection'
import { formatDistance, formatKm } from '../services/geo'
import { poiCategoryLabel } from '../utils/poiLabels'
import { isAlwaysAvailableWater } from '../utils/poiNormalize'
import type { OpenStatus } from '../utils/openingHours'
import type { Poi } from '../../shared/types'

const props = defineProps<{
  embedded?: boolean
}>()

const store = useMapStore()
const { t } = useI18n()
const { open, toggle } = useSidebarSection('pois', false, props.embedded)
const tab = ref<'all' | 'favorites'>('all')
const searchQuery = ref('')

const favoritePois = computed(() => store.favoritePois)

const shownPois = computed(() => {
  const base = tab.value === 'favorites' ? favoritePois.value : store.displayPois
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return base
  return base.filter((p) => {
    const name = store.favoriteLabel(p).toLowerCase()
    const note = store.favoriteNote(p.id).toLowerCase()
    const cat = categoryLabel(p.category).toLowerCase()
    const sub = (p.subType ?? '').toLowerCase()
    return name.includes(q) || note.includes(q) || cat.includes(q) || sub.includes(q)
  })
})

const summary = computed(() => {
  const n = store.displayPois.length
  const fav = favoritePois.value.length
  if (fav > 0) return t('pois.summaryFav', { count: n, fav })
  return t('pois.summary', { count: n })
})

function categoryLabel(id: string) {
  return poiCategoryLabel(id)
}

function removeFavorite(poiId: string) {
  store.removeFavorite(poiId)
}

function etaLabel(km: number): string {
  const eta = store.etaAtRouteKm(km)
  return eta.clockLabel ? `ETA ${eta.clockLabel}` : eta.durationLabel
}

function hoursBadge(poi: Poi): { status: OpenStatus; label: string } | null {
  const eta = store.etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
  if (!eta.arrival) return null
  // Always-open outdoor water/cemeteries: treat as open for badge UX
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
  // unknown: missing OSM data or cannot evaluate — never styled like closed
  return { status: 'unknown', label: t('detail.hoursUnknownShort') }
}
</script>

<template>
  <div class="poi-list" :class="{ open, embedded }" data-sidebar-section="pois">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('pois.title') }}</span>
      <span class="toggle-summary">{{ summary }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-show="open" class="poi-body">
      <header>
        <div class="tabs">
          <button
            type="button"
            :class="{ active: tab === 'all' }"
            @click="tab = 'all'"
          >
            {{ t('pois.all') }} ({{ store.displayPois.length }})
          </button>
          <button
            type="button"
            :class="{ active: tab === 'favorites' }"
            @click="tab = 'favorites'"
          >
            ★ {{ t('pois.favorites') }} ({{ favoritePois.length }})
          </button>
        </div>
        <label class="poi-search">
          <span class="search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            v-model="searchQuery"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            :placeholder="t('pois.searchPlaceholder')"
            :aria-label="t('pois.search')"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="search-clear"
            :aria-label="t('common.close')"
            @click="searchQuery = ''"
          >
            ×
          </button>
        </label>
      </header>

      <ul v-if="shownPois.length">
        <li
          v-for="poi in shownPois"
          :key="poi.id"
          :class="{ selected: store.selectedPoi?.id === poi.id, favorite: store.favorites.has(poi.id) }"
          @click="store.selectPoi(poi, true)"
        >
          <div class="row-main">
            <div class="row-text">
              <div class="row-title">
                <span class="km">{{ formatKm(poi.distanceAlongRouteKm ?? 0) }}</span>
                <span class="name">
                  <span v-if="store.favorites.has(poi.id)" class="star">★</span>
                  {{ store.favoriteLabel(poi) }}
                </span>
                <button
                  v-if="store.favorites.has(poi.id)"
                  type="button"
                  class="remove-fav"
                  :title="t('pois.removeFav')"
                  :aria-label="t('pois.removeFav')"
                  @click.stop="removeFavorite(poi.id)"
                >
                  ×
                </button>
              </div>
              <span v-if="store.favoriteNote(poi.id)" class="note">{{ store.favoriteNote(poi.id) }}</span>
              <span class="meta">
                {{ categoryLabel(poi.category) }}
                · {{ formatDistance(poi.distanceToRouteM ?? 0) }}
                <template v-if="!store.isNearbyMap">
                  · {{ etaLabel(poi.distanceAlongRouteKm ?? 0) }}
                  <template v-for="badge in [hoursBadge(poi)]" :key="poi.id + '-oh'">
                    <template v-if="badge">
                      ·
                      <span class="hours-badge" :class="badge.status">{{ badge.label }}</span>
                    </template>
                  </template>
                </template>
              </span>
            </div>
          </div>
        </li>
      </ul>

      <p v-else-if="searchQuery.trim()" class="empty">
        {{ t('pois.searchEmpty') }}
      </p>
      <div v-else-if="tab === 'favorites'" class="empty">
        <p><strong>{{ t('pois.emptyFavTitle') }}</strong></p>
        <ol class="steps">
          <li>{{ t('pois.emptyFav1') }}</li>
          <li>{{ t('pois.emptyFav2') }}</li>
          <li>{{ t('pois.emptyFav3') }}</li>
        </ol>
      </div>
      <p v-else class="empty">
        {{ t('pois.emptyAll') }}
        <span class="empty-hint">{{ t('pois.emptyHint') }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.poi-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}

.poi-list.open {
  flex: 1 1 auto;
  min-height: min(48vh, 420px);
}

.poi-list:not(.open) {
  flex: 0 0 auto;
  min-height: auto;
}

.poi-list.embedded {
  flex: none;
  min-height: auto;
  border-bottom: none;
}

.poi-list.embedded.open {
  flex: none;
  min-height: auto;
}

.poi-list.embedded .poi-body {
  overflow: visible;
}

.poi-list.embedded ul {
  overflow: visible;
  max-height: none;
  min-height: 0;
  flex: none;
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
  flex-shrink: 0;
}

.section-toggle:hover {
  background: var(--surface-2);
}

.embedded-head {
  display: none;
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

.poi-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  padding: 0.65rem 1rem 0.75rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.poi-list .poi-body header {
  padding-top: 0.35rem;
}

.tabs {
  display: flex;
  gap: 0.4rem;
}

.tabs button {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
  font-size: 0.8rem;
}

.tabs button.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.poi-search {
  position: relative;
  display: block;
  margin-top: 0.55rem;
}

.poi-search .search-icon {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  color: var(--text-muted);
  pointer-events: none;
}

.poi-search input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 2.15rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}

.poi-search input::placeholder {
  color: var(--text-muted);
  opacity: 0.9;
}

.poi-search input:focus {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.search-clear {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.35rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: min(34vh, 300px);
  max-height: min(62vh, 600px);
}

li {
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.row-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row-text {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
}

.km {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
  white-space: nowrap;
}

.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.05rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.star {
  color: #f59e0b;
  margin-right: 0.15rem;
}

.meta {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hours-badge {
  font-weight: 700;
}

.hours-badge.open {
  color: #15803d;
}

.hours-badge.closed {
  color: #b91c1c;
}

.hours-badge.unknown {
  color: var(--text-muted);
  font-weight: 500;
  font-style: italic;
  opacity: 0.9;
}

li.selected {
  background: var(--surface-2);
}

li.favorite {
  border-left: 3px solid #f59e0b;
}

.remove-fav {
  flex-shrink: 0;
  border: none;
  background: none;
  font-size: 1.05rem;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 0.15rem;
  align-self: center;
}

.remove-fav:hover {
  color: #b91c1c;
}

.empty {
  padding: 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.empty-hint {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.78rem;
  line-height: 1.4;
}

.steps {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .section-toggle {
    padding: 1rem 1.15rem;
    min-height: 60px;
  }

  .toggle-title {
    font-size: 0.88rem;
  }

  .toggle-summary {
    font-size: 1rem;
  }

  .chevron {
    font-size: 1.45rem;
    font-weight: 800;
    color: var(--text);
    width: 1.75rem;
    text-align: center;
  }

  .tabs button {
    min-height: 48px;
    padding: 0.55rem 0.65rem;
    font-size: 1rem;
    border-radius: 10px;
  }

  .poi-search input {
    min-height: 52px;
    font-size: 1.1rem;
    padding: 0.7rem 2.4rem 0.7rem 2.3rem;
  }

  li {
    padding: 0.95rem 1.1rem;
    min-height: 64px;
  }

  .km {
    font-size: 1rem;
  }

  .name {
    font-size: 1.18rem;
  }

  .note,
  .meta {
    font-size: 1rem;
    margin-top: 0.2rem;
  }

  .empty {
    font-size: 1.05rem;
  }
}
</style>
