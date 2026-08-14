<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GpxForm from '../components/GpxForm.vue'
import RecentMaps from '../components/RecentMaps.vue'
import TopbarSettings from '../components/TopbarSettings.vue'
import FeedbackForm from '../components/FeedbackForm.vue'
import { localeHomePath, poisAlongRoutePath, type AppLocale } from '../i18n'
import { useRouter } from 'vue-router'
import { useMapStore } from '../stores/mapStore'
import {
  NEARBY_DEFAULT_POI_CATEGORIES,
  NEARBY_DEFAULT_POI_RADIUS_M,
} from '../config/poiCategories'
import {
  nearbyGeoBlockedReason,
  nearbyGeoErrorI18nKey,
  NEARBY_GEO_OPTIONS,
} from '../utils/nearbyGeo'

/** MapLibre only when user opens „Route planen“ — keeps landing light. */
const RoutePlanner = defineAsyncComponent(() => import('../components/RoutePlanner.vue'))
const NearbyForm = defineAsyncComponent(() => import('../components/NearbyForm.vue'))

const { t, locale } = useI18n()
const router = useRouter()
const store = useMapStore()
const tab = ref<'gpx' | 'plan' | 'nearby'>('gpx')
const appRef = ref<HTMLElement | null>(null)
const plannerRef = ref<{
  hasDraft: () => boolean
  toggleExportMenu: () => void
  closeExportMenu: () => void
} | null>(null)
const plannerCanExport = ref(false)
const nearbyPending = ref(false)

function scrollToApp() {
  appRef.value?.scrollIntoView({ behavior: 'smooth' })
}

/** GPS in the click handler (iOS gesture). Form loads only if geo fails. */
function startNearbyMapFirst() {
  tab.value = 'nearby'
  nearbyPending.value = true
  store.error = ''

  const blocked = nearbyGeoBlockedReason()
  if (blocked === 'insecure') {
    store.error = t('nearby.geoInsecure')
    nearbyPending.value = false
    return
  }
  if (blocked === 'unsupported') {
    store.error = t('nearby.geoUnsupported')
    nearbyPending.value = false
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        store.prepareNearbyCenter(
          pos.coords.latitude,
          pos.coords.longitude,
          NEARBY_DEFAULT_POI_RADIUS_M,
          [...NEARBY_DEFAULT_POI_CATEGORIES]
        )
        await router.push('/map/view')
        await store.refreshNearbyPois(
          NEARBY_DEFAULT_POI_RADIUS_M,
          [...NEARBY_DEFAULT_POI_CATEGORIES]
        )
      } catch (err) {
        store.error = err instanceof Error ? err.message : t('store.unknownError')
        nearbyPending.value = false
      }
    },
    (err) => {
      store.error = t(nearbyGeoErrorI18nKey(err.code))
      nearbyPending.value = false
    },
    NEARBY_GEO_OPTIONS
  )
}

