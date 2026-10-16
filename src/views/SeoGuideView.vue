<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  localeHomePath,
  poisAlongRoutePath,
  type AppLocale,
  type SeoGuideKind,
} from '../i18n'
import { applyTopicGuideSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import LocaleLinks from '../components/LocaleLinks.vue'
import '../styles/guidePage.css'

type Section =
  | { kind: 'p'; id: string }
  | { kind: 'ol'; id: string; count: number }

const { t, locale } = useI18n()
const route = useRoute()

const guideKind = computed(() => route.meta.guideKind as SeoGuideKind)
const i18nKey = computed(() => `landing.${guideKind.value}`)

const sections = computed((): Section[] => [
  { kind: 'p', id: 'why' },
  { kind: 'p', id: 'connect' },
  { kind: 'ol', id: 'usb', count: 4 },
  { kind: 'p', id: 'limit' },
  { kind: 'p', id: 'build' },
])

function applySeo() {
  applyTopicGuideSeo(locale.value as AppLocale, guideKind.value)
}

onMounted(applySeo)
watch([locale, guideKind], applySeo)

const related = computed(() => {
  const loc = locale.value as AppLocale
  return [{ to: poisAlongRoutePath(loc), label: t('landing.garminFitGuide.relatedSupply') }]
})
</script>

<template>
  <div class="guide-page">
    <header class="guide-top">
      <router-link class="back-btn" :to="localeHomePath(locale as AppLocale)">
        {{ t('landing.backHome') }}
      </router-link>
      <TopbarSettings brutal force-menu />
    </header>

    <main class="guide-body">
      <article>
        <h1>{{ t(`${i18nKey}.title`) }}</h1>
        <p class="lead">{{ t(`${i18nKey}.lead`) }}</p>

        <template v-for="section in sections" :key="section.id">
          <h2>{{ t(`${i18nKey}.${section.id}Title`) }}</h2>
          <p v-if="section.kind === 'p'">{{ t(`${i18nKey}.${section.id}Body`) }}</p>
          <ol v-else>
            <li v-for="n in section.count" :key="n">
              {{ t(`${i18nKey}.${section.id}${n}`) }}
            </li>
          </ol>
        </template>

        <p class="cta-wrap">
          <router-link class="cta-primary" :to="`${localeHomePath(locale as AppLocale)}#app-start`">
            {{ t(`${i18nKey}.cta`) }}
          </router-link>
        </p>

        <nav class="guide-related" :aria-label="t(`${i18nKey}.relatedLabel`)">
          <p v-for="(item, idx) in related" :key="idx">
            <router-link :to="item.to">{{ item.label }}</router-link>
          </p>
        </nav>
      </article>

      <footer class="guide-footer">
        <router-link :to="localeHomePath(locale as AppLocale)">UltraPlaner</router-link>
        ·
        <router-link to="/impressum/">{{ t('legal.imprint') }}</router-link>
        ·
        <router-link to="/datenschutz/">{{ t('legal.privacy') }}</router-link>
        ·
        <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">{{
          t('legal.portfolio')
        }}</a>
        <LocaleLinks />
      </footer>
    </main>
  </div>
</template>
