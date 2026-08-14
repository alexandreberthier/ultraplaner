<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '../stores/mapStore'
import { useSidebarSection } from '../composables/useSidebarSection'
import NearbyForm from './NearbyForm.vue'

defineProps<{
  embedded?: boolean
}>()

const emit = defineEmits<{
  done: []
}>()

const { t } = useI18n()
const store = useMapStore()
const { open, toggle, setOpen } = useSidebarSection('nearby', false)

const summary = computed(() => {
  if (store.isNearbyMap) {
    return t('nearby.panelSummaryNearby', { m: store.poiRadiusM })
  }
  return t('nearby.panelSummaryRouteKeep')
})

function onDone() {
  setOpen(false)
  emit('done')
}

defineExpose({ setOpen })
</script>

<template>
  <section class="nearby-panel" :class="{ open, embedded }" data-sidebar-section="nearby">
    <button
      type="button"
      class="section-toggle"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="toggle-title">{{ t('nearby.panelTitle') }}</span>
      <span class="toggle-summary">{{ summary }}</span>
      <span class="chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-show="open" class="section-body">
      <NearbyForm in-map @done="onDone" />
    </div>
  </section>
</template>

<style scoped>
.nearby-panel {
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  min-height: 52px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.toggle-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #6b7280);
  flex-shrink: 0;
}

.toggle-summary {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text, #111);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--text, #111);
  font-size: 1.15rem;
  font-weight: 800;
  flex-shrink: 0;
  width: 1.5rem;
  text-align: center;
}

.section-body {
  padding: 0 0.85rem 0.85rem;
}
</style>
