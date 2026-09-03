<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  garminFitPath,
  isLocaleHomePath,
  localeHomePath,
  poisAlongRoutePath,
  racaVersorgungPath,
  setAppLocale,
  type AppLocale,
} from '../i18n'
import LocaleFlag from './LocaleFlag.vue'

withDefaults(
  defineProps<{
    /** Kleinere Darstellung (nur Fahnen, z. B. in der Sidebar) */
    compact?: boolean
  }>(),
  { compact: false }
)

const { locale, t } = useI18n()
const route = useRoute()
const router = useRouter()

function cleanPath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

function isPoisGuidePath(path: string): boolean {
  const clean = cleanPath(path)
  return (
    clean === '/versorgung-ultracycling' ||
    clean === '/en/ultracycling-supply' ||
    clean === '/es/avituallamiento-ultracycling' ||
    clean === '/fr/ravitaillement-ultracycling' ||
    clean === '/pois-entlang-der-route' ||
    clean === '/en/pois-along-route' ||
    clean === '/es/pois-en-la-ruta' ||
    clean === '/fr/pois-sur-la-route'
  )
}

function isRacaGuidePath(path: string): boolean {
  const clean = cleanPath(path)
  return (
    clean === '/raca-versorgung' ||
    clean === '/en/raca-supply' ||
    clean === '/es/raca-avituallamiento' ||
    clean === '/fr/raca-ravitaillement'
  )
}

function isGarminFitGuidePath(path: string): boolean {
  const clean = cleanPath(path)
  return (
    clean === '/garmin-course-points-fit' ||
    clean === '/en/garmin-course-points-fit' ||
    clean === '/es/garmin-course-points-fit' ||
    clean === '/fr/garmin-course-points-fit'
  )
}

function pick(code: AppLocale) {
  if (locale.value !== code) setAppLocale(code)
  if (isLocaleHomePath(route.path)) {
    const next = localeHomePath(code)
    if (route.path !== next && route.path !== next.replace(/\/$/, '')) {
      void router.replace(next)
    }
  } else if (isPoisGuidePath(route.path)) {
    const next = poisAlongRoutePath(code)
    if (cleanPath(route.path) !== cleanPath(next)) void router.replace(next)
  } else if (isRacaGuidePath(route.path)) {
    const next = racaVersorgungPath(code)
    if (cleanPath(route.path) !== cleanPath(next)) void router.replace(next)
  } else if (isGarminFitGuidePath(route.path)) {
    const next = garminFitPath(code)
    if (cleanPath(route.path) !== cleanPath(next)) void router.replace(next)
  }
}
</script>

<template>
  <div
    class="lang-picker"
    :class="{ compact }"
    role="group"
    :aria-label="t('lang.label')"
  >
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      class="lang-btn"
      :class="{ active: locale === code }"
      :aria-label="LOCALE_LABELS[code]"
      :aria-pressed="locale === code"
      :title="LOCALE_LABELS[code]"
      @click="pick(code)"
    >
      <LocaleFlag :locale="code" />
      <span v-if="!compact" class="lang-code">{{ code.toUpperCase() }}</span>
    </button>
  </div>
</template>

<style scoped>
.lang-picker {
  display: inline-flex;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.lang-picker.compact {
  gap: 0.15rem;
  padding: 0.15rem;
  border-radius: var(--radius);
}

.lang-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 2.85rem;
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.lang-picker.compact .lang-btn {
  min-width: 2.5rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.45rem;
  border-radius: var(--radius);
}

@media (hover: hover) {
  .lang-btn:hover:not(.active) {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
}

.lang-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--primary) 35%, transparent);
}

.lang-picker.compact :deep(.locale-flag) {
  width: 1.4rem;
  height: 0.95rem;
}

.lang-code {
  line-height: 1;
}
</style>
