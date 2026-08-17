import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'
import { isLocaleHomePath } from '../i18n'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/** Android back: inner screens pop, home exits. No-op on web. */
export function initNativeShell(router: Router): void {
  if (!isNativeApp()) return

  void App.addListener('backButton', () => {
    if (isLocaleHomePath(router.currentRoute.value.path)) {
      void App.exitApp()
      return
    }
    router.back()
  })
}
