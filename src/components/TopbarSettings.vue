<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ColorModeToggle from './ColorModeToggle.vue'
import LanguagePicker from './LanguagePicker.vue'
import PwaInstallHint from './PwaInstallHint.vue'
import { usePwaInstall } from '../composables/usePwaInstall'

withDefaults(
  defineProps<{
    /** Always use the compact menu (e.g. crowded plan topbar). */
    forceMenu?: boolean
  }>(),
  { forceMenu: false }
)

const { t } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const { installing, canNativeInstall, showInstallEntry, install, openGuide } = usePwaInstall()

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onInstallClick() {
  close()
  if (canNativeInstall.value) {
    void install()
  } else {
    openGuide()
  }
}

function onPanelInteract(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (el?.closest('button')) close()
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !root.value) return
  if (!root.value.contains(e.target as Node)) close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="topbar-settings" :class="{ 'force-menu': forceMenu }">
    <div class="settings-inline" aria-hidden="false">
      <ColorModeToggle compact />
      <LanguagePicker compact />
    </div>

    <div class="settings-menu">
      <button
        type="button"
        class="menu-btn"
        :aria-expanded="open"
        :aria-label="t('landing.settingsMenu')"
        :title="t('landing.settingsMenu')"
        @click.stop="toggle"
      >
        <span class="menu-icon" aria-hidden="true">☰</span>
      </button>
      <div
        v-if="open"
        class="menu-panel"
        role="dialog"
        :aria-label="t('landing.settingsMenu')"
        @click="onPanelInteract"
      >
        <p class="menu-title">{{ t('landing.settingsMenu') }}</p>
        <div class="menu-row">
          <span class="menu-label">{{ t('mapCanvas.colorsShort') }}</span>
          <ColorModeToggle />
        </div>
        <div class="menu-row">
          <span class="menu-label">{{ t('lang.label') }}</span>
          <LanguagePicker />
        </div>
        <div v-if="showInstallEntry" class="menu-install">
          <button
            type="button"
            class="pwa-install-btn"
            :disabled="installing"
            @click.stop="onInstallClick"
          >
            {{ installing ? t('pwa.installing') : t('pwa.menuInstall') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Guide dialog must stay mounted when the menu closes -->
    <PwaInstallHint :show-entry="false" />
  </div>
</template>

<style scoped>
.topbar-settings {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.settings-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.settings-menu {
  display: none;
}

.menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

.menu-btn:hover,
.menu-btn[aria-expanded='true'] {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
}

.menu-icon {
  font-size: 1.4rem;
  line-height: 1;
  font-weight: 700;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 13.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
}

.menu-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.menu-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
}

.menu-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.menu-install {
  padding-top: 0.15rem;
}

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

@media (max-width: 720px) {
  .settings-inline {
    display: none;
  }

  .settings-menu {
    display: block;
  }

  .menu-btn {
    width: 52px;
    height: 52px;
    border-radius: 12px;
  }

  .menu-icon {
    font-size: 1.55rem;
  }
}

.force-menu .settings-inline {
  display: none;
}

.force-menu .settings-menu {
  display: block;
}
</style>
