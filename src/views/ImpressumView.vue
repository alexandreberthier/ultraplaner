<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyLegalSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import ProtectedEmail from '../components/ProtectedEmail.vue'
import '../styles/legalPage.css'

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
