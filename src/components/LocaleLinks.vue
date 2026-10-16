<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  localeHomePath,
  localeVariantPath,
} from '../i18n'

const { t, locale } = useI18n()
const route = useRoute()

const links = computed(() =>
  SUPPORTED_LOCALES.map((code) => {
    const variant = localeVariantPath(route.path, code)
    return {
      code,
      to: variant ?? localeHomePath(code),
      current: variant != null && locale.value === code,
      label: LOCALE_LABELS[code],
    }
  }),
)
</script>

<template>
  <nav class="locale-links" :aria-label="t('lang.label')">
    <router-link
      v-for="link in links"
      :key="link.code"
      :to="link.to"
      :lang="link.code"
      :aria-current="link.current ? 'page' : undefined"
    >
      {{ link.label }}
    </router-link>
  </nav>
</template>

<style scoped>
.locale-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.85rem;
  margin: 0.55rem 0 0;
}

.locale-links a {
  color: inherit;
  font-weight: 700;
}

.locale-links a[aria-current='page'] {
  text-decoration: none;
}
</style>
