<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GpxForm from '../components/GpxForm.vue'
import NearbyForm from '../components/NearbyForm.vue'
import RecentMaps from '../components/RecentMaps.vue'
import TopbarSettings from '../components/TopbarSettings.vue'
import FeedbackForm from '../components/FeedbackForm.vue'
import { localeHomePath, poisAlongRoutePath, type AppLocale } from '../i18n'
import { useRouter } from 'vue-router'

/** MapLibre only when user opens „Route planen“ — keeps landing light. */
const RoutePlanner = defineAsyncComponent(() => import('../components/RoutePlanner.vue'))

const { t, locale } = useI18n()
const router = useRouter()
const tab = ref<'gpx' | 'plan' | 'nearby'>('gpx')
const appRef = ref<HTMLElement | null>(null)
const plannerRef = ref<{
  hasDraft: () => boolean
  toggleExportMenu: () => void
  closeExportMenu: () => void
} | null>(null)
const nearbyFormRef = ref<{ openMapFirst: () => void } | null>(null)
const plannerCanExport = ref(false)

function scrollToApp() {
  appRef.value?.scrollIntoView({ behavior: 'smooth' })
}

/** Umgebung: GPS → Karte sofort (Defaults), Form bleibt Fallback bei Geo-Fehler. */
function startNearbyMapFirst() {
  tab.value = 'nearby'
  void nextTick(() => {
    nearbyFormRef.value?.openMapFirst()
  })
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
  { key: 'pois', icon: '📍' },
  { key: 'eta', icon: '🕐' },
  { key: 'elevation', icon: '⛰️' },
  { key: 'weather', icon: '🌤' },
  { key: 'export', icon: '🖨️' },
  { key: 'europe', icon: '🗺️' },
] as const

const steps = [
  { key: 'step1', num: '1' },
  { key: 'step2', num: '2' },
  { key: 'step3', num: '3' },
] as const

const faqs = ['q1', 'q17', 'q3', 'q6', 'q19', 'q13', 'q14', 'q11'] as const
const updates = [
  { key: 'coros', kind: 'new' },
  { key: 'nearbyFromMap', kind: 'new' },
  { key: 'routeKeptOnNearby', kind: 'fix' },
  { key: 'rideSupply', kind: 'new' },
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
              srcset="/logo-ultraplaner-200.webp 200w, /logo-ultraplaner-400.webp 400w"
              sizes="(max-width: 640px) 42vw, 180px"
              type="image/webp"
            />
            <img
              class="plan-brand-logo"
              src="/logo-ultraplaner-400.png"
              srcset="/logo-ultraplaner-200.png 200w, /logo-ultraplaner-400.png 400w"
              sizes="(max-width: 640px) 42vw, 180px"
              alt="UltraPlaner"
              width="160"
              height="53"
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
              media="(max-width: 640px)"
              type="image/webp"
              srcset="/hero-mountains-800.webp 800w, /hero-mountains-1100.webp 1100w"
              sizes="100vw"
            />
            <source
              type="image/webp"
              srcset="/hero-mountains-800.webp 800w, /hero-mountains-1100.webp 1100w, /hero-mountains.webp 1536w"
              sizes="100vw"
            />
            <img
              class="hero-photo"
              src="/hero-mountains-800.webp"
              :alt="t('seo.heroImageAlt')"
              width="800"
              height="533"
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
                  srcset="/logo-ultraplaner-200.webp 200w, /logo-ultraplaner-400.webp 400w"
                  sizes="(max-width: 640px) 46vw, 190px"
                  type="image/webp"
                />
                <img
                  class="brand-logo"
                  src="/logo-ultraplaner-400.png"
                  srcset="/logo-ultraplaner-200.png 200w, /logo-ultraplaner-400.png 400w"
                  sizes="(max-width: 640px) 46vw, 190px"
                  alt="UltraPlaner"
                  width="200"
                  height="66"
                  decoding="async"
                />
              </picture>
            </button>
            <TopbarSettings />
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

        <section id="app-start" ref="appRef" class="app-section" tabindex="-1">
          <div class="section-head">
            <h2>{{ t('landing.appTitle') }}</h2>
            <p>{{ t('landing.appIntro') }}</p>
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
            <NearbyForm v-show="tab === 'nearby'" ref="nearbyFormRef" />
            <GpxForm v-if="tab === 'gpx'" />
          </section>
          <RecentMaps />
        </section>

        <section class="features-section">
          <h2>{{ t('landing.features.title') }}</h2>
          <div class="features-grid">
            <article v-for="f in features" :key="f.key" class="feature-card">
              <div class="feature-icon" aria-hidden="true">{{ f.icon }}</div>
              <div>
                <strong>{{ t(`landing.features.${f.key}`) }}</strong>
                <p>{{ t(`landing.features.${f.key}Desc`) }}</p>
              </div>
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
}