function leavePlanMode() {
  if (plannerRef.value?.hasDraft?.()) {
    if (!window.confirm(t('landing.discardPlan'))) return
  }
  plannerRef.value?.closeExportMenu?.()
  plannerCanExport.value = false
  tab.value = 'gpx'
  void router.push(localeHomePath(locale.value as AppLocale))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function togglePlannerExport() {
  plannerRef.value?.toggleExportMenu?.()
}

function goStart() {
  if (tab.value === 'plan') {
    leavePlanMode()
    return
  }
  tab.value = 'gpx'
  void router.push(localeHomePath(locale.value as AppLocale))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const features = [
  { key: 'pois' },
  { key: 'eta' },
  { key: 'elevation' },
  { key: 'weather' },
  { key: 'export' },
  { key: 'europe' },
] as const

const steps = [
  { key: 'step1', num: '01' },
  { key: 'step2', num: '02' },
  { key: 'step3', num: '03' },
] as const

const faqs = ['q1', 'q17', 'q3', 'q6', 'q19', 'q13', 'q14', 'q11'] as const
const updates = [
  { key: 'coros', kind: 'new' },
  { key: 'mobileUx', kind: 'new' },
  { key: 'cemeteries', kind: 'new' },
  { key: 'wahoo', kind: 'new' },
] as const
const openFaq = ref<string | null>(null)
function toggleFaq(key: string) {
  openFaq.value = openFaq.value === key ? null : key
}

const supplyGuidePath = () => poisAlongRoutePath(locale.value as AppLocale)
</script>

<template>
  <div class="landing" :class="{ 'plan-fullscreen': tab === 'plan' }">
    <a href="#app-start" class="skip-link">{{ t('landing.skipToContent') }}</a>

    <main id="main-content">
    <template v-if="tab === 'plan'">
      <header class="plan-topbar">
        <button type="button" class="back-btn" @click="leavePlanMode">
          {{ t('landing.backHome') }}
        </button>
        <button type="button" class="plan-brand" aria-label="UltraPlaner" @click="leavePlanMode">
          <picture>
            <source
              srcset="/logo-ultraplaner-64.webp 64w, /logo-ultraplaner-96.webp 96w, /logo-ultraplaner-200.webp 200w"
              sizes="28px"
              type="image/webp"
            />
            <img
              class="plan-brand-logo"
              src="/logo-ultraplaner-64.png"
              srcset="/logo-ultraplaner-64.png 64w, /logo-ultraplaner-96.png 96w, /logo-ultraplaner-200.png 200w"
              sizes="28px"
              alt="UltraPlaner"
              width="64"
              height="64"
              decoding="async"
            />
          </picture>
        </button>
        <div class="plan-topbar-actions">
          <button
            type="button"
            class="plan-export-btn"
            :disabled="!plannerCanExport"
            :title="t('map.exportRoute')"
            @click="togglePlannerExport"
          >
            ↓ {{ t('map.exportRoute') }} ▾
          </button>
          <TopbarSettings force-menu />
        </div>
      </header>
      <section
        id="tabpanel-plan"
        class="planner-stage"
        role="tabpanel"
        aria-labelledby="tab-plan"
      >
        <RoutePlanner ref="plannerRef" @can-export-change="plannerCanExport = $event" />
      </section>
    </template>

    <template v-else>
      <div class="hero-band">
        <div class="hero-media">
          <picture>
            <source
              media="(min-width: 641px)"
              type="image/webp"
              srcset="/hero-mountains-800.webp 800w, /hero-mountains-1100.webp 1100w, /hero-mountains.webp 1536w"
              sizes="100vw"
            />
            <img
              class="hero-photo"
              src="/hero-mountains-480.webp"
              :alt="t('seo.heroImageAlt')"
              width="480"
              height="320"
              fetchpriority="high"
            />
          </picture>
          <div class="hero-scrim" aria-hidden="true" />
        </div>

        <header class="hero">
          <div class="hero-top">
            <button type="button" class="brand-lockup" aria-label="UltraPlaner" @click="goStart">
              <picture>
                <source
                  srcset="/logo-ultraplaner-64.webp 64w, /logo-ultraplaner-96.webp 96w, /logo-ultraplaner-200.webp 200w"
                  sizes="26px"
                  type="image/webp"
                />
                <img
                  class="brand-logo"
                  src="/logo-ultraplaner-64.png"
                  srcset="/logo-ultraplaner-64.png 64w, /logo-ultraplaner-96.png 96w, /logo-ultraplaner-200.png 200w"
                  sizes="26px"
                  alt="UltraPlaner"
                  width="64"
                  height="64"
                  decoding="async"
                />
              </picture>
            </button>
            <TopbarSettings brutal />
          </div>

          <div class="page-wrap hero-wrap">
            <div class="hero-center">
              <h1 class="hero-title">
                <span class="hero-title-lead">{{ t('landing.heroLine1') }}</span>
                <span class="hero-title-route">{{ t('landing.heroLine2') }}</span>
              </h1>
              <p class="hero-sub">{{ t('landing.heroSub') }}</p>
              <div class="cta-row">
                <button type="button" class="cta-primary" @click="scrollToApp">
                  {{ t('landing.startCta') }}
                </button>
              </div>
            </div>
          </div>
        </header>
      </div>

      <div class="page-wrap">
        <div class="stats-bar">
          <div class="stat">
            <strong>{{ t('landing.stats.regions') }}</strong>
            <span>{{ t('landing.stats.regionsDesc') }}</span>
          </div>
          <div class="stat-sep" />
          <div class="stat">
            <strong>{{ t('landing.stats.pois') }}</strong>
            <span>{{ t('landing.stats.poisDesc') }}</span>
          </div>
          <div class="stat-sep" />
          <div class="stat">
            <strong>{{ t('landing.stats.categories') }}</strong>
            <span>{{ t('landing.stats.categoriesDesc') }}</span>
          </div>
        </div>

        <section id="app-start" ref="appRef" class="app-section" tabindex="-1">
          <div class="section-head">
            <h2>{{ t('landing.appTitle') }}</h2>
          </div>

          <div class="mode-tabs" role="tablist" aria-label="App-Modus">
            <button
              id="tab-gpx"
              type="button"
              role="tab"
              aria-controls="tabpanel-app"
              :aria-selected="tab === 'gpx'"
              :tabindex="tab === 'gpx' ? 0 : -1"
              :class="{ active: tab === 'gpx' }"
              @click="tab = 'gpx'"
            >
              {{ t('landing.uploadGpx') }}
            </button>
            <button
              id="tab-plan"
              type="button"
              role="tab"
              class="mode-plan"
              aria-controls="tabpanel-plan"
              aria-selected="false"
              tabindex="-1"
              @click="tab = 'plan'"
            >
              {{ t('landing.planRoute') }}
            </button>
            <button
              id="tab-nearby"
              type="button"
              role="tab"
              aria-controls="tabpanel-app"
              :aria-selected="tab === 'nearby'"
              :tabindex="tab === 'nearby' ? 0 : -1"
              :class="{ active: tab === 'nearby' }"
              @click="startNearbyMapFirst"
            >
              {{ t('landing.nearby') }}
            </button>
          </div>

          <section
            id="tabpanel-app"
            class="hero-card"
            role="tabpanel"
            :aria-labelledby="tab === 'nearby' ? 'tab-nearby' : 'tab-gpx'"
          >
            <p v-if="tab === 'nearby' && nearbyPending" class="nearby-pending">
              {{ t('nearby.searching') }}
            </p>
            <NearbyForm v-else-if="tab === 'nearby'" />
            <GpxForm v-if="tab === 'gpx'" />
          </section>
          <RecentMaps />
        </section>

        <section class="how-section">
          <h2>{{ t('landing.how.title') }}</h2>
          <div class="steps">
            <article v-for="s in steps" :key="s.key" class="step">
              <div class="step-num" aria-hidden="true">{{ s.num }}</div>
              <div>
                <strong>{{ t(`landing.how.${s.key}`) }}</strong>
                <p>{{ t(`landing.how.${s.key}desc`) }}</p>
              </div>
            </article>
          </div>
        </section>

        <section class="features-section">
          <h2>{{ t('landing.features.title') }}</h2>
          <div class="features-grid">
            <article v-for="f in features" :key="f.key" class="feature-card">
              <strong>{{ t(`landing.features.${f.key}`) }}</strong>
              <p>{{ t(`landing.features.${f.key}Desc`) }}</p>
            </article>
          </div>
        </section>

        <section class="guide-teaser" aria-labelledby="guide-teaser-heading">
          <h2 id="guide-teaser-heading">{{ t('landing.guideTeaser.title') }}</h2>
          <p>{{ t('landing.guideTeaser.body') }}</p>
          <router-link class="guide-teaser-link" :to="supplyGuidePath()">
            {{ t('landing.guideTeaser.link') }}
          </router-link>
        </section>

        <section class="updates-section" aria-labelledby="updates-heading">
          <h2 id="updates-heading">{{ t('landing.updates.title') }}</h2>
          <p class="updates-lead">{{ t('landing.updates.lead') }}</p>
          <ul class="updates-list">
            <li v-for="u in updates" :key="u.key" class="updates-row">
              <span class="updates-tag" :data-kind="u.kind">{{
                t(`landing.updates.kind.${u.kind}`)
              }}</span>
              <span>{{ t(`landing.updates.items.${u.key}`) }}</span>
            </li>
          </ul>
        </section>

        <section class="faq-section" aria-labelledby="faq-heading">
          <h2 id="faq-heading">{{ t('landing.faq.title') }}</h2>
          <div class="faq-list">
            <div v-for="q in faqs" :key="q" class="faq-item">
              <button
                class="faq-q"
                type="button"
                :id="`faq-btn-${q}`"
                :aria-expanded="openFaq === q"
                :aria-controls="`faq-panel-${q}`"
                @click="toggleFaq(q)"
              >
                <span>{{ t(`landing.faq.${q}`) }}</span>
                <span class="faq-chevron" :class="{ open: openFaq === q }" aria-hidden="true">›</span>
              </button>
              <div
                :id="`faq-panel-${q}`"
                class="faq-a"
                role="region"
                :aria-labelledby="`faq-btn-${q}`"
                :hidden="openFaq !== q"
              >
                {{ t(`landing.faq.a${q.slice(1)}`) }}
              </div>
            </div>
          </div>
        </section>

        <FeedbackForm />

        <footer class="site-footer">
          <p>
            © {{ new Date().getFullYear() }} UltraPlaner ·
            <router-link :to="supplyGuidePath()">{{ t('legal.poisGuide') }}</router-link>
            ·
            <router-link to="/impressum/">{{ t('legal.imprint') }}</router-link>
            ·
            <router-link to="/datenschutz/">{{ t('legal.privacy') }}</router-link>
            · Daten:
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
            ·
            <a href="https://www.geofabrik.de" target="_blank" rel="noopener">Geofabrik</a>
            ·
            <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">{{ t('legal.portfolio') }}</a>
          </p>
        </footer>
      </div>
    </template>
    </main>
  </div>
</template>

<style scoped>
.skip-link {
  position: absolute;
  left: 0.75rem;
  top: 0.75rem;
  z-index: 1000;
  padding: 0.55rem 0.9rem;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-150%);
  transition: transform 0.15s ease;
}

.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--primary-dark);
  outline-offset: 2px;
}

