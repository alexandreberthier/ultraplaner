<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAnalyticsConsent } from '../composables/useAnalyticsConsent'

const { t } = useI18n()
const { needsPrompt, accept, decline } = useAnalyticsConsent()
</script>

<template>
  <div v-if="needsPrompt" class="cookie-banner" role="dialog" :aria-label="t('cookie.aria')">
    <p class="cookie-banner__text">
      {{ t('cookie.text') }}
      <RouterLink class="cookie-banner__link" to="/datenschutz">{{ t('cookie.privacy') }}</RouterLink>
    </p>
    <div class="cookie-banner__actions">
      <button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" @click="decline">
        {{ t('cookie.decline') }}
      </button>
      <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" @click="accept">
        {{ t('cookie.accept') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.cookie-banner {
  position: fixed;
  z-index: 1200;
  left: 0.75rem;
  right: 0.75rem;
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  width: min(34rem, calc(100% - 1.5rem));
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(27, 67, 50, 0.14);
  color: var(--text);
}

.cookie-banner__text {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.cookie-banner__link {
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.cookie-banner__link:hover {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.cookie-banner__actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.45rem;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}

.cookie-banner__btn {
  flex: 0 1 auto;
  min-width: 5.5rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}

.cookie-banner__btn--ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.cookie-banner__btn--ghost:hover {
  background: var(--surface-2);
}

.cookie-banner__btn--primary {
  background: var(--primary);
  color: #fff;
}

.cookie-banner__btn--primary:hover {
  background: var(--primary-dark);
}

@media (min-width: 540px) {
  .cookie-banner {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 0.85rem 0.7rem 1rem;
  }

  .cookie-banner__actions {
    margin-left: auto;
  }
}

@media (min-width: 720px) {
  .cookie-banner {
    left: auto;
    right: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    margin-inline: 0;
    width: min(36rem, calc(100% - 2rem));
  }
}

@media (max-width: 379px) {
  .cookie-banner__actions {
    flex-wrap: wrap;
  }

  .cookie-banner__btn {
    flex: 1 1 calc(50% - 0.25rem);
    min-width: 0;
    text-align: center;
  }
}
</style>
