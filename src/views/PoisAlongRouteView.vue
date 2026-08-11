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
      <button type="button" class="brand" :aria-label="t('landing.backHome')" @click="goHome">
        <picture>
          <source
            srcset="/logo-ultraplaner-64.webp 64w, /logo-ultraplaner-96.webp 96w, /logo-ultraplaner-200.webp 200w"
            sizes="36px"
            type="image/webp"
          />
          <img
            class="brand-logo"
            src="/logo-ultraplaner-64.png"
            srcset="/logo-ultraplaner-64.png 64w, /logo-ultraplaner-96.png 96w, /logo-ultraplaner-200.png 200w"
            sizes="36px"
            alt="UltraPlaner"
            width="64"
            height="64"
            decoding="async"
          />
        </picture>
      </button>
      <TopbarSettings force-menu />
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
  background: var(--bg);
}

.guide-top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 20;
}

.back-btn {
  justify-self: start;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
}

.back-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.brand {
  justify-self: center;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  border-radius: 8px;
}

.brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.brand-logo {
  display: block;
  height: 36px;
  width: auto;
}

.guide-top :deep(.topbar-settings) {
  justify-self: end;
}

.guide-body {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.75rem 1.15rem 3.5rem;
  color: var(--text);
  line-height: 1.65;
}

.guide-body h1 {
  margin: 0 0 0.75rem;
  font-size: 1.85rem;
  color: var(--primary-dark);
  letter-spacing: -0.02em;
}

.lead {
  margin: 0 0 1.5rem;
  font-size: 1.05rem;
  color: var(--text);
}

.guide-body h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.2rem;
  color: var(--primary-dark);
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
  border: none;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.75rem 1.25rem;
  cursor: pointer;
}

.cta-primary:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: 2px;
}

.guide-footer {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
  font-size: 0.88rem;
  color: var(--text-muted);
}

.guide-footer a {
  color: var(--primary);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

@media (max-width: 640px) {
  .guide-top {
    grid-template-columns: auto 1fr auto;
  }

  .back-btn {
    font-size: 0.85rem;
    padding: 0.4rem 0.55rem;
  }

  .guide-body {
    padding: 1.25rem 1rem 2.75rem;
  }

  .guide-body h1 {
    font-size: 1.5rem;
  }
}
</style>
