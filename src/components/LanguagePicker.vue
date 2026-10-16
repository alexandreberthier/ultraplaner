<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  localeVariantPath,
  setAppLocale,
  type AppLocale,
} from '../i18n'
import LocaleFlag from './LocaleFlag.vue'

withDefaults(
  defineProps<{
    /** Kleinere Darstellung (nur Fahnen, z. B. in der Sidebar) */
    compact?: boolean
    /** Volle Breite, eine Sprache je Zeile — für das enge Settings-Menü. */
    fill?: boolean
  }>(),
  { compact: false, fill: false }
)

const { locale, t } = useI18n()
const route = useRoute()

function variantPath(code: AppLocale): string | null {
  return localeVariantPath(route.path, code)
}

function pick(code: AppLocale) {
  if (locale.value !== code) setAppLocale(code)
}
</script>

<template>
  <div
    class="lang-picker"
    :class="{ compact, fill }"
    role="group"
    :aria-label="t('lang.label')"
  >
    <template v-for="code in SUPPORTED_LOCALES" :key="code">
      <router-link
        v-if="variantPath(code)"
        :to="variantPath(code)!"
        class="lang-btn"
        :class="{ active: locale === code }"
        :aria-label="LOCALE_LABELS[code]"
        :aria-current="locale === code ? 'page' : undefined"
        :title="LOCALE_LABELS[code]"
        @click="pick(code)"
      >
        <LocaleFlag :locale="code" />
        <span v-if="fill" class="lang-name">{{ LOCALE_LABELS[code] }}</span>
        <span v-else-if="!compact" class="lang-code">{{ code.toUpperCase() }}</span>
      </router-link>
      <button
        v-else
        type="button"
        class="lang-btn"
        :class="{ active: locale === code }"
        :aria-label="LOCALE_LABELS[code]"
        :aria-pressed="locale === code"
        :title="LOCALE_LABELS[code]"
        @click="pick(code)"
      >
        <LocaleFlag :locale="code" />
        <span v-if="fill" class="lang-name">{{ LOCALE_LABELS[code] }}</span>
        <span v-else-if="!compact" class="lang-code">{{ code.toUpperCase() }}</span>
      </button>
    </template>
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
  text-decoration: none;
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

.lang-picker.fill {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  gap: 0.25rem;
}

.lang-picker.fill .lang-btn {
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
  padding: 0.5rem 0.65rem;
}

.lang-code,
.lang-name {
  line-height: 1;
}

.lang-name {
  font-size: 0.88rem;
  letter-spacing: 0;
}
</style>
