<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  loadRouteExport,
  routeExportToBlob,
  type RouteExportRecord,
} from '../services/routeExports'
import { shareOrDownloadBlob } from '../services/export'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const status = ref<'loading' | 'ok' | 'missing' | 'error'>('loading')
const record = ref<RouteExportRecord | null>(null)
const errorDetail = ref('')
const sharing = ref(false)

const showCoros = computed(() => {
  const q = route.query.target
  if (q === 'coros') return true
  return record.value?.target === 'coros'
})

const kindLabel = computed(() => {
  if (!record.value) return ''
  return record.value.kind === 'fit' ? 'FIT' : 'GPX'
})

onMounted(async () => {
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  if (!id) {
    status.value = 'missing'
    return
  }
  try {
    const row = await loadRouteExport(id)
    if (!row) {
      status.value = 'missing'
      return
    }
    record.value = row
    status.value = 'ok'
  } catch (e) {
    status.value = 'error'
    errorDetail.value = e instanceof Error ? e.message : String(e)
  }
})

async function downloadOrShare() {
  if (!record.value || sharing.value) return
  sharing.value = true
  try {
    const blob = routeExportToBlob(record.value)
    await shareOrDownloadBlob(record.value.filename, blob, record.value.mimeType)
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div class="import-page">
    <div class="import-card">
      <p class="brand">UltraPlaner</p>

      <template v-if="status === 'loading'">
        <p class="status">{{ t('export.importLoading') }}</p>
      </template>

      <template v-else-if="status === 'missing'">
        <h1>{{ t('export.importMissingTitle') }}</h1>
        <p class="status">{{ t('export.importMissingBody') }}</p>
        <button type="button" class="btn secondary" @click="router.push('/')">
          {{ t('landing.backHome') }}
        </button>
      </template>

      <template v-else-if="status === 'error'">
        <h1>{{ t('export.importErrorTitle') }}</h1>
        <p class="status">{{ t('export.importErrorBody') }}</p>
        <p v-if="errorDetail" class="detail">{{ errorDetail }}</p>
        <button type="button" class="btn secondary" @click="router.push('/')">
          {{ t('landing.backHome') }}
        </button>
      </template>

      <template v-else-if="record">
        <h1>{{ record.name }}</h1>
        <p class="meta">{{ t('export.importMeta', { kind: kindLabel, file: record.filename }) }}</p>

        <button
          v-if="showCoros"
          type="button"
          class="btn primary"
          :disabled="sharing"
          @click="downloadOrShare"
        >
          {{ t('export.importOpenCoros') }}
        </button>

        <button
          type="button"
          class="btn"
          :class="showCoros ? 'secondary' : 'primary'"
          :disabled="sharing"
          @click="downloadOrShare"
        >
          {{
            record.kind === 'fit'
              ? t('export.importDownloadFit')
              : t('export.importDownloadGpx')
          }}
        </button>

        <p v-if="showCoros" class="hint">{{ t('export.importCorosHint') }}</p>
        <p v-else class="hint">{{ t('export.importShareHint') }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.import-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(1200px 600px at 10% -10%, #d8f3ef 0%, transparent 55%),
    radial-gradient(900px 500px at 100% 0%, #e8eef8 0%, transparent 50%),
    #f6f8f7;
  color: #0f172a;
}

.import-card {
  width: min(100%, 24rem);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e2e8f0;
  border-radius: var(--radius);
  padding: 1.35rem 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.brand {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0f766e;
}

h1 {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.25;
}

.meta,
.status,
.hint,
.detail {
  margin: 0;
  line-height: 1.4;
}

.meta {
  font-size: 0.88rem;
  color: #475569;
}

.status {
  font-size: 0.95rem;
  color: #334155;
}

.hint {
  font-size: 0.8rem;
  color: #64748b;
}

.detail {
  font-size: 0.75rem;
  color: #94a3b8;
  word-break: break-word;
}

.btn {
  width: 100%;
  border-radius: var(--radius);
  font: inherit;
  font-weight: 700;
  padding: 0.8rem 0.95rem;
  cursor: pointer;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.btn.secondary {
  background: #fff;
  color: #334155;
}
</style>
