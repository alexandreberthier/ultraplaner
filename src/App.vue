<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LoadingOverlay from './components/LoadingOverlay.vue'
import { useMapStore } from './stores/mapStore'
import { pwaUpdating } from './utils/pwaUpdate'

const store = useMapStore()
const { t } = useI18n()
</script>

<template>
  <RouterView />
  <LoadingOverlay />
  <div v-if="store.error && store.mode !== 'loading'" class="global-error" role="alert">
    {{ store.error }}
  </div>
  <div v-if="pwaUpdating" class="pwa-update-toast" role="status" aria-live="polite">
    {{ t('pwa.updating') }}
  </div>
</template>

<style>
.global-error {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  max-width: min(520px, calc(100vw - 2rem));
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: var(--radius);
  font-size: 0.9rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.pwa-update-toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  max-width: min(420px, calc(100vw - 2rem));
  padding: 0.65rem 1rem;
  background: #1b4332;
  color: #f8faf9;
  border-radius: var(--radius);
  font-size: 0.875rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
</style>