.landing {
  min-height: 100%;
  background: #f3efe6;
  color: #111;
  --display: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.landing.plan-fullscreen {
  /* vh fallback first; dvh accounts for Safari collapsing URL bar */
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.landing.plan-fullscreen > main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-wrap {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding-inline: max(1.25rem, env(safe-area-inset-left, 0px));
  padding-inline-end: max(1.25rem, env(safe-area-inset-right, 0px));
  box-sizing: border-box;
}

/* ── Hero band ── */
.hero-band {
  position: relative;
  isolation: isolate;
  min-height: min(48vh, 520px);
  display: flex;
  align-items: stretch;
  border-bottom: 3px solid #111;
  overflow: hidden;
}

.hero-media {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
  display: block;
  filter: saturate(1.05) contrast(1.08);
}

.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.62) 0%,
      rgba(0, 0, 0, 0.28) 42%,
      rgba(0, 0, 0, 0.08) 100%
    ),
    linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.4) 0%,
      rgba(0, 0, 0, 0.18) 36%,
      rgba(0, 0, 0, 0.82) 100%
    );
}

.hero-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding-inline: max(1.25rem, env(safe-area-inset-left, 0px));
  padding-inline-end: max(1.25rem, env(safe-area-inset-right, 0px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: flex-end;
}

.hero {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: min(48vh, 520px);
  padding: 0 0 4.25rem;
}

.hero-top {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  box-sizing: border-box;
  padding: max(0.45rem, env(safe-area-inset-top, 0px))
    max(0.75rem, env(safe-area-inset-right, 0px))
    0.15rem
    max(0.75rem, env(safe-area-inset-left, 0px));
  min-width: 0;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  flex-shrink: 1;
  padding: 0.35rem 0.6rem 0.35rem 0.4rem;
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  box-shadow: 4px 4px 0 #111;
  cursor: pointer;
  font: inherit;
}

.brand-logo {
  display: block;
  height: 1.85rem;
  width: auto;
  max-width: min(190px, 46vw);
  object-fit: contain;
}

.hero-center {
  margin: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: min(100%, 58rem);
  width: 100%;
  align-self: flex-start;
  padding: 0.85rem 0 0;
}

.hero-title {
  font-family: 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: clamp(2.15rem, 6.2vw, 4.4rem);
  font-weight: 800;
  color: #fff;
  margin: 0 0 0.7rem;
  line-height: 0.95;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  text-shadow: 3px 3px 0 #111;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.hero-title-lead {
  font-size: 0.42em;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.05;
  margin-bottom: 0.18em;
  opacity: 1;
  text-shadow: 2px 2px 0 #111;
}

.hero-title-route {
  white-space: normal;
  letter-spacing: 0.012em;
}

.hero-sub {
  display: inline-block;
  font-size: clamp(0.95rem, 1.55vw, 1.08rem);
  color: #fff;
  margin: 0 0 1.15rem;
  line-height: 1.4;
  max-width: 28rem;
  font-weight: 700;
  background: #111;
  padding: 0.5rem 0.7rem;
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
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}

.cta-primary:hover {
  background: var(--cta);
  transform: translate(3px, 3px);
  box-shadow: 3px 3px 0 #111;
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: flex-start;
  align-items: center;
}

.stats-bar {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  align-items: stretch;
  gap: 0;
  margin-top: -2.75rem;
  margin-bottom: 4.25rem;
  position: relative;
  z-index: 3;
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  padding: 0;
  box-shadow: 5px 5px 0 #111;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 1.15rem 1.25rem 1.25rem;
  border-right: 3px solid #111;
  text-align: left;
}

.stat:last-child {
  border-right: none;
}

.stat:first-child {
  background: var(--cta);
}

.stat strong {
  font-family: var(--display);
  font-size: clamp(1.2rem, 2.4vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: #111;
  text-transform: uppercase;
}

.stat span {
  font-size: 0.78rem;
  font-weight: 700;
  color: #111;
  opacity: 0.7;
}

.stat-sep {
  display: none;
}

/* ── App section ── */
.app-section {
  scroll-margin-top: 1.5rem;
  padding-top: 0.5rem;
}

.section-head {
  margin-bottom: 1.1rem;
}

.section-head h2 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.55rem, 2.8vw, 2.35rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  text-transform: uppercase;
  color: #111;
  white-space: nowrap;
}

.section-head p {
  margin: 0;
  color: #111;
  font-size: 0.92rem;
}

.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 0;
  border: 3px solid #111;
  border-bottom: none;
}

