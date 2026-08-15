<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyLegalSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import ProtectedEmail from '../components/ProtectedEmail.vue'

const { t, locale } = useI18n()
const homePath = computed(() => localeHomePath(locale.value as AppLocale))

onMounted(() => {
  applyLegalSeo({
    title: 'Impressum – UltraPlaner',
    description:
      'Impressum von UltraPlaner: Medieninhaber Alexandre Berthier (Wien), Kontakt über Formular oder geschützte E-Mail sowie Angaben gemäß österreichischem Mediengesetz.',
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
      <TopbarSettings brutal force-menu />
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
        <ProtectedEmail /><br />
        Website:
        <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">codedbyalex.dev</a>
      </p>

      <p class="contact-hint">{{ t('legal.contactHint') }}</p>

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
        <ProtectedEmail />
      </p>

      <footer class="legal-footer">
        <router-link :to="homePath">UltraPlaner</router-link>
        ·
        <router-link to="/datenschutz/">{{ t('legal.privacy') }}</router-link>
        ·
        <router-link to="/versorgung-ultracycling/">{{ t('legal.poisGuide') }}</router-link>
        ·
        <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">{{ t('legal.portfolio') }}</a>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  min-height: 100%;
  background: #f3efe6;
}

.legal-top {
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
  text-decoration: none;
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

.legal-footer {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 3px solid #111;
  font-size: 0.9rem;
  color: #111;
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

.contact-hint {
  font-size: 0.9rem;
  color: var(--muted, #64748b);
}

@media (max-width: 640px) {
  .back-btn {
    font-size: 0.85rem;
    padding: 0.55rem 0.7rem;
  }

  .legal-body {
    padding: 1.25rem 1rem 2.75rem;
  }

  .legal-body h1 {
    font-size: 1.5rem;
  }
}
</style>
