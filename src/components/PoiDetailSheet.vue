<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
import { formatDistance, formatKm } from '../services/geo'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'

const store = useMapStore()

function categoryLabel(id: string) {
  return POI_CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id
}
</script>

<template>
  <div v-if="store.selectedPoi" class="sheet-backdrop" @click.self="store.closePoiDetail()">
    <div class="sheet">
      <button type="button" class="close" @click="store.closePoiDetail()">×</button>
      <h3>{{ store.selectedPoi.name }}</h3>
      <dl>
        <dt>Kategorie</dt>
        <dd>{{ categoryLabel(store.selectedPoi.category) }}</dd>
        <dt>Routen-km</dt>
        <dd>{{ formatKm(store.selectedPoi.distanceAlongRouteKm ?? 0) }}</dd>
        <dt>Entfernung zur Route</dt>
        <dd>{{ formatDistance(store.selectedPoi.distanceToRouteM ?? 0) }}</dd>
        <dt v-if="store.selectedPoi.subType">Typ</dt>
        <dd v-if="store.selectedPoi.subType">{{ store.selectedPoi.subType }}</dd>
      </dl>
      <button
        type="button"
        class="fav-btn"
        @click="store.toggleFavorite(store.selectedPoi!.id)"
      >
        {{ store.favorites.has(store.selectedPoi.id) ? '★ Favorit' : '☆ Favorit' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  background: var(--surface);
  width: 100%;
  max-width: 480px;
  padding: 1.25rem 1.5rem 2rem;
  border-radius: 16px 16px 0 0;
  position: relative;
}

.close {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-muted);
}

h3 {
  margin: 0 2rem 1rem 0;
}

dl {
  margin: 0 0 1rem;
}

dt {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

dd {
  margin: 0.15rem 0 0;
}

.fav-btn {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  cursor: pointer;
}
</style>
