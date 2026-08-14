<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useColorblindMode } from '../composables/useColorblindMode'

withDefaults(
  defineProps<{ compact?: boolean }>(),
  { compact: false }
)

const { t } = useI18n()
const { colorblindMode, toggleColorblindMode } = useColorblindMode()
</script>

<template>
  <button
    type="button"
    class="color-toggle"
    :class="{ compact, active: colorblindMode }"
    :aria-pressed="colorblindMode"
    :aria-label="t('mapCanvas.colorblindTitle')"
    :title="t('mapCanvas.colorblindTitle')"
    @click="toggleColorblindMode()"
  >
    <span class="color-icon" aria-hidden="true">
      <span class="swatch default" />
      <span class="swatch alt" />
    </span>
    <span class="color-label">{{ compact ? t('mapCanvas.colorsShort') : t('mapCanvas.colorblind') }}</span>
  </button>
</template>

<style scoped>
.color-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.7rem;
  min-height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text-muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.color-toggle.compact {
  padding: 0.4rem 0.55rem;
  min-height: 2.25rem;
  border-radius: 8px;
  font-size: 0.8rem;
}

.color-toggle:hover {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
  color: var(--text);
}

.color-toggle.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--primary) 35%, transparent);
}

.color-icon {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

.swatch.default {
  background: #2d6a4f;
}

.swatch.alt {
  background: #0072b2;
}

.color-toggle.active .swatch {
  border-color: rgba(255, 255, 255, 0.35);
}

.color-label {
  line-height: 1;
}
</style>