.mode-tabs button {
  flex: 1;
  padding: 0.85rem 0.7rem;
  border: none;
  border-right: 3px solid #111;
  border-radius: 0;
  background: #fff;
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  color: #111;
}

.mode-tabs button:last-child {
  border-right: none;
}

.mode-tabs button.active {
  background: #111;
  color: #fff;
}

.hero-card {
  background: #fff;
  border: 3px solid #111;
  border-radius: 0;
  padding: 1.35rem 1.4rem 1.5rem;
  box-shadow: 5px 5px 0 #111;
}

.hero-card[hidden] {
  display: none;
}

.nearby-pending {
  margin: 0;
  padding: 0.85rem 0.2rem;
  color: #111;
  font-size: 0.95rem;
  font-weight: 700;
}

.landing :deep(.menu-btn) {
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  box-shadow: 4px 4px 0 #111;
}

.landing :deep(.hero-card .field-label),
.landing :deep(.hero-card legend) {
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: #111;
}

.landing :deep(.hero-card .cat-chip) {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  font-weight: 700;
}

.landing :deep(.hero-card .cat-chip.active) {
  background: var(--cta);
  color: #111;
  border-color: #111;
}

.landing :deep(.hero-card .btn-primary),
.landing :deep(.feedback-submit) {
  border: 3px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  box-shadow: 4px 4px 0 #111;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.landing :deep(.hero-card .btn-primary:disabled) {
  background: #e8e4dc;
  color: #111;
  box-shadow: none;
  opacity: 1;
}

