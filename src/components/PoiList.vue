<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useMapExport } from '../composables/useMapExport'
import { formatDistance, formatKm } from '../services/geo'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'

const store = useMapStore()
const { printFavorites } = useMapExport()
const tab = ref<'all' | 'favorites'>('all')

function categoryLabel(id: string) {
  return POI_CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id
}

const favoritePois = computed(() => store.favoritePois)

const shownPois = computed(() =>
  tab.value === 'favorites' ? favoritePois.value : store.displayPois
)

function removeFavorite(poiId: string) {
  store.removeFavorite(poiId)
}

function etaLabel(km: number): string {
  const eta = store.etaAtRouteKm(km)
  return eta.clockLabel ? `ETA ${eta.clockLabel}` : eta.durationLabel
}
</script>

<template>
  <div class="poi-list">
    <header>
      <h2>Versorgungspunkte ({{ store.displayPois.length }})</h2>
      <p class="route-info">{{ store.routeName }} · {{ store.totalKm.toFixed(1) }} km</p>
      <div class="tabs">
        <button
          type="button"
          :class="{ active: tab === 'all' }"
          @click="tab = 'all'"
        >
          Alle ({{ store.displayPois.length }})
        </button>
        <button
          type="button"
          :class="{ active: tab === 'favorites' }"
          @click="tab = 'favorites'"
        >
          ★ Favoriten ({{ favoritePois.length }})
        </button>
      </div>
      <p class="tab-hint">POI antippen → ★ Favorit → Spickzettel drucken</p>
    </header>

    <div v-if="tab === 'favorites' && favoritePois.length > 0" class="print-banner">
      <div>
        <strong>{{ favoritePois.length }} Favoriten</strong>
        <p>km-Liste für den Vorbau ausdrucken</p>
      </div>
      <button type="button" class="print-banner-btn" @click="printFavorites()">
        🖨️ Drucken
      </button>
    </div>

    <ul v-if="shownPois.length">
      <li
        v-for="poi in shownPois"
        :key="poi.id"
        :class="{ selected: store.selectedPoi?.id === poi.id, favorite: store.favorites.has(poi.id) }"
        @click="store.selectPoi(poi, true)"
      >
        <div class="row-main">
          <div class="row-text">
            <span class="km">{{ formatKm(poi.distanceAlongRouteKm ?? 0) }}</span>
            <span class="name">
              <span v-if="store.favorites.has(poi.id)" class="star">★</span>
              {{ poi.name }}
            </span>
            <span class="meta">
              {{ categoryLabel(poi.category) }}
              · {{ formatDistance(poi.distanceToRouteM ?? 0) }}
              · {{ etaLabel(poi.distanceAlongRouteKm ?? 0) }}
            </span>
          </div>
          <button
            v-if="store.favorites.has(poi.id)"
            type="button"
            class="remove-fav"
            title="Favorit entfernen"
            aria-label="Favorit entfernen"
            @click.stop="removeFavorite(poi.id)"
          >
            ×
          </button>
        </div>
      </li>
    </ul>

    <div v-else-if="tab === 'favorites'" class="empty">
      <p><strong>So erstellst du deinen Spickzettel:</strong></p>
      <ol class="steps">
        <li>POI auf der Karte oder in der Liste antippen</li>
        <li><strong>☆ Favorit</strong> wählen</li>
        <li>Hier unter <strong>Favoriten</strong> → <strong>🖨️ Drucken</strong></li>
      </ol>
    </div>
    <p v-else class="empty">
      Keine POIs im gewählten Radius gefunden.
      <span class="empty-hint">
        Prüfe Radius und Kategorien. Unterstützte Regionen: AT, CH, LI, DE, DK, IT, SK, SI, CZ, HU, LU, BE, NL, HR, ES, FR (Metropole).
      </span>
    </p>
  </div>
</template>

<style scoped>
.poi-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

header h2 {
  margin: 0;
  font-size: 1rem;
}

.route-info {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
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
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.tabs button.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  font-weight: 600;
}

.tab-hint {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.print-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.75rem 1rem 0;
  padding: 0.75rem;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 10px;
}

.print-banner p {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: #1e40af;
}

.print-banner-btn {
  flex-shrink: 0;
  padding: 0.45rem 0.7rem;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #fff;
  color: #1d4ed8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

li {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.row-main {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.row-text {
  flex: 1;
  min-width: 0;
}

.remove-fav {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  background: #fffbeb;
  color: #b45309;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-top: 0.1rem;
}

.remove-fav:hover {
  background: #fef3c7;
  border-color: #f59e0b;
}

li:hover,
li.selected {
  background: var(--surface-2);
}

li.favorite {
  border-left: 3px solid #f59e0b;
}

.km {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--primary);
}

.name {
  display: block;
  font-size: 0.95rem;
}

.star {
  color: #f59e0b;
  margin-right: 0.2rem;
}

.meta {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.empty {
  padding: 1rem;
  color: var(--text-muted);
}

.steps {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.88rem;
  line-height: 1.5;
}

.empty-hint {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
