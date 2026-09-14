<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GpxForm from '../components/GpxForm.vue'
import TopbarSettings from '../components/TopbarSettings.vue'
import RecentRoutesMenu from '../components/RecentRoutesMenu.vue'
import FeedbackForm from '../components/FeedbackForm.vue'
import { localeHomePath, poisAlongRoutePath, garminFitPath, type AppLocale } from '../i18n'
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
import { withNativeLocationPermission } from '../utils/nativeLocation'
import { isNativeApp } from '../utils/nativeApp'

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
const nativeApp = isNativeApp()
const isNarrowPlanBar = ref(false)

function syncNarrowPlanBar() {
  isNarrowPlanBar.value =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

onMounted(() => {
  syncNarrowPlanBar()
  window.addEventListener('resize', syncNarrowPlanBar)
})
onUnmounted(() => {
  window.removeEventListener('resize', syncNarrowPlanBar)
})

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

  withNativeLocationPermission(
    () => {
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
    },
    () => {
      store.error = t('nearby.geoDenied')
      nearbyPending.value = false
    }
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
const garminFitGuidePath = () => garminFitPath(locale.value as AppLocale)
</script>

<template>
  <div class="landing" :class="{ 'plan-fullscreen': tab === 'plan', 'landing--native': nativeApp }">
    <a href="#app-start" class="skip-link">{{ t('landing.skipToContent') }}</a>

    <main id="main-content">
    <template v-if="tab === 'plan'">
      <header class="plan-topbar">
        <button type="button" class="back-btn" @click="leavePlanMode">
          {{ nativeApp || isNarrowPlanBar ? t('landing.backHomeShort') : t('landing.backHome') }}
        </button>
        <div class="plan-topbar-actions">
          <button
            type="button"
            class="plan-export-btn"
            :disabled="!plannerCanExport"
            :title="t('map.exportRoute')"
            @click="togglePlannerExport"
          >
            ↓ {{ nativeApp || isNarrowPlanBar ? t('map.exportShort') : t('map.exportRoute') }} ▾
          </button>
          <TopbarSettings brutal force-menu />
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
      <div class="hero-band" :class="{ 'hero-band--app': nativeApp }">
        <header class="hero">
          <div class="hero-top">
            <button type="button" class="brand-lockup" aria-label="UltraPlaner" @click="goStart">
              <picture>
                <source
                  srcset="/logo-ultraplaner-64.webp 64w, /logo-ultraplaner-96.webp 96w, /logo-ultraplaner-200.webp 200w"
                  sizes="40px"
                  type="image/webp"
                />
                <img
                  class="brand-logo"
                  src="/logo-ultraplaner-64.png"
                  srcset="/logo-ultraplaner-64.png 64w, /logo-ultraplaner-96.png 96w, /logo-ultraplaner-200.png 200w"
                  sizes="40px"
                  alt="UltraPlaner"
                  width="40"
                  height="40"
                  decoding="async"
                />
              </picture>
            </button>
            <div class="hero-top-actions">
              <RecentRoutesMenu brutal />
              <TopbarSettings brutal />
            </div>
          </div>

          <div v-if="!nativeApp" class="page-wrap hero-split">
            <div class="hero-copy">
              <p class="hero-kicker">
                {{ t('landing.stats.regions') }}
                <span class="hero-kicker-dot" aria-hidden="true">·</span>
                {{ t('landing.stats.pois') }}
              </p>
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
            <figure class="hero-media">
              <picture>
                <source
                  media="(min-width: 641px)"
                  type="image/webp"
                  srcset="/hero-mountains-800.webp 800w, /hero-mountains-1100.webp 1100w, /hero-mountains.webp 1536w"
                  sizes="(min-width: 960px) 42vw, 100vw"
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
              <figcaption class="hero-media-mark" aria-hidden="true">01</figcaption>
            </figure>
          </div>
        </header>
      </div>

      <div class="page-wrap">
        <div v-if="!nativeApp" class="stats-bar">
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
            <p v-if="nativeApp && tab === 'nearby'" class="app-privacy">{{ t('landing.appPrivacy') }}</p>
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
        </section>

        <template v-if="!nativeApp">
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
          <p class="guide-teaser-more">
            <router-link :to="garminFitGuidePath()">{{ t('landing.guideTeaser.garminLink') }}</router-link>
          </p>
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
        </template>

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
  border-radius: var(--radius);
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
  background: var(--cream);
  color: var(--ink);
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
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  background: var(--cream);
}

.hero-band--app {
  min-height: 0;
  overflow: visible;
}

.hero-band--app .hero {
  min-height: 0;
  padding: 0;
  flex: 0 0 auto;
}

.app-privacy {
  margin: 0.65rem 0 0;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-muted);
  max-width: 36rem;
}

