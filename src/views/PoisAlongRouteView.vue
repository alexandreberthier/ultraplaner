<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyGuideSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import '../styles/guidePage.css'

const { t, locale } = useI18n()
const router = useRouter()

function applySeo() {
  applyGuideSeo(locale.value as AppLocale)
}

onMounted(applySeo)
watch(locale, applySeo)

function goHome() {
  void router.push(localeHomePath(locale.value as AppLocale))
}

function goStartApp() {
  void router.push(`${localeHomePath(locale.value as AppLocale)}#app-start`)
}
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
        <h1>{{ t('landing.poiGuide.title') }}</h1>
        <p class="lead">{{ t('landing.poiGuide.lead') }}</p>

        <h2>{{ t('landing.poiGuide.whatTitle') }}</h2>
        <p>{{ t('landing.poiGuide.whatBody') }}</p>

        <h2>{{ t('landing.poiGuide.howTitle') }}</h2>
        <ol>
          <li>{{ t('landing.poiGuide.how1') }}</li>
          <li>{{ t('landing.poiGuide.how2') }}</li>
          <li>{{ t('landing.poiGuide.how3') }}</li>
          <li>{{ t('landing.poiGuide.how4') }}</li>
        </ol>

        <h2>{{ t('landing.poiGuide.gpxTitle') }}</h2>
        <p>{{ t('landing.poiGuide.gpxBody') }}</p>

        <h2>{{ t('landing.poiGuide.exportTitle') }}</h2>
        <p>{{ t('landing.poiGuide.exportBody') }}</p>

        <h2>{{ t('landing.poiGuide.whyTitle') }}</h2>
        <p>{{ t('landing.poiGuide.whyBody') }}</p>

        <h2>{{ t('landing.poiGuide.coverTitle') }}</h2>
        <p>{{ t('landing.poiGuide.coverBody') }}</p>

        <p class="cta-wrap">
          <button type="button" class="cta-primary" @click="goStartApp">
            {{ t('landing.poiGuide.cta') }}
          </button>
        </p>
      </article>

      <footer class="guide-footer">
        <router-link :to="localeHomePath(locale as AppLocale)">UltraPlaner</router-link>
        ·
        <router-link to="/impressum/">{{ t('legal.imprint') }}</router-link>
        ·
        <router-link to="/datenschutz/">{{ t('legal.privacy') }}</router-link>
        ·
        <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">{{ t('legal.portfolio') }}</a>
      </footer>
    </main>
  </div>
</template>
