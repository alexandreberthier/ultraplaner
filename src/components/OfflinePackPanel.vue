<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useOnline } from '../composables/useOnline'
import {
  buildOfflinePack,
  deleteOfflinePack,
  estimatePackBytes,
  formatBytes,
  getPackMeta,
  PACK_MAX_BYTES,
  setActiveOfflinePackMapId,
  type OfflinePackMeta,
  type PackAbortSignal,
} from '../services/offlinePacks'

const emit = defineEmits<{ updated: [] }>()

const store = useMapStore()
const { t } = useI18n()
const { isOnline } = useOnline()

const meta = ref<OfflinePackMeta | null>(null)
const busy = ref(false)
const progressRatio = ref(0)
const progressBytes = ref(0)
const progressPhase = ref<'pois' | 'raster' | 'done'>('pois')
const error = ref('')
const abortRef = ref<PackAbortSignal>({ aborted: false })

const estimate = computed(() => {
  if (store.routeCoords.length < 2) return null
  return estimatePackBytes(store.routeCoords as [number, number][])
})

const canBuild = computed(
  () =>
    !store.isNearbyMap &&
    store.routeCoords.length >= 2 &&
    Boolean(store.savedMapId) &&
    isOnline.value &&
    !busy.value
)

const statusLabel = computed(() => {
  if (busy.value) {
    if (progressPhase.value === 'pois') return t('offlinePack.phasePois')
    if (progressPhase.value === 'raster') return t('offlinePack.phaseRaster')
    return t('offlinePack.phaseDone')
  }
  if (!meta.value) return t('offlinePack.none')
  if (meta.value.status === 'ready') return t('offlinePack.ready')
  if (meta.value.status === 'partial') return t('offlinePack.partial')
  if (meta.value.status === 'building') return t('offlinePack.building')
  return t('offlinePack.error')
})

async function refresh() {
  const id = store.savedMapId
  if (!id) {
    meta.value = null
    setActiveOfflinePackMapId(null)
    emit('updated')
    return
  }
  meta.value = await getPackMeta(id)
  if (meta.value?.status === 'ready' || meta.value?.status === 'partial') {
    setActiveOfflinePackMapId(id)
  }
  emit('updated')
}

async function startBuild() {
  const id = store.savedMapId
  if (!id || !canBuild.value) {
    error.value = t('offlinePack.needSavedMap')
    return
  }
  error.value = ''
  busy.value = true
  progressRatio.value = 0
  progressBytes.value = 0
  abortRef.value = { aborted: false }
  try {
    if (estimate.value && estimate.value.estimatedBytes > PACK_MAX_BYTES * 1.2) {
      // still allow — build will cap
    }
    meta.value = await buildOfflinePack(id, store.routeCoords as [number, number][], {
      signal: abortRef.value,
      onProgress: (p) => {
        progressPhase.value = p.phase
        progressRatio.value = p.ratio
        progressBytes.value = p.bytes
      },
    })
    emit('updated')
  } catch (err) {
    if (err instanceof Error && err.message === 'aborted') {
      error.value = t('offlinePack.aborted')
    } else {
      error.value = err instanceof Error ? err.message : t('offlinePack.error')
    }
    meta.value = await getPackMeta(id)
    emit('updated')
  } finally {
    busy.value = false
  }
}

function cancelBuild() {
  abortRef.value.aborted = true
}

async function removePack() {
  const id = store.savedMapId
  if (!id) return
  await deleteOfflinePack(id)
  meta.value = null
  setActiveOfflinePackMapId(null)
  emit('updated')
}

onMounted(() => {
  void refresh()
})

watch(
  () => store.savedMapId,
  () => {
    void refresh()
  }
)

defineExpose({ refresh, meta })
</script>

<template>
  <div v-if="!store.isNearbyMap && store.routeCoords.length >= 2" class="offline-pack">
    <p class="pack-title">{{ t('offlinePack.title') }}</p>
    <p class="pack-status">{{ statusLabel }}</p>
    <p v-if="estimate && !meta && !busy" class="pack-estimate">
      {{ t('offlinePack.estimate', { size: formatBytes(estimate.estimatedBytes), tiles: estimate.rasterTiles }) }}
    </p>
    <p v-if="meta && (meta.status === 'ready' || meta.status === 'partial')" class="pack-meta">
      {{ formatBytes(meta.bytes) }} · {{ meta.rasterTileCount }} {{ t('offlinePack.tiles') }}
      <template v-if="meta.status === 'partial'"> · {{ t('offlinePack.capHint') }}</template>
    </p>
    <div v-if="busy" class="pack-progress" role="progressbar" :aria-valuenow="Math.round(progressRatio * 100)">
      <div class="pack-progress-bar" :style="{ width: `${Math.round(progressRatio * 100)}%` }" />
      <span>{{ Math.round(progressRatio * 100) }}% · {{ formatBytes(progressBytes) }}</span>
    </div>
    <p v-if="error" class="pack-error">{{ error }}</p>
    <div class="pack-actions">
      <button
        v-if="!busy"
        type="button"
        class="pack-btn primary"
        :disabled="!canBuild"
        @click="startBuild"
      >
        {{ meta ? t('offlinePack.rebuild') : t('offlinePack.build') }}
      </button>
      <button v-if="busy" type="button" class="pack-btn" @click="cancelBuild">
        {{ t('offlinePack.cancel') }}
      </button>
      <button
        v-if="meta && !busy"
        type="button"
        class="pack-btn danger"
        @click="removePack"
      >
        {{ t('offlinePack.delete') }}
      </button>
    </div>
    <p class="pack-hint">{{ t('offlinePack.hint') }}</p>
  </div>
</template>

<style scoped>
.offline-pack {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.pack-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

.pack-status,
.pack-estimate,
.pack-meta,
.pack-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.pack-error {
  margin: 0;
  font-size: 0.75rem;
  color: #b91c1c;
}

.pack-progress {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.pack-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--primary, #2d6a4f);
  max-width: 100%;
}

.pack-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pack-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  min-height: 2.5rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.pack-btn.primary {
  background: var(--primary, #2d6a4f);
  border-color: var(--primary, #2d6a4f);
  color: #fff;
}

.pack-btn.danger {
  color: #b91c1c;
}

.pack-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