.landing.plan-fullscreen {
  height: 100dvh;
  height: 100vh;
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
  max-width: 1120px;
  margin: 0 auto;
  padding-inline: max(1.25rem, env(safe-area-inset-left, 0px));
  padding-inline-end: max(1.25rem, env(safe-area-inset-right, 0px));
  box-sizing: border-box;
}

/* ── Hero band ── */
.hero-band {
  position: relative;
  isolation: isolate;
  min-height: min(58vh, 520px);
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
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
  object-position: center center;
  display: block;
}

.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      rgba(8, 18, 14, 0.48) 0%,
      rgba(8, 18, 14, 0.28) 42%,
      rgba(8, 18, 14, 0.5) 100%
    );
}

.hero-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding-inline: max(1.25rem, env(safe-area-inset-left, 0px));
  padding-inline-end: max(1.25rem, env(safe-area-inset-right, 0px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.hero {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0 2.5rem;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  box-sizing: border-box;
  padding: max(0.55rem, env(safe-area-inset-top, 0px))
    max(0.65rem, env(safe-area-inset-right, 0px))
    0.25rem
    max(0.65rem, env(safe-area-inset-left, 0px));
  min-width: 0;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  flex-shrink: 1;
  padding: 0.3rem 0.55rem 0.3rem 0.4rem;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 12px rgba(0, 0, 0, 0.18);
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
  margin: auto 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 40rem;
  width: 100%;
  align-self: center;
  padding: 1.5rem 0 2rem;
}

.hero-kicker {
  margin: 0 0 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: color-mix(in srgb, #9fe8c2 85%, #fff);
}

.hero-title {
  font-size: clamp(1.9rem, 4.2vw, 2.85rem);
  font-weight: 800;
  color: #fff;
  margin: 0 0 0.75rem;
  line-height: 1.12;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05em;
}

.hero-title-route {
  white-space: nowrap;
}

.hero-sub {
  font-size: clamp(0.95rem, 1.8vw, 1.08rem);
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 1.35rem;
  line-height: 1.55;
  max-width: 34rem;
}

.cta-primary {
  border-radius: 10px;
  padding: 0.7rem 1.35rem;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--primary);
  color: #fff;
  border: 1px solid var(--primary);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
  transition: background 0.15s ease, transform 0.15s ease;
}

.cta-primary:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: center;
  align-items: center;
}

.stats-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
  margin-top: -1.15rem;
  position: relative;
  z-index: 2;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.1rem 1.5rem;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.08);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.stat strong {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--primary-dark);
}

.stat span {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.stat-sep {
  width: 1px;
  height: 40px;
  background: var(--border);
}

/* ── App section ── */
.app-section {
  scroll-margin-top: 1.5rem;
  padding-top: 2.5rem;
}

.section-head {
  margin-bottom: 1.25rem;
}

.section-head h2 {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--primary-dark);
}

.section-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.mode-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-tabs button {
  flex: 1;
  padding: 0.7rem 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.mode-tabs button.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.hero-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.05);
}

.hero-card[hidden] {
  display: none;
}

/* ── Sections ── */
.features-section,
.how-section,
.guide-teaser,
.updates-section,
.faq-section {
  margin-top: 4rem;
}

.how-section {
  margin-top: 2.75rem;
}

