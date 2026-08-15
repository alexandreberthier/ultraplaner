<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyGuideSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'

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

<style scoped>
.guide-page {
  min-height: 100%;
  background: #f3efe6;
}

.guide-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 58px;
  padding: 0.7rem 1rem;
  border-bottom: 3px solid #111;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 20;
}

.back-btn {
  border: 2px solid #111;
  background: var(--cta);
  border-radius: 0;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  font-weight: 800;
  color: #111;
  box-shadow: 3px 3px 0 #111;
}

.back-btn:hover {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 #111;
}

.back-btn:focus-visible {
  outline: 3px solid #111;
  outline-offset: 2px;
}

.guide-body {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.75rem 1.15rem 3.5rem;
  color: #111;
  line-height: 1.65;
}

.guide-body h1 {
  margin: 0 0 0.75rem;
  font-size: 1.85rem;
  color: #111;
  letter-spacing: -0.02em;
  font-weight: 800;
}

.lead {
  margin: 0 0 1.5rem;
  font-size: 1.05rem;
  color: #111;
}

.guide-body h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.2rem;
  color: #111;
  font-weight: 800;
}

.guide-body p,
.guide-body ol {
  margin: 0 0 0.9rem;
  font-size: 0.95rem;
}

.guide-body ol {
  padding-left: 1.2rem;
}

.guide-body li {
  margin-bottom: 0.35rem;
}

.cta-wrap {
  margin-top: 2rem;
}

.cta-primary {
  border-radius: 0;
  padding: 0.85rem 1.4rem;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  background: var(--cta);
  color: #111;
  border: 3px solid #111;
  box-shadow: 5px 5px 0 #111;
}

.cta-primary:hover {
  transform: translate(3px, 3px);
  box-shadow: 3px 3px 0 #111;
}

.cta-primary:focus-visible {
  outline: 3px solid #111;
  outline-offset: 2px;
}

.guide-footer {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 3px solid #111;
  font-size: 0.88rem;
  color: #111;
}

.guide-footer a {
  color: #111;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

@media (max-width: 640px) {
  .back-btn {
    font-size: 0.85rem;
    padding: 0.55rem 0.7rem;
  }

  .guide-body {
    padding: 1.25rem 1rem 2.75rem;
  }

  .guide-body h1 {
    font-size: 1.5rem;
  }
}
</style>
