<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  garminFitPath,
  localeHomePath,
  poisAlongRoutePath,
  racaVersorgungPath,
  type AppLocale,
  type SeoGuideKind,
} from '../i18n'
import { applyTopicGuideSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import '../styles/guidePage.css'

type Section =
  | { kind: 'p'; id: string }
  | { kind: 'ol'; id: string; count: number }

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const guideKind = computed(() => route.meta.guideKind as SeoGuideKind)
const i18nKey = computed(() => `landing.${guideKind.value}`)

const sections = computed((): Section[] => {
  if (guideKind.value === 'racaGuide') {
    return [
      { kind: 'p', id: 'honest' },
      { kind: 'p', id: 'course' },
      { kind: 'ol', id: 'plan', count: 4 },
      { kind: 'p', id: 'gaps' },
      { kind: 'p', id: 'export' },
      { kind: 'p', id: 'device' },
    ]
  }
  return [
    { kind: 'p', id: 'why' },
    { kind: 'p', id: 'connect' },
    { kind: 'ol', id: 'usb', count: 4 },
    { kind: 'p', id: 'limit' },
    { kind: 'p', id: 'build' },
  ]
})

function applySeo() {
  applyTopicGuideSeo(locale.value as AppLocale, guideKind.value)
}

onMounted(applySeo)
watch([locale, guideKind], applySeo)

function goHome() {
  void router.push(localeHomePath(locale.value as AppLocale))
}

function goStartApp() {
  void router.push(`${localeHomePath(locale.value as AppLocale)}#app-start`)
}

const related = computed(() => {
  const loc = locale.value as AppLocale
  if (guideKind.value === 'racaGuide') {
    return [
      { to: poisAlongRoutePath(loc), label: t('landing.racaGuide.relatedSupply') },
      { to: garminFitPath(loc), label: t('landing.racaGuide.relatedGarmin') },
    ]
  }
  return [
    { to: poisAlongRoutePath(loc), label: t('landing.garminFitGuide.relatedSupply') },
    { to: racaVersorgungPath(loc), label: t('landing.garminFitGuide.relatedRaca') },
  ]
})
</script>

<template>
  <div class="guide-page">
    <header class="guide-top">
      <button type="button" class="back-btn" @click="goHome">
        {{ t('landing.backHome') }}
      </button>
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
          <button type="button" class="cta-primary" @click="goStartApp">
            {{ t(`${i18nKey}.cta`) }}
          </button>
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
      </footer>
    </main>
  </div>
</template>
