<script setup lang="ts">
import { RouterView } from 'vue-router'
import LoadingOverlay from './components/LoadingOverlay.vue'
import { useMapStore } from './stores/mapStore'

const store = useMapStore()
</script>

<template>
  <RouterView />
  <LoadingOverlay />
  <div v-if="store.error && store.mode !== 'loading'" class="global-error" role="alert">
    {{ store.error }}
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
  border-radius: 8px;
  font-size: 0.9rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}
</style>
