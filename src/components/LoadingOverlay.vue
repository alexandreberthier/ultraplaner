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
      <div class="spinner" aria-hidden="true" />
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
  background: rgba(243, 239, 230, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.overlay-card {
  text-align: center;
  padding: 1.5rem 1.35rem 1.35rem;
  width: min(22rem, calc(100vw - 2rem));
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.spinner {
  width: 44px;
  height: 44px;
  margin: 0 auto 1rem;
  border: 3px solid var(--border);
  border-top-color: var(--cta);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.status {
  font-weight: 800;
  font-size: 1rem;
  color: #111;
  margin: 0 0 0.85rem;
  letter-spacing: 0.01em;
}

.progress {
  height: 0.85rem;
  border-radius: var(--radius);
  background: #f3efe6;
  border: 1px solid var(--border);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: var(--radius);
  background: var(--cta);
  transition: width 0.25s ease;
  min-width: 0.35rem;
  border-right: 1px solid var(--border);
}

.timer {
  color: #111;
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0.65rem 0 0;
  font-variant-numeric: tabular-nums;
}

.timeout-hint {
  margin-top: 1rem;
  color: #9f1239;
  font-size: 0.85rem;
  font-weight: 700;
}

.error {
  margin-top: 1rem;
  color: #9f1239;
  font-size: 0.9rem;
  font-weight: 700;
  max-width: 360px;
}

.overlay-actions {
  margin-top: 1.25rem;
}

.overlay-cancel {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text);
  border-radius: var(--radius);
  padding: 0.65rem 1.1rem;
  min-height: 48px;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
  box-shadow: var(--shadow);
}

@media (hover: hover) {
  .overlay-cancel:hover {
    background: var(--cream);
  }
}
</style>
