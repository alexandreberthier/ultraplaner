<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'

const store = useMapStore()
</script>

<template>
  <div v-if="store.mode === 'loading'" class="overlay">
    <div class="overlay-card">
      <div class="spinner" />
      <p class="status">{{ store.loadStatus || 'Wird geladen…' }}</p>
      <p class="timer">{{ store.loadSeconds }} s</p>
      <p v-if="store.error" class="error">{{ store.error }}</p>
      <p v-else-if="store.loadSeconds >= 30" class="timeout-hint">
        Dauert länger als erwartet — bitte Verbindung prüfen.
      </p>
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
  margin: 0 0 0.25rem;
}

.timer {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
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
</style>