.landing :deep(.hero-card .radius-value) {
  border-radius: 0;
  border: 2px solid #111;
  background: #fff;
  color: #111;
  box-shadow: 3px 3px 0 #111;
}

.landing :deep(.hero-card .radius-slider)::-webkit-slider-runnable-track,
.landing :deep(.hero-card .radius-row input[type='range'])::-webkit-slider-runnable-track {
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
}

.landing :deep(.hero-card .radius-slider)::-moz-range-track,
.landing :deep(.hero-card .radius-row input[type='range'])::-moz-range-track {
  border-radius: 0;
  background: #d8d2c6;
  border: 2px solid #111;
}

.landing :deep(.hero-card .radius-slider)::-webkit-slider-thumb,
.landing :deep(.hero-card .radius-row input[type='range'])::-webkit-slider-thumb {
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: 3px 3px 0 #111;
}

.landing :deep(.hero-card .radius-slider)::-moz-range-thumb,
.landing :deep(.hero-card .radius-row input[type='range'])::-moz-range-thumb {
  border-radius: 0;
  border: 3px solid #111;
  background: var(--cta);
  box-shadow: 3px 3px 0 #111;
}

.landing :deep(.hero-card .load-summary),
.landing :deep(.hero-card .ios-geo-hint) {
  border-radius: 0;
  border: 2px solid #111;
  background: #f3efe6;
  color: #111;
}

