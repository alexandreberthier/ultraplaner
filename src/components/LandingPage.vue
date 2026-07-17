<script setup lang="ts">
import GpxForm from '../components/GpxForm.vue'
</script>

<template>
  <div class="landing">
    <header class="site-header">
      <h1>OnRoute</h1>
      <p class="tagline">Ultracycling-Routenplanung mit Versorgungspunkten — DACH</p>
    </header>

    <section class="hero-card">
      <GpxForm />
    </section>

    <p class="hint">
      GPX hochladen → Route, Höhenprofil und POIs erscheinen gleichzeitig.
      Region v1: Österreich, Deutschland, Schweiz, Liechtenstein.
    </p>
    <p class="version">Build UI-2 · lokal: npm run dev</p>
  </div>
</template>

<style scoped>
.landing {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

.site-header {
  text-align: center;
  margin-bottom: 2rem;
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
}

.version {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  opacity: 0.7;
}
</style>
