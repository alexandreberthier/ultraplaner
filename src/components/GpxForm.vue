<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { PoiCategory } from '../../shared/types'
import { useMapStore } from '../stores/mapStore'
import {
  DEFAULT_POI_CATEGORIES,
  DEFAULT_POI_RADIUS_M,
  MAX_GPX_SIZE_BYTES,
  MAX_POI_RADIUS_M,
  MIN_POI_RADIUS_M,
  POI_CATEGORY_DEFS,
} from '../config/poiCategories'

const store = useMapStore()
const router = useRouter()

const gpxFile = ref<File | null>(null)
const gpxName = ref('')
const radiusM = ref(DEFAULT_POI_RADIUS_M)
const selected = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
const formError = ref('')
const creating = ref(false)
const dragOver = ref(false)

function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  setFile(file ?? null)
}

function setFile(file: File | null) {
  gpxFile.value = file
  gpxName.value = file?.name.replace(/\.gpx$/i, '') ?? ''
  formError.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file?.name.toLowerCase().endsWith('.gpx')) {
    setFile(file)
  } else {
    formError.value = 'Bitte eine .gpx-Datei wählen'
  }
}

function toggleCategory(id: PoiCategory) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) {
    if (selected.value.length <= 1) {
      formError.value = 'Mindestens eine Kategorie muss aktiv sein'
      return
    }
    selected.value.splice(idx, 1)
  } else {
    selected.value.push(id)
  }
  formError.value = ''
}

async function createMap() {
  if (!gpxFile.value) {
    formError.value = 'Bitte eine GPX-Datei auswählen'
    return
  }
  creating.value = true
  formError.value = ''
  store.error = ''
  try {
    await store.createMapFromGpx(gpxFile.value, radiusM.value, [...selected.value])
    if (store.mapReady) {
      await router.push('/map/view')
    } else if (store.error) {
      formError.value = store.error
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Unbekannter Fehler'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form class="gpx-form" @submit.prevent="createMap">
    <div
      class="drop-zone"
      :class="{ over: dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <span class="field-label">GPX-Datei</span>
      <p class="drop-hint">{{ gpxName || 'Datei hierher ziehen' }}</p>
      <p class="drop-limit">max. {{ Math.round(MAX_GPX_SIZE_BYTES / 1024 / 1024) }} MB</p>
      <label class="file-btn">
        Datei wählen
        <input type="file" accept=".gpx,application/gpx+xml" @change="onPickFile" />
      </label>
    </div>

    <label class="field">
      <span class="field-label">Max. Entfernung zur Route</span>
      <div class="radius-row">
        <input
          v-model.number="radiusM"
          type="range"
          :min="MIN_POI_RADIUS_M"
          :max="MAX_POI_RADIUS_M"
          step="10"
        />
        <span>{{ radiusM }} m</span>
      </div>
    </label>

    <fieldset class="categories">
      <legend>Kategorien</legend>
      <div class="category-grid">
        <button
          v-for="cat in POI_CATEGORY_DEFS"
          :key="cat.id"
          type="button"
          class="cat-chip"
          :class="{ active: selected.includes(cat.id) }"
          @click="toggleCategory(cat.id)"
        >
          <span>{{ cat.icon }}</span>
          {{ cat.label }}
        </button>
      </div>
    </fieldset>

    <p v-if="formError || store.error" class="error">{{ formError || store.error }}</p>

    <button type="submit" class="btn-primary" :disabled="creating">
      {{ creating ? 'Wird verarbeitet…' : 'Karte erstellen' }}
    </button>
  </form>
</template>

<style scoped>
.gpx-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field-label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.drop-zone {
  display: block;
  padding: 1.5rem 1rem;
  background: var(--surface-2);
  border: 2px dashed var(--border);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
}

.drop-zone.over {
  border-color: var(--primary);
  background: #e8f5e9;
}

.drop-hint {
  margin: 0 0 0.35rem;
  color: var(--text-muted);
}

.drop-limit {
  margin: 0 0 0.75rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.file-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
}

.file-btn input {
  display: none;
}

.radius-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.radius-row input[type='range'] {
  flex: 1;
}

.categories {
  border: none;
  padding: 0;
}

.categories legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.85rem;
}

.cat-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
}

.btn-primary {
  padding: 0.85rem 1.5rem;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
