/** Keep the screen awake (e.g. ride / navigation mode). */
export function useWakeLock() {
  let sentinel: WakeLockSentinel | null = null
  let wantLock = false

  async function request() {
    wantLock = true
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    if (document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
      })
    } catch {
      /* unsupported / denied — ignore */
    }
  }

  async function release() {
    wantLock = false
    try {
      await sentinel?.release()
    } catch {
      /* ignore */
    }
    sentinel = null
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && wantLock && !sentinel) {
      void request()
    }
  }

  function bind() {
    document.addEventListener('visibilitychange', onVisibility)
  }

  function unbind() {
    document.removeEventListener('visibilitychange', onVisibility)
    void release()
  }

  return { request, release, bind, unbind }
}
