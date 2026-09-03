<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { completeWahooConnect } from '../services/wahooAuth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const status = ref<'working' | 'ok' | 'error'>('working')
const detail = ref('')

onMounted(async () => {
  const err = typeof route.query.error === 'string' ? route.query.error : ''
  if (err) {
    status.value = 'error'
    detail.value = err
    return
  }

  const code = typeof route.query.code === 'string' ? route.query.code : ''
  if (!code) {
    status.value = 'error'
    detail.value = 'missing_code'
    return
  }

  try {
    const returnUrl = await completeWahooConnect(code)
    status.value = 'ok'
    window.setTimeout(() => {
      void router.replace(returnUrl || '/')
    }, 800)
  } catch (e) {
    status.value = 'error'
    detail.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <div class="wahoo-cb">
    <p v-if="status === 'working'">{{ t('wahoo.callbackWorking') }}</p>
    <p v-else-if="status === 'ok'">{{ t('wahoo.callbackOk') }}</p>
    <div v-else class="wahoo-cb-error">
      <p>{{ t('wahoo.callbackError') }}</p>
      <p v-if="detail" class="wahoo-cb-detail">{{ detail }}</p>
      <button type="button" class="wahoo-cb-home" @click="router.push('/')">
        {{ t('landing.backHome') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wahoo-cb {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
  font: inherit;
  color: var(--text, #111);
  background: var(--bg, #f8faf9);
}

.wahoo-cb-error {
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.wahoo-cb-detail {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  word-break: break-word;
}

.wahoo-cb-home {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius);
  padding: 0.55rem 0.9rem;
  background: var(--surface, #fff);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
</style>