.features-section h2,
.how-section h2,
.guide-teaser h2,
.updates-section h2,
.faq-section h2 {
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--primary-dark);
  margin: 0 0 1.5rem;
  letter-spacing: -0.01em;
}

.guide-teaser p {
  margin: -0.5rem 0 1rem;
  max-width: 40rem;
  color: var(--text-muted);
  line-height: 1.5;
  font-size: 0.98rem;
}

.guide-teaser-link {
  font-weight: 700;
  color: var(--primary);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.updates-section h2 {
  margin-bottom: 0.45rem;
}

.updates-lead {
  margin: 0 0 1.1rem;
  font-size: 0.92rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.updates-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--border);
}

.updates-row {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.92rem;
  line-height: 1.4;
}

.updates-tag {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary-dark);
}

.updates-tag[data-kind='fix'] {
  color: var(--text-muted);
}

.updates-tag[data-kind='bug'] {
  color: #b91c1c;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.feature-card {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.15rem 1.2rem;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
}

.feature-icon {
  font-size: 1.45rem;
  flex-shrink: 0;
  line-height: 1;
}

.feature-card strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.3rem;
}

.feature-card p {
  margin: 0;
  font-size: 0.83rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.step {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.15rem 1.2rem;
}

.step-num {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.step p {
  margin: 0;
  font-size: 0.83rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.faq-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.faq-item:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent);
}

.faq-q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.15rem;
  background: none;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
}

.faq-q:focus {
  outline: none;
}

.faq-q:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: -4px;
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}

.faq-chevron {
  font-size: 1.2rem;
  color: var(--text-muted);
  transform: rotate(0deg);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-a {
  padding: 0 1.15rem 1rem;
  font-size: 0.86rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.faq-a[hidden] {
  display: none;
}

.site-footer {
  margin: 4rem 0 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.site-footer a {
  color: var(--primary);
  text-decoration: none;
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
  z-index: 5;
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
}

.plan-export-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.plan-export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .plan-export-btn {
    padding: 0.4rem 0.5rem;
    font-size: 0.75rem;
  }

  .back-btn {
    padding: 0.4rem 0.55rem;
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
  .features-grid,
  .steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .hero-title-route {
    white-space: normal;
  }

  .hero-band {
    min-height: 0;
  }

  .hero {
    padding-bottom: 1.75rem;
  }

  .hero-center {
    margin: 0;
    padding: 1rem 0 1.25rem;
  }

  .hero-title {
    font-size: clamp(1.55rem, 7.2vw, 2.1rem);
  }

  .hero-sub {
    font-size: 0.92rem;
  }

  .brand-logo {
    height: 1.65rem;
  }

  .hero-scrim {
    background:
      linear-gradient(
        180deg,
        rgba(8, 18, 14, 0.42) 0%,
        rgba(8, 18, 14, 0.22) 50%,
        rgba(8, 18, 14, 0.45) 100%
      );
  }

  .stats-bar {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-top: -1rem;
  }

  .stat-sep {
    display: none;
  }

  .features-grid,
  .steps {
    grid-template-columns: 1fr;
  }

  /* Action area first, then how-it-works */
  .page-wrap:not(.hero-wrap) {
    display: flex;
    flex-direction: column;
  }

  .page-wrap:not(.hero-wrap) > .stats-bar {
    order: 0;
  }

  .page-wrap:not(.hero-wrap) > .app-section {
    order: 1;
  }

  .page-wrap:not(.hero-wrap) > .how-section {
    order: 2;
  }

  .page-wrap:not(.hero-wrap) > .features-section {
    order: 3;
  }

  .page-wrap:not(.hero-wrap) > .guide-teaser {
    order: 4;
  }

  .page-wrap:not(.hero-wrap) > .updates-section {
    order: 5;
  }

  .page-wrap:not(.hero-wrap) > .faq-section {
    order: 6;
  }

  .page-wrap:not(.hero-wrap) > .feedback {
    order: 7;
  }

  .page-wrap:not(.hero-wrap) > .site-footer {
    order: 8;
  }
}
</style>
