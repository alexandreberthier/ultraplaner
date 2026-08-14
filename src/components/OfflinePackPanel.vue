<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useOnline } from '../composables/useOnline'
import { useSidebarSection } from '../composables/useSidebarSection'
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
const { t, locale } = useI18n()
const { isOnline } = useOnline()
const { open, toggle } = useSidebarSection('offline', false)

const meta = ref<OfflinePackMeta | null>(null)
const busy = ref(false)
const progressRatio = ref(0)
const progressBytes = ref(0)
const progressPhase = ref<'pois' | 'raster' | 'done'>('pois')
const error = ref('')
const abortRef = ref<PackAbortSignal>({ aborted: false })

const visible = computed(
  () => !store.isNearbyMap && store.routeCoords.length >= 2
)

const estimate = computed(() => {
  if (store.routeCoords.length < 2) return null
  return estimatePackBytes(store.routeCoords as [number, number][])
})

const canBuild = computed(
  () =>
    visible.value &&
    Boolean(store.savedMapId) &&
    isOnline.value &&
    !busy.value
)

const hasUsablePack = computed(
  () => meta.value?.status === 'ready' || meta.value?.status === 'partial'
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

const packMetaLine = computed(() => {
  if (!meta.value || !hasUsablePack.value) return ''
  const date = new Date(meta.value.createdAt).toLocaleDateString(locale.value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return t('offlinePack.metaReady', {
    size: formatBytes(meta.value.bytes),
    date,
  })
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
  <section v-if="visible" class="offline-pack" :class="{ open, ready: hasUsablePack && !busy }" data-sidebar-section="offline">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('offlinePack.title') }}</span>
      <span class="toggle-summary" :class="{ 'is-ready': hasUsablePack && !busy }">{{ statusLabel }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <p class="pack-help">{{ t('offlinePack.help') }}</p>
      <p class="pack-where">{{ t('offlinePack.where') }}</p>

      <div v-if="hasUsablePack && !busy" class="pack-status" role="status">
        <strong>{{ meta?.status === 'partial' ? t('offlinePack.partial') : t('offlinePack.ready') }}</strong>
        <span v-if="packMetaLine">{{ packMetaLine }}</span>
        <span v-if="meta?.status === 'partial'" class="pack-cap">{{ t('offlinePack.capHint') }}</span>
      </div>

      <template v-if="!hasUsablePack && !busy">
        <p v-if="estimate" class="pack-estimate">
          {{ t('offlinePack.estimate', { size: formatBytes(estimate.estimatedBytes) }) }}
        </p>
        <p class="pack-details">{{ t('offlinePack.details') }}</p>
      </template>

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
          {{ hasUsablePack ? t('offlinePack.rebuild') : t('offlinePack.build') }}
        </button>
        <button v-if="busy" type="button" class="pack-btn" @click="cancelBuild">
          {{ t('offlinePack.cancel') }}
        </button>
        <button
          v-if="hasUsablePack && !busy"
          type="button"
          class="pack-btn danger"
          @click="removePack"
        >
          {{ t('offlinePack.delete') }}
        </button>
      </div>
      <p class="pack-hint">{{ t('offlinePack.hint') }}</p>
    </div>
  </section>
</template>

<style scoped>
.offline-pack {
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

.toggle-summary.is-ready {
  color: var(--primary, #2d6a4f);
}

.chevron {
  color: var(--text, #111);
  font-size: 1.15rem;
  font-weight: 800;
  flex-shrink: 0;
  width: 1.5rem;
  text-align: center;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0 0.85rem 0.85rem;
}

.pack-help,
.pack-where,
.pack-estimate,
.pack-details,
.pack-hint {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.4;
}

.pack-help {
  color: var(--text, #111);
}

.pack-details {
  font-size: 0.85rem;
}

.pack-status {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary, #2d6a4f) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary, #2d6a4f) 28%, transparent);
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--text, #111);
}

.pack-status strong {
  font-size: 0.8rem;
  color: var(--primary, #2d6a4f);
}

.pack-cap {
  color: #b45309;
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
  color: var(--text-muted, #6b7280);
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
  border-radius: 10px;
  padding: 0.65rem 0.9rem;
  min-height: 48px;
  font: inherit;
  font-size: 0.95rem;
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