.hero {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0 2.5rem;
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
  padding: max(0.55rem, env(safe-area-inset-top, 0px))
    max(0.75rem, env(safe-area-inset-right, 0px))
    0.25rem
    max(0.75rem, env(safe-area-inset-left, 0px));
  min-width: 0;
}

.hero-top-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0.2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  line-height: 0;
}

.brand-lockup picture {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.brand-logo {
  display: block;
  height: 2.5rem;
  width: 2.5rem;
  object-fit: contain;
  object-position: center;
}

.hero-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 3.25rem;
  align-items: end;
  padding-top: 2.25rem;
  padding-bottom: 0.25rem;
}

.hero-copy {
  min-width: 0;
  padding-bottom: 0.35rem;
}

.hero-kicker {
  margin: 0 0 1.1rem;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cta);
}

.hero-kicker-dot {
  margin: 0 0.35rem;
  letter-spacing: 0;
}

.hero-title {
  font-family: var(--display);
  font-size: clamp(2.35rem, 5.6vw, 4.6rem);
  font-weight: 560;
  font-optical-sizing: auto;
  color: var(--ink);
  margin: 0 0 1.1rem;
  line-height: 1.04;
  letter-spacing: -0.028em;
  text-transform: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.hero-title-lead {
  font-size: 0.4em;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 0.32em;
  color: var(--ink);
  white-space: nowrap;
}

.hero-title-route {
  white-space: normal;
  line-height: 1.05;
  text-wrap: balance;
}

.hero-sub {
  margin: 0 0 1.45rem;
  font-size: clamp(1.02rem, 1.5vw, 1.18rem);
  color: var(--text-muted);
  line-height: 1.45;
  max-width: 26rem;
  font-weight: 450;
}

.hero-media {
  position: relative;
  margin: 0;
  min-height: min(52vh, 560px);
  border-left: 3px solid var(--cta);
}

.hero-photo {
  width: 100%;
  height: 100%;
  min-height: min(52vh, 560px);
  object-fit: cover;
  object-position: center 42%;
  display: block;
  filter: saturate(0.78) contrast(1.06);
}

.hero-media-mark {
  position: absolute;
  left: 0.85rem;
  bottom: 0.75rem;
  margin: 0;
  font-family: var(--display);
  font-size: 0.85rem;
  font-weight: 560;
  letter-spacing: 0.08em;
  color: #fffaf5;
}

.cta-primary {
  border-radius: var(--radius);
  padding: 0.78rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-transform: none;
  cursor: pointer;
  background: var(--cta);
  color: var(--cta-text);
  border: 1px solid transparent;
  transition: background 0.15s ease;
}

@media (hover: hover) {
  .cta-primary:hover {
    background: var(--cta-hover);
  }
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
  grid-template-columns: 1fr 1fr 1fr;
  align-items: stretch;
  gap: 0;
  margin-top: 0;
  margin-bottom: 4.5rem;
  position: relative;
  z-index: 3;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0;
  overflow: visible;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 1.15rem 0 1.2rem;
  padding-right: 1.25rem;
  border-right: 1px solid var(--border);
  text-align: left;
}

.stat:last-child {
  border-right: none;
  padding-right: 0;
}

.stat:first-child {
  background: none;
  color: inherit;
}

.stat:first-child span {
  color: var(--text-muted);
  opacity: 1;
}

.stat strong {
  font-family: var(--display);
  font-size: clamp(1.35rem, 2.4vw, 1.85rem);
  font-weight: 560;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.stat span {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
  opacity: 1;
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
  font-size: clamp(1.85rem, 3.2vw, 2.7rem);
  font-weight: 520;
  letter-spacing: -0.03em;
  line-height: 1.05;
  text-transform: none;
  color: var(--ink);
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
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 0;
  background: transparent;
}

.mode-tabs button {
  flex: 1;
  padding: 0.85rem 0.75rem 0.75rem;
  min-height: 2.75rem;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  font-weight: 600;
  font-size: 0.92rem;
  letter-spacing: 0.01em;
  text-transform: none;
  cursor: pointer;
  color: var(--text-muted);
  box-shadow: none;
  margin-bottom: -1px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.mode-tabs button:last-child {
  border-right: none;
}

.mode-tabs button.active {
  background: transparent;
  color: var(--ink);
  border-bottom-color: var(--cta);
  box-shadow: none;
  font-weight: 700;
}

@media (hover: hover) {
  .mode-tabs button:hover:not(.active) {
    background: transparent;
    color: var(--ink);
    border-color: transparent;
    border-bottom-color: color-mix(in srgb, var(--cta) 45%, var(--border));
  }
}

.hero-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
  padding: 1.35rem 1.4rem 1.5rem;
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
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: none;
}

.landing :deep(.brutal:not(.tool-style) .recent-btn) {
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--border);
  box-shadow: none;
}

@media (hover: hover) {
  .landing :deep(.brutal:not(.tool-style) .recent-btn:hover),
  .landing :deep(.brutal:not(.tool-style) .recent-btn.active) {
    background: var(--cream);
    color: var(--ink);
  }
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
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  color: #111;
  font-weight: 700;
}

.landing :deep(.hero-card .cat-chip.active) {
  background: var(--cta);
  color: var(--cta-text);
  border-color: transparent;
}

.landing :deep(.hero-card .btn-primary),
.landing :deep(.feedback-submit) {
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--cta);
  color: var(--cta-text);
  box-shadow: var(--shadow);
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
}

