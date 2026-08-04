<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const ACCESS_KEY = (import.meta.env.VITE_WEB3FORMS_ACCESS_KEY as string | undefined)?.trim() ?? ''

const name = ref('')
const email = ref('')
const message = ref('')
const botcheck = ref('')
const loading = ref(false)
const success = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  success.value = false

  if (!ACCESS_KEY) {
    error.value = t('landing.feedback.errorConfig')
    return
  }

  const text = message.value.trim()
  if (text.length < 10) {
    error.value = t('landing.feedback.errorShort')
    return
  }

  loading.value = true
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        access_key: ACCESS_KEY,
        subject: t('landing.feedback.mailSubject'),
        from_name: 'UltraPlaner',
        name: name.value.trim() || 'Anonym',
        email: email.value.trim() || 'noreply@ultraplaner.com',
        message: text,
        botcheck: botcheck.value,
      }),
    })

    const data = (await res.json()) as { success?: boolean; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'submit failed')
    }

    success.value = true
    name.value = ''
    email.value = ''
    message.value = ''
  } catch {
    error.value = t('landing.feedback.errorSend')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section id="feedback" class="feedback" aria-labelledby="feedback-heading">
    <h2 id="feedback-heading">{{ t('landing.feedback.title') }}</h2>
    <p class="feedback-intro">{{ t('landing.feedback.intro') }}</p>
    <p class="feedback-roadmap">{{ t('landing.feedback.roadmapNote') }}</p>

    <form class="feedback-form" @submit.prevent="submit">
      <!-- Honeypot -->
      <input
        v-model="botcheck"
        type="checkbox"
        name="botcheck"
        class="hp"
        tabindex="-1"
        autocomplete="off"
        aria-hidden="true"
      />

      <label class="field">
        <span>{{ t('landing.feedback.name') }}</span>
        <input
          v-model="name"
          type="text"
          name="name"
          autocomplete="name"
          maxlength="80"
          :disabled="loading || success"
        />
      </label>
      <label class="field">
        <span>{{ t('landing.feedback.email') }}</span>
        <input
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          maxlength="120"
          :disabled="loading || success"
        />
      </label>
      <label class="field field-full">
        <span>{{ t('landing.feedback.message') }}</span>
        <textarea
          v-model="message"
          name="message"
          rows="5"
          maxlength="4000"
          required
          :placeholder="t('landing.feedback.placeholder')"
          :disabled="loading || success"
        />
      </label>

      <p v-if="error" class="feedback-error" role="alert">{{ error }}</p>
      <p v-if="success" class="feedback-hint" role="status">{{ t('landing.feedback.sentHint') }}</p>

      <button type="submit" class="feedback-submit" :disabled="loading || success">
        {{ loading ? t('landing.feedback.sending') : t('landing.feedback.submit') }}
      </button>
      <p class="feedback-note">{{ t('landing.feedback.note') }}</p>
    </form>
  </section>
</template>

<style scoped>
.feedback {
  margin-top: 4rem;
  padding: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.feedback h2 {
  margin: 0 0 0.5rem;
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--primary-dark);
}

.feedback-intro {
  margin: 0 0 0.65rem;
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.feedback-roadmap {
  margin: 0 0 1.25rem;
  padding: 0.65rem 0.8rem;
  background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  border-left: 3px solid var(--primary);
  border-radius: 0 10px 10px 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.feedback-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem 1rem;
  position: relative;
}

.hp {
  position: absolute;
  left: -9999px;
  opacity: 0;
  height: 0;
  width: 0;
  pointer-events: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.field-full {
  grid-column: 1 / -1;
}

.field input,
.field textarea {
  font: inherit;
  font-weight: 400;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  resize: vertical;
}

.field input:disabled,
.field textarea:disabled {
  opacity: 0.7;
}

.field input:focus,
.field textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--primary) 45%, transparent);
  outline-offset: 1px;
  border-color: var(--primary);
}

.feedback-submit {
  grid-column: 1 / -1;
  justify-self: start;
  margin-top: 0.25rem;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 0.75rem 1.4rem;
  font-weight: 700;
  cursor: pointer;
}

.feedback-submit:hover:not(:disabled) {
  background: var(--primary-dark);
}

.feedback-submit:disabled {
  opacity: 0.65;
  cursor: default;
}

.feedback-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.feedback-hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--primary-dark);
  font-size: 0.85rem;
  font-weight: 600;
}

.feedback-note {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.4;
}

@media (max-width: 640px) {
  .feedback-form {
    grid-template-columns: 1fr;
  }
}
</style>
