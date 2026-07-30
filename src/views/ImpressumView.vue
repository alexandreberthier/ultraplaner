<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyLegalSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'

const { t, locale } = useI18n()
const homePath = computed(() => localeHomePath(locale.value as AppLocale))

onMounted(() => {
  applyLegalSeo({
    title: 'Impressum – UltraPlaner',
    description:
      'Impressum von UltraPlaner: Medieninhaber Alexandre Berthier (Wien), Kontakt per E-Mail sowie Angaben und Offenlegung gemäß österreichischem Mediengesetz.',
    path: '/impressum/',
  })
})
</script>

<template>
  <div class="legal-page">
    <header class="legal-top">
      <router-link class="back-btn" :to="homePath">
        {{ t('landing.backHome') }}
      </router-link>
      <router-link class="brand" :to="homePath" :aria-label="t('landing.backHome')">
        <img
          class="brand-logo"
          src="/logo-ultraplaner.png"
          alt="UltraPlaner"
          width="160"
          height="53"
        />
      </router-link>
      <TopbarSettings force-menu />
    </header>

    <div class="imprint legal-body">
      <h1>Impressum</h1>

      <h2>Medieninhaber</h2>

      <p>
        Alexandre Berthier<br />
        Wien, Österreich
      </p>

      <p>
        E-Mail:
        <a href="mailto:alexandre.jean.berthier@outlook.de">alexandre.jean.berthier@outlook.de</a>
      </p>

      <h2>Zweck der Website</h2>

      <p>
        Private Entwicklung und unentgeltliche Bereitstellung der Webanwendung „UltraPlaner“ zur
        Planung und Darstellung von Fahrrad- und Langstreckenrouten sowie zur Bereitstellung damit
        zusammenhängender Karten-, Routen-, Wetter- und POI-Informationen.
      </p>

      <p>
        UltraPlaner ist ein privates, kostenloses und nicht kommerzielles öffentliches Angebot.
      </p>

      <h2>Offenlegung gemäß § 25 Mediengesetz</h2>

      <p>
        Medieninhaber: Alexandre Berthier<br />
        Wohnort: Wien, Österreich<br />
        Gegenstand des Mediums: Bereitstellung einer kostenlosen Webanwendung zur
        Fahrrad-Routenplanung.
      </p>

      <h2>Für den Inhalt verantwortlich</h2>

      <p>
        Alexandre Berthier<br />
        Wien, Österreich<br />
        E-Mail:
        <a href="mailto:alexandre.jean.berthier@outlook.de">alexandre.jean.berthier@outlook.de</a>
      </p>

      <footer class="legal-footer">
        <router-link :to="homePath">UltraPlaner</router-link>
        ·
        <router-link to="/datenschutz/">{{ t('legal.privacy') }}</router-link>
        ·
        <router-link to="/versorgung-ultracycling/">{{ t('legal.poisGuide') }}</router-link>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  min-height: 100%;
  background: var(--bg);
}

.legal-top {
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
  text-decoration: none;
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
  text-decoration: none;
}

.brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.legal-footer {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
  font-size: 0.9rem;
  color: var(--muted, #64748b);
}

.brand-logo {
  display: block;
  height: 36px;
  width: auto;
}

.legal-top :deep(.topbar-settings) {
  justify-self: end;
}

.legal-body {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.75rem 1.15rem 3.5rem;
  color: var(--text);
  line-height: 1.65;
}

.legal-body h1 {
  margin: 0 0 1.5rem;
  font-size: 1.85rem;
  color: var(--primary-dark);
  letter-spacing: -0.02em;
}

.legal-body h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.2rem;
  color: var(--primary-dark);
}

.legal-body p {
  margin: 0 0 0.9rem;
  font-size: 0.95rem;
}

.legal-body a {
  color: var(--primary);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

@media (max-width: 640px) {
  .legal-top {
    grid-template-columns: auto 1fr auto;
  }

  .back-btn {
    font-size: 0.85rem;
    padding: 0.4rem 0.55rem;
  }

  .legal-body {
    padding: 1.25rem 1rem 2.75rem;
  }

  .legal-body h1 {
    font-size: 1.5rem;
  }
}
</style>