.landing :deep(.recent-maps) {
  margin-top: 2.25rem;
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  box-shadow: 5px 5px 0 #111;
}

.landing :deep(.recent-head h2) {
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #111;
}

.landing :deep(.recent-head p) {
  color: #111;
  opacity: 0.65;
}

.landing :deep(.recent-open),
.landing :deep(.recent-remove) {
  border: 2px solid #111;
  border-radius: 0;
}

.landing :deep(.recent-open) {
  background: #f3efe6;
}

.landing :deep(.recent-open:hover) {
  background: #fff;
  border-color: #111;
}

.landing :deep(.recent-meta) {
  color: #111;
  opacity: 0.62;
}

.landing :deep(.recent-remove:hover) {
  background: #111;
  color: #fff;
  border-color: #111;
}

.landing :deep(.feedback) {
  margin-top: 6.5rem;
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  box-shadow: 5px 5px 0 #111;
}

.landing :deep(.feedback h2) {
  font-family: var(--display);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  color: #111;
  white-space: nowrap;
}

.landing :deep(.field input),
.landing :deep(.field textarea) {
  border: 2px solid #111;
  border-radius: 0;
  background: #f3efe6;
}

/* ── Sections ── */
.features-section,
.how-section,
.guide-teaser,
.updates-section,
.faq-section {
  margin-top: 6.5rem;
}

.how-section {
  margin-top: 6.25rem;
}

.features-section h2,
.how-section h2,
.guide-teaser h2,
.updates-section h2,
.faq-section h2 {
  font-family: var(--display);
  font-size: clamp(1.55rem, 2.8vw, 2.35rem);
  font-weight: 800;
  color: #111;
  margin: 0 0 1.5rem;
  letter-spacing: -0.02em;
  line-height: 1.05;
  text-transform: uppercase;
  white-space: nowrap;
}

.guide-teaser p {
  margin: -0.4rem 0 1.1rem;
  max-width: 36rem;
  color: #111;
  line-height: 1.45;
  font-size: 1.02rem;
}

.guide-teaser-link {
  display: inline-block;
  font-weight: 800;
  color: #111;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: none;
  border: 3px solid #111;
  padding: 0.55rem 0.9rem;
  background: var(--cta);
  box-shadow: 4px 4px 0 #111;
}

