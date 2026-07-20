<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useMapExport } from '../composables/useMapExport'
import { formatDistance, formatKm } from '../services/geo'
import { POI_CATEGORY_DEFS } from '../config/poiCategories'
import { googleMapsDirectionsUrl } from '../services/navigation'
import {
  fetchPlaceOpeningHours,
  isGooglePlacesConfigured,
  type PlaceHoursResult,
} from '../services/googlePlaces'

const store = useMapStore()
const { printFavorites } = useMapExport()
const hoursLoading = ref(false)
const hoursError = ref('')
const hoursResult = ref<PlaceHoursResult | null>(null)

const isFavorite = computed(() =>
  store.selectedPoi ? store.favorites.has(store.selectedPoi.id) : false
)
const favCount = computed(() => store.favorites.size)

const selectedEta = computed(() => {
  const poi = store.selectedPoi
  if (!poi) return null
  return store.etaAtRouteKm(poi.distanceAlongRouteKm ?? 0)
})

function categoryLabel(id: string) {
  return POI_CATEGORY_DEFS.find((c) => c.id === id)?.label ?? id
}

async function loadOpeningHours() {
  const poi = store.selectedPoi
  if (!poi || !isGooglePlacesConfigured()) return

  hoursLoading.value = true
  hoursError.value = ''
  hoursResult.value = null

  try {
    const result = await fetchPlaceOpeningHours(poi)
    if (!result) {
      hoursError.value = 'Kein Google-Eintrag in der Nähe gefunden.'
      return
    }
    hoursResult.value = result
  } catch (err) {
    hoursError.value = err instanceof Error ? err.message : 'Öffnungszeiten nicht verfügbar'
  } finally {
    hoursLoading.value = false
  }
}

function onClose() {
  hoursResult.value = null
  hoursError.value = ''
  store.closePoiDetail()
}

function onToggleFavorite() {
  if (!store.selectedPoi) return
  store.toggleFavorite(store.selectedPoi.id)
  onClose()
}

function onPrint() {
  printFavorites()
  onClose()
}

function onNavigate() {
  onClose()
}
</script>

<template>
  <div v-if="store.selectedPoi" class="sheet-backdrop" @click.self="onClose()">
    <div class="sheet">
      <button type="button" class="close" @click="onClose()">×</button>
      <h3>{{ store.selectedPoi.name }}</h3>
      <dl>
        <dt>Kategorie</dt>
        <dd>{{ categoryLabel(store.selectedPoi.category) }}</dd>
        <dt>Routen-km</dt>
        <dd>{{ formatKm(store.selectedPoi.distanceAlongRouteKm ?? 0) }}</dd>
        <dt>ETA</dt>
        <dd v-if="selectedEta">
          <template v-if="selectedEta.clockLabel">
            {{ selectedEta.clockLabel }}
            <span class="eta-sub">({{ selectedEta.durationLabel }} ab Start)</span>
          </template>
          <template v-else>{{ selectedEta.durationLabel }} ab Start</template>
        </dd>
        <dt>Entfernung zur Route</dt>
        <dd>{{ formatDistance(store.selectedPoi.distanceToRouteM ?? 0) }}</dd>
        <dt v-if="store.selectedPoi.subType">Typ</dt>
        <dd v-if="store.selectedPoi.subType">{{ store.selectedPoi.subType }}</dd>
      </dl>

      <div class="actions">
        <button
          type="button"
          class="fav-btn"
          :class="{ active: isFavorite }"
          @click="onToggleFavorite"
        >
          {{ isFavorite ? '★ Favorit entfernen' : '☆ Als Favorit markieren' }}
        </button>

        <div v-if="isFavorite && favCount > 0" class="fav-hint">
          <p>
            {{ favCount === 1 ? '1 Favorit gespeichert.' : `${favCount} Favoriten gespeichert.` }}
            Spickzettel mit km-Positionen drucken:
          </p>
          <button type="button" class="print-btn" @click="onPrint">
            🖨️ Spickzettel drucken
          </button>
        </div>
        <a
          class="nav-btn"
          :href="googleMapsDirectionsUrl(store.selectedPoi.lat, store.selectedPoi.lng)"
          target="_blank"
          rel="noopener noreferrer"
          @click="onNavigate"
        >
          Google Maps Navigation
        </a>
        <button
          v-if="isGooglePlacesConfigured()"
          type="button"
          class="hours-btn"
          :disabled="hoursLoading"
          @click="loadOpeningHours"
        >
          {{ hoursLoading ? 'Lade Öffnungszeiten…' : 'Öffnungszeiten laden' }}
        </button>
      </div>

      <p v-if="hoursError" class="hours-error">{{ hoursError }}</p>
      <div v-if="hoursResult" class="hours-box">
        <p v-if="hoursResult.openNow != null" class="open-now">
          {{ hoursResult.openNow ? 'Jetzt geöffnet' : 'Jetzt geschlossen' }}
        </p>
        <ul v-if="hoursResult.weekdayText.length">
          <li v-for="line in hoursResult.weekdayText" :key="line">{{ line }}</li>
        </ul>
        <p v-else class="hours-muted">Keine Öffnungszeiten hinterlegt.</p>
      </div>
      <p v-else-if="!isGooglePlacesConfigured()" class="hours-muted">
        Öffnungszeiten: optional mit <code>VITE_GOOGLE_MAPS_API_KEY</code> (Google Places API).
      </p>
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

.eta-sub {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.9em;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fav-btn,
.hours-btn,
.nav-btn {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  color: inherit;
  font: inherit;
}

.fav-btn.active {
  background: #fffbeb;
  border-color: #f59e0b;
  color: #b45309;
  font-weight: 600;
}

.fav-hint {
  padding: 0.75rem;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
}

.fav-hint p {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: #1e40af;
  line-height: 1.35;
}

.print-btn {
  width: 100%;
  padding: 0.55rem;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #fff;
  color: #1d4ed8;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.nav-btn {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

.hours-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.hours-error {
  margin: 0.75rem 0 0;
  color: #b42318;
  font-size: 0.85rem;
}

.hours-box {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: var(--surface-2);
  border-radius: 8px;
  font-size: 0.85rem;
}

.hours-box ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}

.open-now {
  margin: 0;
  font-weight: 600;
}

.hours-muted {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
