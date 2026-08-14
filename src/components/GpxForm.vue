<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
import { poiCategoryLabel } from '../utils/poiLabels'

const { t } = useI18n()
const store = useMapStore()
const router = useRouter()

const gpxFile = ref<File | null>(null)
const gpxName = ref('')
const radiusM = ref(DEFAULT_POI_RADIUS_M)
const selected = ref<PoiCategory[]>([...DEFAULT_POI_CATEGORIES])
const formError = ref('')
const creating = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const hasFile = computed(() => gpxFile.value != null)

const fileMeta = computed(() => {
  const file = gpxFile.value
  if (!file) return ''
  const kb = file.size / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB · GPX`
  return `${(kb / 1024).toFixed(1)} MB · GPX`
})

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

function openFilePicker() {
  fileInput.value?.click()
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file?.name.toLowerCase().endsWith('.gpx')) {
    setFile(file)
    if (fileInput.value) {
      // Keep native input in sync when possible (not always writable)
      try {
        const dt = new DataTransfer()
        dt.items.add(file)
        fileInput.value.files = dt.files
      } catch {
        /* ignore */
      }
    }
  } else {
    formError.value = t('gpx.pickGpx')
  }
}

function clearFile() {
  setFile(null)
  if (fileInput.value) fileInput.value.value = ''
}

function toggleCategory(id: PoiCategory) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) {
    if (selected.value.length <= 1) {
      formError.value = t('gpx.minCategory')
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
    formError.value = t('gpx.pickFile')
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
    formError.value = err instanceof Error ? err.message : t('store.unknownError')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <form class="gpx-form" @submit.prevent="createMap">
    <div
      class="drop-zone"
      :class="{ over: dragOver, filled: hasFile }"
      role="button"
      tabindex="0"
      :aria-label="hasFile ? t('gpx.loadedAria', { name: gpxFile?.name }) : t('gpx.pickAria')"
      @click="openFilePicker"
      @keydown.enter.prevent="openFilePicker"
      @keydown.space.prevent="openFilePicker"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input
        id="gpx-file-input"
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".gpx,application/gpx+xml"
        :aria-label="hasFile ? t('gpx.loadedAria', { name: gpxFile?.name }) : t('gpx.pickAria')"
        @change="onPickFile"
        @click.stop
      />
      <label class="sr-only" for="gpx-file-input">{{ t('gpx.pickAria') }}</label>

      <template v-if="!hasFile">
        <span class="drop-icon" aria-hidden="true">↑</span>
        <p class="drop-title">{{ t('gpx.dropTitle') }}</p>
        <p class="drop-limit">{{ t('gpx.dropLimit', { mb: Math.round(MAX_GPX_SIZE_BYTES / 1024 / 1024) }) }}</p>
      </template>

      <template v-else>
        <span class="drop-check" aria-hidden="true">✓</span>
        <p class="drop-status">{{ t('gpx.loaded') }}</p>
        <p class="drop-filename">{{ gpxFile?.name }}</p>
        <p class="drop-meta">{{ fileMeta }}</p>
        <div class="drop-actions">
          <span class="drop-change">{{ t('gpx.otherFile') }}</span>
          <button type="button" class="drop-clear" @click.stop="clearFile">{{ t('gpx.remove') }}</button>
        </div>
      </template>
    </div>

    <label class="field">
      <span class="field-label">{{ t('gpx.maxDist') }}</span>
      <div class="radius-row">
        <input
          v-model.number="radiusM"
          type="range"
          class="radius-slider"
          :min="MIN_POI_RADIUS_M"
          :max="MAX_POI_RADIUS_M"
          step="10"
          :aria-valuetext="`${radiusM} m`"
        />
        <span class="radius-value">{{ radiusM }}&nbsp;m</span>
      </div>
    </label>

    <fieldset class="categories">
      <legend>{{ t('gpx.categories') }}</legend>
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
          {{ poiCategoryLabel(cat.id) }}
        </button>
      </div>
    </fieldset>

    <p v-if="formError || store.error" class="error">{{ formError || store.error }}</p>

    <button type="submit" class="btn-primary" :disabled="creating || !hasFile">
      {{ creating ? t('gpx.processing') : hasFile ? t('gpx.create') : t('gpx.pickFirst') }}
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 11rem;
  padding: 1.5rem 1.1rem;
  background: var(--surface-2);
  border: 2px dashed var(--border);
  border-radius: 12px;
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.drop-zone:hover,
.drop-zone:focus-visible {
  border-color: var(--primary);
  outline: none;
}

.drop-zone.over {
  border-color: var(--primary);
  background: #e8f5e9;
}

.drop-zone.filled {
  border-style: solid;
  border-color: var(--primary);
  background: #ecfdf5;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.drop-icon {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary);
  line-height: 1;
  margin-bottom: 0.35rem;
}

.drop-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.drop-limit {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.drop-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  margin-bottom: 0.35rem;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-size: 1.15rem;
  font-weight: 700;
}

.drop-status {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--primary);
}

.drop-filename {
  margin: 0.2rem 0 0;
  max-width: 100%;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  word-break: break-word;
}

.drop-meta {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.drop-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.drop-change {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.drop-clear {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.drop-clear:hover {
  color: #b91c1c;
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
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.9rem;
  -webkit-tap-highlight-color: transparent;
}

.cat-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

@media (min-width: 769px) {
  .cat-chip {
    padding: 0.4rem 0.75rem;
    min-height: 0;
    font-size: 0.85rem;
  }
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
  cursor: not-allowed;
}
</style>