.landing :deep(.hero-card .btn-primary:disabled) {
  background: #e8e4dc;
  color: #111;
  box-shadow: none;
  opacity: 1;
}

.landing :deep(.hero-card .radius-value) {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #fff;
  color: #111;
  box-shadow: none;
}

.landing :deep(.hero-card .radius-slider)::-webkit-slider-runnable-track,
.landing :deep(.hero-card .radius-row input[type='range'])::-webkit-slider-runnable-track {
  border-radius: var(--radius);
  background: #d8d2c6;
  border: 1px solid var(--border);
}

.landing :deep(.hero-card .radius-slider)::-moz-range-track,
.landing :deep(.hero-card .radius-row input[type='range'])::-moz-range-track {
  border-radius: var(--radius);
  background: #d8d2c6;
  border: 1px solid var(--border);
}

.landing :deep(.hero-card .radius-slider)::-webkit-slider-thumb,
.landing :deep(.hero-card .radius-row input[type='range'])::-webkit-slider-thumb {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--cta);
  box-shadow: none;
}

.landing :deep(.hero-card .radius-slider)::-moz-range-thumb,
.landing :deep(.hero-card .radius-row input[type='range'])::-moz-range-thumb {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--cta);
  box-shadow: none;
}

.landing :deep(.hero-card .load-summary),
.landing :deep(.hero-card .ios-geo-hint) {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #f3efe6;
  color: #111;
}

.landing :deep(.feedback) {
  margin-top: 6.5rem;
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding-top: 1.75rem;
}

.landing :deep(.feedback h2) {
  font-family: var(--display);
  font-weight: 520;
  text-transform: none;
  letter-spacing: -0.03em;
  color: var(--ink);
  white-space: nowrap;
}

.landing :deep(.field input),
.landing :deep(.field textarea) {
  border: 1px solid var(--border);
  border-radius: var(--radius);
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
  font-size: clamp(1.85rem, 3.2vw, 2.7rem);
  font-weight: 520;
  color: var(--ink);
  margin: 0 0 1.75rem;
  letter-spacing: -0.03em;
  line-height: 1.05;
  text-transform: none;
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
  font-weight: 650;
  color: var(--cta-text);
  text-transform: none;
  letter-spacing: 0.01em;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.55rem 0.9rem;
  background: var(--cta);
}

.guide-teaser-more {
  margin: 0.85rem 0 0 !important;
  font-size: 0.92rem !important;
  line-height: 1.45;
}

.guide-teaser-more a {
  color: #111;
  font-weight: 700;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

@media (hover: hover) {
  .guide-teaser-link:hover {
    background: var(--cta-hover);
  }
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
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
}

.updates-row {
  display: flex;
  gap: 0.85rem;
  align-items: baseline;
  padding: 0.95rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.98rem;
  line-height: 1.4;
  font-weight: 550;
}

.updates-row:last-child {
  border-bottom: 1px solid var(--border);
}

.updates-tag {
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cta);
  background: transparent;
  border: 1px solid var(--cta);
  border-radius: 999px;
  padding: 0.12rem 0.5rem;
}

