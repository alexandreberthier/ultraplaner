import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { useMapStore } from './stores/mapStore'

const MapView = () => import('./views/MapView.vue')
const PoisAlongRouteView = () => import('./views/PoisAlongRouteView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/en', name: 'home-en', component: HomeView },
    { path: '/es', name: 'home-es', component: HomeView },
    { path: '/fr', name: 'home-fr', component: HomeView },
    { path: '/map/view', name: 'map-view', component: MapView },
    { path: '/map/:id', name: 'map', component: MapView },
    {
      path: '/versorgung-ultracycling',
      name: 'supply-guide-de',
      component: PoisAlongRouteView,
    },
    {
      path: '/en/ultracycling-supply',
      name: 'supply-guide-en',
      component: PoisAlongRouteView,
    },
    {
      path: '/es/avituallamiento-ultracycling',
      name: 'supply-guide-es',
      component: PoisAlongRouteView,
    },
    {
      path: '/fr/ravitaillement-ultracycling',
      name: 'supply-guide-fr',
      component: PoisAlongRouteView,
    },
    // Legacy slugs → keep routes for SPA; Firebase also 301-redirects
    {
      path: '/pois-entlang-der-route',
      redirect: '/versorgung-ultracycling/',
    },
    {
      path: '/en/pois-along-route',
      redirect: '/en/ultracycling-supply/',
    },
    {
      path: '/es/pois-en-la-ruta',
      redirect: '/es/avituallamiento-ultracycling/',
    },
    {
      path: '/fr/pois-sur-la-route',
      redirect: '/fr/ravitaillement-ultracycling/',
    },
    {
      path: '/datenschutz',
      name: 'privacy',
      component: () => import('./views/PrivacyView.vue'),
    },
    {
      path: '/impressum',
      name: 'imprint',
      component: () => import('./views/ImpressumView.vue'),
    },
    {
      path: '/oauth/wahoo/callback',
      name: 'wahoo-callback',
      component: () => import('./views/WahooCallbackView.vue'),
    },
    {
      path: '/routes/import/:id',
      name: 'route-import',
      component: () => import('./views/RouteImportView.vue'),
    },
    // Avoid blank RouterView if a stale PWA shell hits an unknown path
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/',
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

/** Dismiss stuck LoadingOverlay when navigating away mid-load (e.g. browser back). */
router.beforeEach((to) => {
  if (to.path.startsWith('/map')) return true
  try {
    const store = useMapStore()
    if (store.mode === 'loading') store.cancelLoading()
  } catch {
    /* pinia may not be ready on first navigation */
  }
  return true
})

export default router
