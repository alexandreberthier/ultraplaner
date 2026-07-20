<script setup lang="ts">
import { ref } from 'vue'
import GpxForm from '../components/GpxForm.vue'
import RoutePlanner from '../components/RoutePlanner.vue'

const tab = ref<'gpx' | 'plan'>('gpx')
</script>

<template>
  <div class="landing" :class="{ 'plan-fullscreen': tab === 'plan' }">
    <template v-if="tab === 'gpx'">
      <header class="site-header">
        <h1>UltraPlaner</h1>
        <p class="tagline">
          Ultracycling-Routenplanung mit Versorgungspunkten — Mitteleuropa, Alpen, FR &amp; ES
        </p>
      </header>

      <div class="mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="true"
          class="active"
          @click="tab = 'gpx'"
        >
          GPX hochladen
        </button>
        <button type="button" role="tab" :aria-selected="false" @click="tab = 'plan'">
          Route planen
        </button>
      </div>

      <section class="hero-card">
        <GpxForm />
      </section>

      <p class="hint">
        GPX hochladen → Route, Höhenprofil und POIs erscheinen. Danach oben rechts
        <strong>Route exportieren</strong> (GPX, CSV, Spickzettel). Regionen: AT, CH, LI, DE, DK, IT,
        SK, SI, CZ, HU, LU, BE, NL, HR, ES, FR (Metropole).
      </p>
    </template>

    <template v-else>
      <header class="plan-topbar">
        <button type="button" class="back-btn" @click="tab = 'gpx'">← GPX</button>
        <div class="plan-brand">
          <strong>UltraPlaner</strong>
          <span>Route planen</span>
        </div>
        <div class="mode-tabs compact" role="tablist">
          <button type="button" role="tab" :aria-selected="false" @click="tab = 'gpx'">GPX</button>
          <button type="button" role="tab" :aria-selected="true" class="active">Planen</button>
        </div>
      </header>

      <section class="planner-stage">
        <RoutePlanner />
      </section>
    </template>
  </div>
</template>

<style scoped>
.landing {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

.landing.plan-fullscreen {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0;
  height: 100dvh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.site-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.site-header h1 {
  font-size: 2rem;
  margin: 0;
  color: var(--primary);
}

.tagline {
  color: var(--text-muted);
  margin: 0.5rem 0 0;
}

.mode-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-tabs button {
  flex: 1;
  padding: 0.65rem 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text-muted);
}

.mode-tabs button.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.mode-tabs.compact {
  margin: 0;
  flex: 0 0 auto;
  max-width: 200px;
}

.mode-tabs.compact button {
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  border-radius: 8px;
}

.hero-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.hint {
  margin-top: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.45;
}

.plan-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 5;
}

.back-btn {
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 8px;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}

.plan-brand {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
  flex: 1;
}

.plan-brand strong {
  font-size: 0.95rem;
  color: var(--primary);
  line-height: 1.2;
}

.plan-brand span {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.planner-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 640px) {
  .mode-tabs.compact {
    display: none;
  }
}
</style>
