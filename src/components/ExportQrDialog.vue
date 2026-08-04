<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'

const props = defineProps<{
  open: boolean
  url: string
  title: string
  hint?: string
  busy?: boolean
  error?: string
  allowFitToggle?: boolean
  format?: 'gpx' | 'fit' | 'coros'
}>()

const emit = defineEmits<{
  close: []
  download: []
  'switch-format': [format: 'gpx' | 'fit']
}>()

const { t } = useI18n()
const qrDataUrl = ref('')
const qrError = ref('')

const canShowQr = computed(() => Boolean(props.url) && !props.busy && !props.error)
const activeFormat = computed(() => (props.format === 'fit' ? 'fit' : 'gpx'))

watch(
  () => [props.open, props.url] as const,
  async ([open, url]) => {
    qrDataUrl.value = ''
    qrError.value = ''
    if (!open || !url) return
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      })
    } catch {
      qrError.value = t('export.qrRenderFailed')
    }
  },
  { immediate: true }
)

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

async function copyLink() {
  if (!props.url) return
  try {
    await navigator.clipboard.writeText(props.url)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="qr-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click="onBackdrop"
    >
      <div class="qr-dialog" @click.stop>
        <header class="qr-head">
          <h2>{{ title }}</h2>
          <button type="button" class="qr-close" :aria-label="t('export.qrClose')" @click="emit('close')">
            ×
          </button>
        </header>

        <div v-if="allowFitToggle" class="qr-format" role="group" :aria-label="t('export.qrFormatLabel')">
          <button
            type="button"
            class="qr-format-btn"
            :class="{ active: activeFormat === 'gpx' }"
            :disabled="busy"
            @click="emit('switch-format', 'gpx')"
          >
            {{ t('export.qrFormatGpx') }}
          </button>
          <button
            type="button"
            class="qr-format-btn"
            :class="{ active: activeFormat === 'fit' }"
            :disabled="busy"
            @click="emit('switch-format', 'fit')"
          >
            {{ t('export.qrFormatFit') }}
          </button>
        </div>

        <p v-if="hint" class="qr-hint">{{ hint }}</p>

        <div v-if="busy" class="qr-status">{{ t('export.qrPreparing') }}</div>
        <div v-else-if="error" class="qr-status error">{{ error }}</div>
        <div v-else-if="qrError" class="qr-status error">{{ qrError }}</div>
        <div v-else-if="canShowQr" class="qr-body">
          <img v-if="qrDataUrl" class="qr-img" :src="qrDataUrl" alt="" width="220" height="220" />
          <p class="qr-scan">{{ t('export.qrScan') }}</p>
          <p class="qr-ttl">{{ t('export.qrTtl') }}</p>
          <button type="button" class="qr-link-btn" @click="copyLink">
            {{ t('export.qrCopyLink') }}
          </button>
        </div>

        <div class="qr-actions">
          <button type="button" class="qr-primary" :disabled="busy" @click="emit('download')">
            {{ t('export.qrDownloadHere') }}
          </button>
          <button type="button" class="qr-secondary" @click="emit('close')">
            {{ t('export.qrClose') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
}

.qr-dialog {
  width: min(100%, 22rem);
  background: #fff;
  color: #0f172a;
  border-radius: 12px;
  padding: 1rem 1.1rem 1.1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
}

.qr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.qr-head h2 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
}

.qr-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  padding: 0 0.15rem;
}

.qr-format {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin-top: 0.75rem;
  padding: 0.25rem;
  border-radius: 10px;
  background: #f1f5f9;
}

.qr-format-btn {
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.45rem 0.5rem;
  cursor: pointer;
}

.qr-format-btn.active {
  background: #fff;
  color: #0f766e;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.qr-format-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qr-hint {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.4;
}

.qr-status {
  margin: 1rem 0;
  text-align: center;
  font-size: 0.9rem;
  color: #334155;
}

.qr-status.error {
  color: #b91c1c;
}

.qr-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  margin: 0.85rem 0 0.25rem;
}

.qr-img {
  display: block;
  width: 220px;
  height: 220px;
  border-radius: 8px;
  background: #fff;
}

.qr-scan {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  font-weight: 600;
  text-align: center;
}

.qr-ttl {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
}

.qr-link-btn {
  margin-top: 0.15rem;
  border: none;
  background: transparent;
  color: #0f766e;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.qr-actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.9rem;
}

.qr-primary,
.qr-secondary {
  width: 100%;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
}

.qr-primary {
  border: 1px solid #0f766e;
  background: #0f766e;
  color: #fff;
}

.qr-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qr-secondary {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
</style>
