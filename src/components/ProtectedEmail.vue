<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { localeHomePath, type AppLocale } from '../i18n'

/**
 * Contact mail without plaintext mailto / address in HTML source.
 * Local + domain stored reversed; assembled only on reveal / click.
 */
const USER_REV = 'reihtreb.naej.erdnaxela'
const DOMAIN_REV = 'ed.kooltuo'

const { t, locale } = useI18n()

const revealed = ref(false)
const displayHtml = ref('')

const formTo = computed(() => ({
  path: localeHomePath(locale.value as AppLocale),
  hash: '#feedback',
}))

function assemble(): string {
  const user = [...USER_REV].reverse().join('')
  const domain = [...DOMAIN_REV].reverse().join('')
  return `${user}@${domain}`
}

/** Entity-encode @ and . so naive scrapers miss the address in HTML. */
function encodeForDisplay(email: string): string {
  return email.replace(/@/g, '&#64;').replace(/\./g, '&#46;')
}

function reveal() {
  displayHtml.value = encodeForDisplay(assemble())
  revealed.value = true
}

function openMailto(e: MouseEvent) {
  e.preventDefault()
  window.location.href = `mailto:${assemble()}`
}
</script>

<template>
  <span class="protected-email">
    <template v-if="!revealed">
      <button type="button" class="pe-btn" @click="reveal">
        {{ t('legal.emailReveal') }}
      </button>
      <span class="pe-sep" aria-hidden="true">·</span>
      <router-link class="pe-form" :to="formTo">{{ t('legal.contactForm') }}</router-link>
    </template>
    <template v-else>
      <a class="pe-mail" href="#" rel="nofollow" @click="openMailto" v-html="displayHtml" />
      <span class="pe-sep" aria-hidden="true">·</span>
      <router-link class="pe-form" :to="formTo">{{ t('legal.contactForm') }}</router-link>
    </template>
  </span>
</template>

<style scoped>
.protected-email {
  display: inline;
  line-height: inherit;
}

.pe-btn {
  display: inline;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary);
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.pe-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 2px;
}

.pe-sep {
  margin: 0 0.35em;
  color: var(--muted, #64748b);
}

.pe-form,
.pe-mail {
  color: var(--primary);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
</style>
