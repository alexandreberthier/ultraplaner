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
