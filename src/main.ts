import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { getDb, isFirebaseConfigured } from './firebase'
import { initColorblindMode } from './composables/useColorblindMode'
import { initPwaInstallListener } from './composables/usePwaInstall'
import { applyDocumentSeo, enforcePreferredHostSeo } from './composables/useDocumentSeo'
import { i18n, localeFromPath, setAppLocale, isLocaleHomePath, type AppLocale } from './i18n'
import { recordSessionPageView } from './services/pageStats'
import {
  clearChunkReloadFlag,
  reloadOnceOnChunkError,
} from './utils/chunkLoadRecovery'
import './style.css'

enforcePreferredHostSeo()
initColorblindMode()
initPwaInstallListener()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Eager init so IndexedDB cache is configured before first Firestore use
if (isFirebaseConfigured()) {
  getDb()
}

if (isLocaleHomePath(window.location.pathname)) {
  applyDocumentSeo(i18n.global.locale.value as AppLocale)
}

// Stale PWA/shell after deploy: old main still imports deleted hashed chunks
router.onError((error) => {
  reloadOnceOnChunkError(error)
})
window.addEventListener('vite:preloadError', ((event: Event) => {
  const pe = event as Event & { payload?: unknown; preventDefault?: () => void }
  pe.preventDefault?.()
  reloadOnceOnChunkError(pe.payload ?? pe)
}) as EventListener)

router.afterEach((to) => {
  recordSessionPageView(to.path)
  const fromPath = localeFromPath(to.path)
  if (fromPath && fromPath !== i18n.global.locale.value) {
    setAppLocale(fromPath)
  }
  if (isLocaleHomePath(to.path)) {
    applyDocumentSeo(i18n.global.locale.value as AppLocale)
  }
})

app.mount('#app')

// Only clear after a successful resolve — clearing at boot would allow reload loops
void router.isReady().then(() => {
  clearChunkReloadFlag()
})
