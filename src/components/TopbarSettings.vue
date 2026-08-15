<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ColorModeToggle from './ColorModeToggle.vue'
import LanguagePicker from './LanguagePicker.vue'
import PwaInstallHint from './PwaInstallHint.vue'
import { usePwaInstall } from '../composables/usePwaInstall'

withDefaults(
  defineProps<{
    /** Always use the compact menu (e.g. crowded plan topbar). */
    forceMenu?: boolean
    /** Hard neo-brutalist chrome (landing hero). */
    brutal?: boolean
  }>(),
  { forceMenu: false, brutal: false }
)

const { t } = useI18n()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menuBtn = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const { installing, canNativeInstall, showInstallEntry, install, openGuide } = usePwaInstall()

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function repositionPanel() {
  if (!open.value) return
  const btn = menuBtn.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const gap = 8
  const margin = 8
  panelStyle.value = {
    top: `${Math.round(r.bottom + gap)}px`,
    right: `${Math.round(Math.max(margin, window.innerWidth - r.right))}px`,
    maxHeight: `${Math.round(Math.max(140, window.innerHeight - r.bottom - gap - margin))}px`,
  }
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
  if (!open.value) return
  const node = e.target as Node
  if (root.value?.contains(node) || panel.value?.contains(node)) return
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  repositionPanel()
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', repositionPanel)
  window.addEventListener('scroll', repositionPanel, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', repositionPanel)
  window.removeEventListener('scroll', repositionPanel, true)
})
</script>

<template>
  <div ref="root" class="topbar-settings" :class="{ 'force-menu': forceMenu, brutal }">
    <div class="settings-inline" aria-hidden="false">
      <ColorModeToggle compact />
      <LanguagePicker compact />
    </div>

    <div class="settings-menu">
      <button
        ref="menuBtn"
        type="button"
        class="menu-btn"
        :aria-expanded="open"
        :aria-label="t('landing.settingsMenu')"
        :title="t('landing.settingsMenu')"
        @click.stop="toggle"
      >
        <span class="menu-icon" aria-hidden="true">☰</span>
      </button>
      <Teleport to="body">
        <div
          v-if="open"
          ref="panel"
          class="menu-panel topbar-settings-menu-panel"
          :class="{ 'brutal-panel': brutal }"
          role="dialog"
          :aria-label="t('landing.settingsMenu')"
          :style="panelStyle"
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
      </Teleport>
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

.brutal .settings-inline {
  gap: 0.7rem;
}

.brutal :deep(.color-toggle),
.brutal :deep(.lang-picker) {
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  box-shadow: 4px 4px 0 #111;
}

.brutal :deep(.color-toggle) {
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.brutal :deep(.color-toggle:hover) {
  background: #fff;
  border-color: #111;
  color: #111;
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #111;
}

.brutal :deep(.color-toggle.active) {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: 4px 4px 0 #111;
}

.brutal :deep(.lang-btn) {
  border-radius: 0;
  color: #111;
  transition: background 0.08s ease, color 0.08s ease;
}

.brutal :deep(.lang-btn:hover:not(.active)) {
  background: #f3efe6;
  border-color: transparent;
  color: #111;
}

.brutal :deep(.lang-btn.active) {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: none;
}

.brutal .menu-btn {
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  box-shadow: 3px 3px 0 #111;
  width: 2.5rem;
  height: 2.5rem;
}

.brutal .menu-btn:hover,
.brutal .menu-btn[aria-expanded='true'] {
  border-color: #111;
  background: #111;
  color: #fff;
}
</style>

<style>
/* Teleported to body so landing overflow/stacking cannot clip the panel. */
.topbar-settings-menu-panel {
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 16rem;
  max-width: calc(100vw - 16px);
  overflow-y: auto;
  padding: 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
}

.topbar-settings-menu-panel .menu-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.topbar-settings-menu-panel .menu-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
}

.topbar-settings-menu-panel .menu-label {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-muted);
}

.topbar-settings-menu-panel .menu-install {
  padding-top: 0.15rem;
}

.topbar-settings-menu-panel .pwa-install-btn {
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

.topbar-settings-menu-panel .pwa-install-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary, #2d6a4f) 45%, var(--border, #e5e7eb));
  background: var(--surface, #fff);
}

.topbar-settings-menu-panel .pwa-install-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.topbar-settings-menu-panel.brutal-panel {
  border: 3px solid #111;
  border-radius: 0;
  background: #f3efe6;
  box-shadow: 6px 6px 0 #111;
}

.topbar-settings-menu-panel.brutal-panel .menu-title {
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #111;
}

.topbar-settings-menu-panel.brutal-panel .menu-label {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #111;
}

.topbar-settings-menu-panel.brutal-panel .color-toggle,
.topbar-settings-menu-panel.brutal-panel .lang-picker {
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  box-shadow: 4px 4px 0 #111;
}

.topbar-settings-menu-panel.brutal-panel .color-toggle {
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.topbar-settings-menu-panel.brutal-panel .color-toggle:hover {
  background: #fff;
  border-color: #111;
  color: #111;
}

.topbar-settings-menu-panel.brutal-panel .color-toggle.active {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: 4px 4px 0 #111;
}

.topbar-settings-menu-panel.brutal-panel .lang-btn {
  border-radius: 0;
  color: #111;
}

.topbar-settings-menu-panel.brutal-panel .lang-btn:hover:not(.active) {
  background: #f3efe6;
  border-color: transparent;
  color: #111;
}

.topbar-settings-menu-panel.brutal-panel .lang-btn.active {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: none;
}

.topbar-settings-menu-panel.brutal-panel .pwa-install-btn {
  border: 3px solid #111;
  border-radius: 0;
  background: var(--cta);
  color: #111;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 4px 4px 0 #111;
}

.topbar-settings-menu-panel.brutal-panel .pwa-install-btn:hover:not(:disabled) {
  border-color: #111;
  background: var(--cta);
}
</style>
