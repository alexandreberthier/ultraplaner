<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePwaInstall } from '../composables/usePwaInstall'

withDefaults(
  defineProps<{
    /** Compact button for settings / menus */
    showEntry?: boolean
  }>(),
  { showEntry: true }
)

const { t } = useI18n()
const {
  installing,
  canNativeInstall,
  showInstallEntry,
  isIosDevice,
  guideOpen,
  install,
  openGuide,
  closeGuide,
} = usePwaInstall()

function onMenuClick() {
  if (canNativeInstall.value) {
    void install()
  } else {
    openGuide()
  }
}
</script>

<template>
  <button
    v-if="showEntry && showInstallEntry"
    type="button"
    class="pwa-install-btn"
    :disabled="installing"
    @click.stop="onMenuClick"
  >
    {{ installing ? t('pwa.installing') : t('pwa.menuInstall') }}
  </button>

  <Teleport to="body">
    <div v-if="guideOpen" class="pwa-guide-backdrop" @click.self="closeGuide">
      <div class="pwa-guide" role="dialog" aria-modal="true" :aria-label="t('pwa.guideTitle')">
        <header class="pwa-guide-head">
          <h2>{{ t('pwa.guideTitle') }}</h2>
          <button type="button" class="pwa-guide-close" :aria-label="t('common.close')" @click="closeGuide">
            ×
          </button>
        </header>
        <ol v-if="isIosDevice" class="pwa-guide-steps">
          <li>{{ t('pwa.iosStep1') }}</li>
          <li>{{ t('pwa.iosStep2') }}</li>
          <li>{{ t('pwa.iosStep3') }}</li>
        </ol>
        <ol v-else class="pwa-guide-steps">
          <li>{{ t('pwa.androidStep1') }}</li>
          <li>{{ t('pwa.androidStep2') }}</li>
          <li>{{ t('pwa.androidStep3') }}</li>
        </ol>
        <button
          v-if="canNativeInstall"
          type="button"
          class="pwa-guide-cta"
          :disabled="installing"
          @click="install"
        >
          {{ installing ? t('pwa.installing') : t('pwa.install') }}
        </button>
        <button type="button" class="pwa-guide-done" @click="closeGuide">
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pwa-install-btn {
  width: 100%;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  background: var(--surface-2, #f3f4f6);
  color: var(--text, #111);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.pwa-install-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary, #2d6a4f) 45%, var(--border, #e5e7eb));
  background: var(--surface, #fff);
}

.pwa-install-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.pwa-guide-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  background: rgba(17, 24, 39, 0.45);
}

.pwa-guide {
  width: min(100%, 26rem);
  border-radius: 14px;
  background: var(--surface, #fff);
  color: var(--text, #111);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
  padding: 1rem 1rem 1.1rem;
}

.pwa-guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.pwa-guide-head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 750;
}

.pwa-guide-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  padding: 0.15rem 0.35rem;
}

.pwa-guide-steps {
  margin: 0 0 1rem;
  padding-left: 1.2rem;
  font-size: 0.9rem;
  line-height: 1.45;
}

.pwa-guide-steps li + li {
  margin-top: 0.45rem;
}

.pwa-guide-cta,
.pwa-guide-done {
  width: 100%;
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.pwa-guide-cta {
  border: none;
  background: var(--primary, #2d6a4f);
  color: #fff;
  margin-bottom: 0.45rem;
}

.pwa-guide-cta:disabled {
  opacity: 0.75;
  cursor: wait;
}

.pwa-guide-done {
  border: 1px solid var(--border, #e5e7eb);
  background: transparent;
  color: var(--text, #111);
}

@media (min-width: 769px) {
  .pwa-guide-backdrop {
    align-items: center;
  }
}
</style>
