<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
import { formatDistance } from '../services/geo'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'

const store = useMapStore()

function categoryLabel(id: string) {
  return POI_CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id
}
</script>

<template>
  <div class="poi-list">
    <header>
      <h2>Versorgungspunkte ({{ store.displayPois.length }})</h2>
      <p class="route-info">{{ store.routeName }} · {{ store.totalKm.toFixed(1) }} km</p>
    </header>
    <ul v-if="store.displayPois.length">
      <li
        v-for="poi in store.displayPois"
        :key="poi.id"
        :class="{ selected: store.selectedPoi?.id === poi.id }"
        @click="store.selectPoi(poi)"
      >
        <span class="km">{{ (poi.distanceAlongRouteKm ?? 0).toFixed(1) }} km</span>
        <span class="name">{{ poi.name }}</span>
        <span class="meta">
          {{ categoryLabel(poi.category) }}
          · {{ formatDistance(poi.distanceToRouteM ?? 0) }}
        </span>
      </li>
    </ul>
    <p v-else class="empty">
      Keine POIs im gewählten Radius gefunden.
      <span class="empty-hint">
        Der DACH-Import läuft noch (aktuell nur Teile von Süd-/Ostösterreich, ca. lat 46–47°).
        Routen in Wien, Deutschland oder Nordösterreich haben noch keine Daten.
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
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
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

li:hover,
li.selected {
  background: var(--surface-2);
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

.meta {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.empty {
  padding: 1rem;
  color: var(--text-muted);
}

.empty-hint {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
