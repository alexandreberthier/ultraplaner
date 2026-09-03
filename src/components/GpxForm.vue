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
  gap: 1.45rem;
}

.field-label,
.categories legend {
  display: block;
  font-weight: 800;
  margin-bottom: 0.55rem;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #111;
}

.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 10.5rem;
  padding: 1.45rem 1.1rem;
  background: #f3efe6;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: center;
  color: #111;
}

@media (hover: hover) {
  .drop-zone:hover {
    background: #fff;
  }
}

.drop-zone:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

.drop-zone.over {
  border-style: solid;
  background: var(--cta);
}

.drop-zone.filled {
  border-style: solid;
  background: #fff;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.drop-icon {
  font-size: 1.7rem;
  font-weight: 800;
  color: #111;
  line-height: 1;
  margin-bottom: 0.35rem;
}

.drop-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #111;
  line-height: 1.3;
}

.drop-limit {
  margin: 0.4rem 0 0;
  color: #111;
  opacity: 0.62;
  font-size: 0.82rem;
  font-weight: 650;
}

.drop-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  margin-bottom: 0.4rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--cta);
  color: #111;
  font-size: 1.1rem;
  font-weight: 800;
}

.drop-status {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #111;
}

.drop-filename {
  margin: 0.25rem 0 0;
  max-width: 100%;
  font-size: 1.08rem;
  font-weight: 800;
  color: #111;
  word-break: break-word;
  line-height: 1.3;
}

.drop-meta {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: #111;
  opacity: 0.62;
}

.drop-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.drop-change {
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.drop-clear {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
  cursor: pointer;
}

@media (hover: hover) {
  .drop-clear:hover {
    background: var(--cream);
    color: var(--text);
  }
}

.radius-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 56px;
  padding: 0.45rem 0.15rem 0.7rem;
  box-sizing: border-box;
}

.radius-row input[type='range'] {
  flex: 1;
  accent-color: var(--cta);
}

.radius-slider::-webkit-slider-runnable-track,
.radius-row input[type='range']::-webkit-slider-runnable-track {
  height: 10px;
  border-radius: var(--radius);
  background: #d8d2c6;
  border: 1px solid var(--border);
  box-sizing: border-box;
}

.radius-slider::-moz-range-track,
.radius-row input[type='range']::-moz-range-track {
  height: 10px;
  border-radius: var(--radius);
  background: #d8d2c6;
  border: 1px solid var(--border);
  box-sizing: border-box;
}

.radius-slider::-webkit-slider-thumb,
.radius-row input[type='range']::-webkit-slider-thumb {
  width: 36px;
  height: 36px;
  margin-top: -15px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--cta);
  box-shadow: none;
}

.radius-slider::-moz-range-thumb,
.radius-row input[type='range']::-moz-range-thumb {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--cta);
  box-shadow: none;
}

.radius-value {
  flex: 0 0 7.25rem;
  width: 7.25rem;
  box-sizing: border-box;
  min-height: 2.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #fff;
  color: #111;
  box-shadow: none;
  font-weight: 800;
}

.categories {
  border: none;
  padding: 0;
  margin: 0;
}

.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.8rem;
  min-height: 44px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #fff;
  color: #111;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .cat-chip:hover {
    background: var(--cream);
  }
}

.cat-chip:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.cat-chip.active {
  background: var(--cta);
  color: #111;
  border-color: var(--border);
  font-weight: 800;
}

@media (min-width: 769px) {
  .cat-chip {
    padding: 0.4rem 0.7rem;
    min-height: 0;
    font-size: 0.84rem;
  }
}

@media (max-width: 768px) {
  .radius-row {
    min-height: 68px;
    padding: 0.55rem 0.1rem 0.85rem;
  }

  .radius-slider::-webkit-slider-thumb,
  .radius-row input[type='range']::-webkit-slider-thumb {
    width: 52px;
    height: 52px;
    margin-top: -22px;
  }

  .radius-slider::-moz-range-thumb,
  .radius-row input[type='range']::-moz-range-thumb {
    width: 52px;
    height: 52px;
  }
}

.error {
  margin: 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  background: #fff;
  color: #9f1239;
  font-size: 0.9rem;
  font-weight: 700;
}

.btn-primary {
  padding: 0.9rem 1.35rem;
  background: var(--cta);
  color: var(--cta-text);
  border: 1px solid transparent;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-weight: 700;
  font-size: 0.92rem;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

@media (hover: hover) {
  .btn-primary:hover:not(:disabled) {
    background: var(--cta-hover);
  }
}

.btn-primary:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

.btn-primary:disabled {
  opacity: 1;
  background: #e8e4dc;
  color: #111;
  box-shadow: none;
  cursor: not-allowed;
}
</style>
