import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initFirestorePersistence, isFirebaseConfigured } from './firebase'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

if (isFirebaseConfigured()) {
  void initFirestorePersistence()
}

app.mount('#app')