.updates-tag[data-kind='fix'] {
  background: var(--primary);
  color: #fff;
}

.updates-tag[data-kind='bug'] {
  background: #bc4749;
  color: #fff;
}

.features-section,
.how-section {
  background: none;
}

.features-grid,
.steps {
  display: grid;
  gap: 0.75rem;
  align-items: stretch;
  background: none;
  border: none;
  box-shadow: none;
  overflow: visible;
}

.features-grid {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: none;
  column-gap: 2.75rem;
  row-gap: 0;
}

.feature-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
  height: auto;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  padding: 1.15rem 0 1.25rem;
  box-sizing: border-box;
}

.feature-card:nth-child(n) {
  grid-column: auto;
  grid-row: auto;
}

.feature-card:first-child {
  background: none;
  color: inherit;
  justify-content: flex-start;
  min-height: 0;
  border: none;
  border-top: 1px solid var(--border);
}

.feature-card:first-child p,
.feature-card:first-child strong {
  color: inherit;
}

.feature-card:hover,
.feature-card:first-child:hover {
  background: transparent;
}

.feature-card strong {
  display: block;
  font-family: var(--display);
  font-size: 1.2rem;
  font-weight: 540;
  letter-spacing: -0.025em;
  line-height: 1.2;
  margin-bottom: 0;
  text-transform: none;
  color: var(--ink);
}

.feature-card:first-child strong {
  font-size: 1.2rem;
  font-weight: 540;
  line-height: 1.2;
}

.feature-card p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.steps {
  grid-template-columns: 1fr 1fr 1fr;
  column-gap: 2.5rem;
  position: relative;
}

.steps::before {
  content: '';
  position: absolute;
  top: 0.85rem;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
}

.step {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  align-items: flex-start;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  position: relative;
}

.step:first-child {
  background: none;
  color: inherit;
  border: none;
}

.step:first-child .step-num,
.step:first-child strong,
.step:first-child p {
  color: inherit;
}

.step-num {
  width: auto;
  height: auto;
  border-radius: 0;
  background: var(--cream);
  color: var(--cta);
  font-family: var(--display);
  font-weight: 560;
  font-size: clamp(1.65rem, 2.8vw, 2.1rem);
  line-height: 1;
  display: block;
  letter-spacing: -0.03em;
  padding-right: 0.55rem;
  position: relative;
  z-index: 1;
}

.step strong {
  display: block;
  font-family: var(--display);
  font-size: 1.25rem;
  font-weight: 540;
  text-transform: none;
  margin-bottom: 0.15rem;
  letter-spacing: -0.025em;
}

.step p {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
}

.faq-item {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-item:focus-within {
  border-color: inherit;
  box-shadow: none;
  background: transparent;
}

.faq-q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.05rem 0;
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  text-align: left;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--ink);
}

.faq-q:focus {
  outline: none;
}

.faq-q:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  background: transparent;
  color: var(--ink);
}

.faq-chevron {
  font-size: 1.35rem;
  color: var(--cta);
  transform: rotate(0deg);
  transition: transform 0.15s;
  flex-shrink: 0;
  font-weight: 500;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-a {
  padding: 0 0 1.15rem;
  font-size: 0.92rem;
  color: var(--text-muted);
  line-height: 1.55;
  max-width: 42rem;
}

.faq-a[hidden] {
  display: none;
}

.site-footer {
  margin: 6.5rem 0 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
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
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: nowrap;
  min-height: 58px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  padding: max(0.7rem, env(safe-area-inset-top, 0px))
    max(0.75rem, env(safe-area-inset-right, 0px))
    0.7rem
    max(0.75rem, env(safe-area-inset-left, 0px));
  background: #fff;
  border-bottom: 1px solid var(--border);
  z-index: 40;
}

.landing--native .plan-topbar {
  padding-top: calc(0.7rem + env(safe-area-inset-top, 0px));
}

.landing--native .page-wrap {
  padding-top: 0.5rem;
}

.landing--native .stats-bar {
  display: none;
}

.landing--native .hero-top {
  padding-bottom: 0.35rem;
}

.landing--native .app-section {
  padding-top: 1.75rem;
}

.landing--native .section-head {
  margin-bottom: 1.5rem;
}

.landing--native .mode-tabs {
  margin-bottom: 1rem;
}

.back-btn {
  border: 1px solid transparent;
  background: var(--cta);
  border-radius: var(--radius);
  padding: 0.55rem 0.85rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--cta-text);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 40px;
  box-shadow: var(--shadow);
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .back-btn:hover {
    background: var(--cta-hover);
  }
}

