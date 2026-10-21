<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { completeGarminConnect } from '../services/garminAuth'

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
  const state = typeof route.query.state === 'string' ? route.query.state : ''
  if (!code) {
    status.value = 'error'
    detail.value = 'missing_code'
    return
  }

  try {
    const returnUrl = await completeGarminConnect(code, state)
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
  <div class="garmin-cb">
    <p v-if="status === 'working'">{{ t('garmin.callbackWorking') }}</p>
    <p v-else-if="status === 'ok'">{{ t('garmin.callbackOk') }}</p>
    <div v-else class="garmin-cb-error">
      <p>{{ t('garmin.callbackError') }}</p>
      <p v-if="detail" class="garmin-cb-detail">{{ detail }}</p>
      <button type="button" class="garmin-cb-home" @click="router.push('/')">
        {{ t('landing.backHome') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.garmin-cb {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
  font: inherit;
  color: var(--text, #111);
  background: var(--bg, #ffffff);
}

.garmin-cb-error {
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.garmin-cb-detail {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
  word-break: break-word;
}

.garmin-cb-home {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius);
  padding: 0.55rem 0.9rem;
  background: var(--surface, #fff);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
</style>
