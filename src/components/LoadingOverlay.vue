<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/mapStore'
import { localeHomePath, type AppLocale } from '../i18n'

const store = useMapStore()
const router = useRouter()
const { t, locale } = useI18n()

const progressPct = computed(() => store.loadProgress ?? 0)
const progressLabel = computed(() =>
  store.loadProgress == null ? '' : `${store.loadProgress} %`
)

function cancel() {
  store.cancelLoading()
  void router.push(localeHomePath(locale.value as AppLocale))
}
</script>

<template>
  <div v-if="store.mode === 'loading'" class="overlay">
    <div class="overlay-card">
      <div class="spinner" />
      <p class="status">{{ store.loadStatus || t('loading.default') }}</p>
      <div
        class="progress"
        role="progressbar"
        :aria-valuenow="progressPct"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('loading.progress')"
      >
        <div class="progress-bar" :style="{ width: `${progressPct}%` }" />
      </div>
      <p class="timer">
        <span v-if="store.loadProgress != null">{{ progressLabel }} · </span>
        {{ store.loadSeconds }} s
      </p>
      <p v-if="store.error" class="error">{{ store.error }}</p>
      <p v-else-if="store.loadSeconds >= 30" class="timeout-hint">
        {{ t('loading.timeout') }}
      </p>
      <div class="overlay-actions">
        <button type="button" class="overlay-cancel" @click="cancel">
          {{ store.error ? t('loading.backHome') : t('loading.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(248, 250, 248, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-card {
  text-align: center;
  padding: 2rem;
  width: min(22rem, calc(100vw - 2rem));
}

.spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.status {
  font-weight: 600;
  margin: 0 0 0.85rem;
}

.progress {
  height: 0.55rem;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  transition: width 0.25s ease;
  min-width: 0.35rem;
}

.timer {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0.55rem 0 0;
}

.timeout-hint {
  margin-top: 1rem;
  color: var(--danger);
  font-size: 0.85rem;
}

.error {
  margin-top: 1rem;
  color: var(--danger);
  font-size: 0.9rem;
  max-width: 360px;
}

.overlay-actions {
  margin-top: 1.25rem;
}

.overlay-cancel {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.overlay-cancel:hover {
  border-color: var(--primary);
}
</style>