.plan-topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
  margin-left: auto;
}

.plan-export-btn {
  border: 1px solid transparent;
  background: var(--cta);
  border-radius: var(--radius);
  padding: 0.55rem 0.85rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--cta-text);
  cursor: pointer;
  white-space: nowrap;
  min-height: 40px;
  box-shadow: var(--shadow);
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .plan-export-btn:hover:not(:disabled) {
    background: var(--cta-hover);
  }
}

.plan-export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

@media (max-width: 768px) {
  .plan-topbar {
    gap: 0.4rem;
    padding: max(0.55rem, env(safe-area-inset-top, 0px))
      max(0.65rem, env(safe-area-inset-right, 0px))
      0.55rem
      max(0.65rem, env(safe-area-inset-left, 0px));
    min-height: 56px;
  }

  .back-btn {
    min-width: 0;
    min-height: 44px;
    padding: 0.55rem 0.7rem;
    font-size: 0.85rem;
  }

  .plan-export-btn {
    min-width: 0;
    min-height: 44px;
    padding: 0.55rem 0.65rem;
    font-size: 0.82rem;
  }

  .plan-topbar-actions {
    gap: 0.35rem;
  }

  .plan-topbar-actions :deep(.menu-icon) {
    font-size: 1.4rem;
  }
}

@media (max-width: 520px) {
  .landing--native .plan-export-btn,
  .plan-export-btn {
    padding: 0.5rem 0.55rem;
    font-size: 0.78rem;
  }

  .landing--native .back-btn,
  .back-btn {
    padding: 0.5rem 0.55rem;
    font-size: 0.78rem;
  }
}

.planner-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}


@media (max-width: 960px) {
  .hero-split {
    grid-template-columns: 1fr;
    gap: 1.75rem;
    align-items: start;
    padding-top: 1.35rem;
  }

  .hero-media,
  .hero-photo {
    min-height: 220px;
  }

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
    grid-template-rows: none;
  }

  .stats-bar .stat:first-child,
  .stats-bar .stat:last-child {
    border-radius: 0;
  }

  .feature-card:nth-child(n) {
    grid-column: auto;
    grid-row: auto;
  }

  .feature-card:first-child {
    grid-column: auto;
    min-height: 0;
  }

  .step:first-child {
    grid-column: auto;
  }

  .steps::before {
    display: none;
  }
}

@media (max-width: 640px) {
  .hero-band--app,
  .hero-band--app .hero {
    min-height: 0;
  }

  .hero {
    padding-bottom: 1.5rem;
  }

  .hero-band--app .hero {
    padding-bottom: 0;
  }

  .hero-title {
    font-size: clamp(2.05rem, 10.5vw, 2.75rem);
    letter-spacing: -0.025em;
  }

  .cta-row {
    justify-content: flex-start;
  }

  .hero-sub {
    font-size: 0.98rem;
    max-width: 100%;
  }

  .hero-media,
  .hero-photo {
    min-height: 180px;
  }

  .brand-logo {
    height: 2.25rem;
    width: 2.25rem;
  }

  .stats-bar,
  .features-grid,
  .steps {
    grid-template-columns: 1fr;
  }

  .stats-bar {
    margin-top: 0;
    margin-bottom: 3.25rem;
  }

  .stat {
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-right: 0;
  }

  .stat:first-child,
  .stat:last-child {
    border-radius: 0;
  }

  .stat:last-child {
    border-bottom: none;
  }

  .mode-tabs button {
    font-size: 0.8rem;
    padding: 0.75rem 0.35rem 0.7rem;
  }

  .hero-card {
    padding: 1.1rem 1rem 1.25rem;
  }

  .features-section,
  .how-section,
  .guide-teaser,
  .updates-section,
  .faq-section {
    margin-top: 4.25rem;
  }
}
</style>
