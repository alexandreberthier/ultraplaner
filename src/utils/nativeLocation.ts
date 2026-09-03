import { Geolocation } from '@capacitor/geolocation'
import { isNativeApp } from './nativeApp'

export async function ensureNativeLocationPermission(): Promise<boolean> {
  if (!isNativeApp()) return true
  try {
    const current = await Geolocation.checkPermissions()
    if (current.location === 'granted' || current.coarseLocation === 'granted') return true
    const requested = await Geolocation.requestPermissions()
    return requested.location === 'granted' || requested.coarseLocation === 'granted'
  } catch {
    return false
  }
}

/**
 * Web: runs `fn` immediately so iOS still gets a user-gesture GPS call.
 * Native: asks Android/iOS for location first, then runs `fn`.
 */
export function withNativeLocationPermission(fn: () => void, onDenied?: () => void): void {
  if (!isNativeApp()) {
    fn()
    return
  }
  void ensureNativeLocationPermission().then((ok) => {
    if (ok) fn()
    else onDenied?.()
  })
}