.updates-section h2 {
  margin-bottom: 0.45rem;
}

.updates-lead {
  margin: 0 0 1.1rem;
  font-size: 0.92rem;
  color: #111;
  line-height: 1.45;
}

.updates-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 3px solid #111;
  background: #fff;
}

.updates-row {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.85rem 1rem;
  border-bottom: 3px solid #111;
  font-size: 0.95rem;
  line-height: 1.4;
  font-weight: 650;
}

.updates-row:last-child {
  border-bottom: none;
}

.updates-tag {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #111;
  background: var(--cta);
  padding: 0.15rem 0.4rem;
}

.updates-tag[data-kind='fix'] {
  background: #111;
  color: #fff;
}

.updates-tag[data-kind='bug'] {
  background: #bc4749;
  color: #fff;
}

.features-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr 1fr;
  gap: 0;
  border-top: 3px solid #111;
  border-left: 3px solid #111;
}

.feature-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  align-items: flex-start;
  background: #fff;
  border: none;
  border-right: 3px solid #111;
  border-bottom: 3px solid #111;
  border-radius: 0;
  padding: 1.25rem 1.2rem 1.4rem;
}

.feature-card:first-child {
  grid-column: 1;
  grid-row: 1 / span 2;
  background: #111;
  color: #fff;
  justify-content: flex-end;
  min-height: 16rem;
}

.feature-card:first-child p {
  color: rgba(255, 255, 255, 0.78);
}

.feature-card:hover {
  background: #fff;
}

.feature-card:first-child:hover {
  background: #111;
}

.feature-card strong {
  display: block;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin-bottom: 0;
  text-transform: uppercase;
}

.feature-card:first-child strong {
  font-family: var(--display);
  font-size: clamp(1.25rem, 2.2vw, 1.75rem);
  font-weight: 800;
  line-height: 1.12;
}

.feature-card p {
  margin: 0;
  font-size: 0.88rem;
  color: #333;
  line-height: 1.45;
}

.steps {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 0;
  border-top: 3px solid #111;
  border-left: 3px solid #111;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  align-items: flex-start;
  background: #fff;
  border: none;
  border-right: 3px solid #111;
  border-bottom: 3px solid #111;
  border-radius: 0;
  padding: 1.2rem 1.15rem 1.4rem;
}

.step:first-child {
  background: var(--cta);
}

.step-num {
  width: auto;
  height: auto;
  border-radius: 0;
  background: none;
  color: #111;
  font-family: var(--display);
  font-weight: 800;
  font-size: clamp(2.1rem, 4vw, 3.2rem);
  line-height: 0.9;
  display: block;
  letter-spacing: -0.03em;
}

.step strong {
  display: block;
  font-size: 1.05rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 0.15rem;
  letter-spacing: -0.02em;
}

.step p {
  margin: 0;
  font-size: 0.88rem;
  color: #111;
  line-height: 1.45;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 3px solid #111;
  background: #fff;
}

.faq-item {
  border: none;
  border-bottom: 3px solid #111;
  border-radius: 0;
  background: #fff;
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-item:focus-within {
  border-color: inherit;
  box-shadow: none;
  background: #fff8f0;
}

.faq-q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.05rem 1.15rem;
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  text-align: left;
  font-size: 1rem;
  font-weight: 800;
  color: #111;
}

.faq-q:focus {
  outline: none;
}

.faq-q:focus-visible {
  outline: 3px solid #111;
  outline-offset: -3px;
  background: var(--cta);
}

.faq-chevron {
  font-size: 1.4rem;
  color: #111;
  transform: rotate(0deg);
  transition: transform 0.15s;
  flex-shrink: 0;
  font-weight: 800;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-a {
  padding: 0 1.15rem 1.1rem;
  font-size: 0.9rem;
  color: #111;
  line-height: 1.55;
}

.faq-a[hidden] {
  display: none;
}

.site-footer {
  margin: 6.5rem 0 2.5rem;
  padding-top: 1.25rem;
  border-top: 3px solid #111;
  text-align: left;
  font-size: 0.78rem;
  font-weight: 650;
  color: #111;
}

.site-footer a {
  color: #111;
  text-decoration: underline;
  text-underline-offset: 2px;
}


/* ── Plan topbar ── */
.plan-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 40;
}

