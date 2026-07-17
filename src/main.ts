import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initFirestorePersistence } from './firebase'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

void initFirestorePersistence()

app.mount('#app')
