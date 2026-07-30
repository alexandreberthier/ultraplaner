<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { deleteOfflineMap, listOfflineMaps } from '../services/offlineMaps'

const router = useRouter()
const { t, locale } = useI18n()

type RecentItem = {
  id: string
  name: string
  cachedAt: number
  totalKm: number
  poiCount: number
}

const items = ref<RecentItem[]>([])
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    items.value = await listOfflineMaps()
  } finally {
    loading.value = false
  }
}

function formatWhen(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(locale.value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function openMap(id: string) {
  void router.push(`/map/${id}`)
}

async function removeMap(id: string) {
  await deleteOfflineMap(id)
  items.value = items.value.filter((m) => m.id !== id)
}

function onVisible() {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  void refresh()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('pageshow', onVisible)
})
</script>

<template>
  <section v-if="!loading && items.length > 0" class="recent-maps" :aria-label="t('recent.title')">
    <header class="recent-head">
      <h2>{{ t('recent.title') }}</h2>
      <p>{{ t('recent.hint') }}</p>
    </header>

    <ul class="recent-list">
      <li v-for="m in items" :key="m.id" class="recent-item">
        <button type="button" class="recent-open" @click="openMap(m.id)">
          <strong>{{ m.name }}</strong>
          <span class="recent-meta">
            {{ m.totalKm.toFixed(0) }} km · {{ m.poiCount }} POIs · {{ formatWhen(m.cachedAt) }}
          </span>
        </button>
        <button
          type="button"
          class="recent-remove"
          :title="t('recent.removeTitle', { name: m.name })"
          :aria-label="t('recent.remove')"
          @click="removeMap(m.id)"
        >
          ×
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.recent-maps {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.recent-head h2 {
  margin: 0;
  font-size: 1rem;
}

.recent-head p {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.recent-item {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
}

.recent-open {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  background: var(--surface-2);
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.recent-open:hover {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  background: var(--surface);
}

.recent-open strong {
  display: block;
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.recent-remove {
  flex: 0 0 auto;
  width: 2.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.recent-remove:hover {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}
</style>