.back-btn {
  border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border));
  background: var(--primary);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}

.back-btn:hover {
  background: var(--primary-dark, #1b4332);
}

.plan-brand {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.plan-brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 6px;
}

.plan-brand-logo {
  display: block;
  height: 1.75rem;
  width: auto;
  max-width: min(180px, 42vw);
  object-fit: contain;
  object-position: left center;
  pointer-events: none;
}

.plan-topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  margin-left: auto;
}

.plan-export-btn {
  border: 1px solid var(--border);
  background: var(--surface-2, var(--bg));
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
  min-height: 40px;
  -webkit-tap-highlight-color: transparent;
}

.plan-export-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.plan-export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .plan-topbar {
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    min-height: 56px;
  }

  .back-btn {
    min-width: 48px;
    min-height: 48px;
    padding: 0.65rem 0.85rem;
    font-size: 0.9rem;
    border-radius: 10px;
  }

  .plan-export-btn {
    min-width: 48px;
    min-height: 48px;
    padding: 0.65rem 0.8rem;
    font-size: 0.88rem;
    border-radius: 10px;
  }

  .plan-topbar-actions {
    gap: 0.4rem;
  }

  .plan-topbar-actions :deep(.menu-btn) {
    width: 52px;
    height: 52px;
    border-radius: 12px;
  }

  .plan-topbar-actions :deep(.menu-icon) {
    font-size: 1.55rem;
  }
}

@media (max-width: 520px) {
  .plan-export-btn {
    padding: 0.65rem 0.65rem;
    font-size: 0.82rem;
  }

  .back-btn {
    padding: 0.65rem 0.7rem;
    font-size: 0.85rem;
  }
}

.planner-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}


@media (max-width: 960px) {
  .section-head h2,
  .features-section h2,
  .how-section h2,
  .guide-teaser h2,
  .updates-section h2,
  .faq-section h2,
  .landing :deep(.feedback h2) {
    white-space: normal;
  }

  .features-grid,
  .steps,
  .stats-bar {
    grid-template-columns: 1fr 1fr;
  }

  .feature-card:first-child {
    grid-column: 1 / -1;
    grid-row: auto;
    min-height: 10rem;
  }

  .step:first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .hero-band,
  .hero {
    min-height: min(46vh, 440px);
  }

  .hero {
    padding-bottom: 3.5rem;
  }

  .hero-center {
    padding: 0.6rem 0 0;
    text-align: left;
    align-items: flex-start;
    align-self: flex-start;
  }

  .hero-title {
    font-size: clamp(1.85rem, 10.5vw, 2.85rem);
    letter-spacing: 0.015em;
  }

  .cta-row {
    justify-content: flex-start;
  }

  .hero-sub {
    font-size: 0.92rem;
    max-width: 100%;
  }

  .brand-logo {
    height: 1.65rem;
  }

  .stats-bar,
  .features-grid,
  .steps {
    grid-template-columns: 1fr;
  }

  .stats-bar {
    margin-top: -1.75rem;
    margin-bottom: 3.25rem;
    box-shadow: 5px 5px 0 #111;
  }

  .stat {
    border-right: none;
    border-bottom: 3px solid #111;
  }

  .stat:last-child {
    border-bottom: none;
  }

  .mode-tabs button {
    font-size: 0.68rem;
    padding: 0.8rem 0.35rem;
  }

  .hero-card {
    padding: 1.1rem 1rem 1.25rem;
    box-shadow: 5px 5px 0 #111;
  }

  .features-section,
  .how-section,
  .guide-teaser,
  .updates-section,
  .faq-section {
    margin-top: 4.75rem;
  }
}
</style>
