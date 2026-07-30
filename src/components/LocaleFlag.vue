<script setup lang="ts">
import type { AppLocale } from '../i18n'

defineProps<{
  locale: AppLocale
}>()
</script>

<template>
  <svg
    class="locale-flag"
    viewBox="0 0 24 16"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Deutschland -->
    <template v-if="locale === 'de'">
      <rect width="24" height="16" fill="#FFCE00" />
      <rect width="24" height="10.67" fill="#DD0000" />
      <rect width="24" height="5.33" fill="#000" />
    </template>

    <!-- Vereinigtes Königreich -->
    <template v-else-if="locale === 'en'">
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" stroke-width="3.2" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" stroke-width="1.6" />
      <path d="M12 0 V16 M0 8 H24" stroke="#fff" stroke-width="5.3" />
      <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" stroke-width="3.2" />
    </template>

    <!-- Spanien -->
    <template v-else-if="locale === 'es'">
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
      <rect x="5" y="6.5" width="3.5" height="3" fill="#AA151B" opacity="0.85" />
    </template>

    <!-- Frankreich -->
    <template v-else-if="locale === 'fr'">
      <rect width="8" height="16" fill="#002395" />
      <rect x="8" width="8" height="16" fill="#fff" />
      <rect x="16" width="8" height="16" fill="#ED2939" />
    </template>
  </svg>
</template>

<style scoped>
.locale-flag {
  display: block;
  width: 1.35rem;
  height: 0.9rem;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}
</style>
