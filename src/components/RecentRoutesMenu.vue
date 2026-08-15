<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { deleteOfflineMap, listOfflineMaps } from '../services/offlineMaps'

withDefaults(
  defineProps<{
    brutal?: boolean
    /** Compact tool-btn look for map toolbar */
    toolStyle?: boolean
  }>(),
  { brutal: false, toolStyle: false }
)

const router = useRouter()
const { t, locale } = useI18n()

type RecentItem = {
  id: string
  name: string
  cachedAt: number
  totalKm: number
  poiCount: number
}

const open = ref(false)
const loading = ref(false)
const items = ref<RecentItem[]>([])
const root = ref<HTMLElement | null>(null)
const menuBtn = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

async function refresh() {
  loading.value = true
  try {
    items.value = await listOfflineMaps()
  } finally {
    loading.value = false
  }
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString(locale.value, {
    day: '2-digit',
    month: 'short',
  })
}

function repositionPanel() {
  if (!open.value || !menuBtn.value) return
  const r = menuBtn.value.getBoundingClientRect()
  const gap = 8
  const margin = 8
  panelStyle.value = {
    top: `${Math.round(r.bottom + gap)}px`,
    right: `${Math.round(Math.max(margin, window.innerWidth - r.right))}px`,
    maxHeight: `${Math.round(Math.max(160, window.innerHeight - r.bottom - gap - margin))}px`,
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await refresh()
    await nextTick()
    repositionPanel()
  }
}

function close() {
  open.value = false
}

function openMap(id: string) {
  close()
  void router.push(`/map/${id}`)
}

async function removeMap(id: string, e: Event) {
  e.stopPropagation()
  await deleteOfflineMap(id)
  items.value = items.value.filter((m) => m.id !== id)
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
  <div ref="root" class="recent-menu" :class="{ brutal, 'tool-style': toolStyle }">
    <button
      ref="menuBtn"
      type="button"
      class="recent-btn"
      :class="{ active: open }"
      :aria-expanded="open"
      :aria-label="t('recent.menuTitle')"
      :title="t('recent.menuTitle')"
      @click.stop="toggle"
    >
      {{ t('recent.menuShort') }} ▾
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="recent-panel"
        :class="{ 'brutal-panel': brutal }"
        role="menu"
        :aria-label="t('recent.menuTitle')"
        :style="panelStyle"
        @click.stop
      >
        <header class="recent-panel-head">
          <strong>{{ t('recent.menuTitle') }}</strong>
          <p>{{ t('recent.menuHint') }}</p>
        </header>

        <p v-if="loading" class="recent-empty">{{ t('recent.loading') }}</p>
        <p v-else-if="!items.length" class="recent-empty">{{ t('recent.empty') }}</p>

        <ul v-else class="recent-panel-list">
          <li v-for="m in items" :key="m.id">
            <button type="button" class="recent-panel-open" role="menuitem" @click="openMap(m.id)">
              <strong>{{ m.name }}</strong>
              <span>
                {{ t('recent.kmPois', { km: m.totalKm.toFixed(0), count: m.poiCount }) }}
                · {{ formatWhen(m.cachedAt) }}
              </span>
            </button>
            <button
              type="button"
              class="recent-panel-remove"
              :title="t('recent.removeTitle', { name: m.name })"
              :aria-label="t('recent.remove')"
              @click="removeMap(m.id, $event)"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.recent-menu {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.recent-btn {
  padding: 0.45rem 0.7rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
  box-shadow: 3px 3px 0 #111;
}

.recent-btn:hover,
.recent-btn.active {
  background: #f3efe6;
}

.tool-style .recent-btn {
  box-shadow: none;
  font-weight: 750;
}

.tool-style .recent-btn.active {
  background: #111;
  color: #fff;
}
</style>

<style>
.recent-panel {
  position: fixed;
  z-index: 10050;
  width: min(22rem, calc(100vw - 16px));
  overflow: auto;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.recent-panel.brutal-panel {
  border: 3px solid #111;
  border-radius: 0;
  background: #fff;
  box-shadow: 6px 6px 0 #111;
}

.recent-panel-head strong {
  display: block;
  font-size: 0.92rem;
  font-weight: 800;
  color: #111;
}

.recent-panel-head p {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #444;
}

.recent-empty {
  margin: 0.35rem 0.25rem;
  font-size: 0.85rem;
  font-weight: 650;
  color: #444;
}

.recent-panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.recent-panel-list li {
  display: flex;
  align-items: stretch;
  gap: 0.3rem;
}

.recent-panel-open {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 2px solid #111;
  border-radius: 0;
  padding: 0.6rem 0.7rem;
  background: #f3efe6;
  cursor: pointer;
  color: #111;
  font: inherit;
}

.recent-panel-open:hover {
  background: var(--cta);
}

.recent-panel-open strong {
  display: block;
  font-size: 0.9rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-panel-open span {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  font-weight: 650;
  opacity: 0.8;
}

.recent-panel-remove {
  flex: 0 0 auto;
  width: 2.5rem;
  border: 2px solid #111;
  border-radius: 0;
  background: #fff;
  color: #111;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  font-weight: 800;
}

.recent-panel-remove:hover {
  background: #fee2e2;
}
</style>
