/** Session flag so a broken deploy cannot loop reload forever. */
const RELOAD_FLAG = 'ultraplaner-chunk-reload'

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error ?? '')
}

/** Vite/PWA: stale shell after deploy still points at old hashed chunks. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = errorText(error)
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk [\w-]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  )
}

async function activateWaitingAndUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    await reg.update()
  } catch {
    /* ignore */
  }
}

/**
 * Hard-reload once so the next navigation gets a fresh index.html + chunk map.
 * Call after a successful app boot to clear the flag for future deploys.
 */
export function reloadOnceOnChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return false
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    /* private mode / blocked storage — still try one reload */
  }

  void (async () => {
    await activateWaitingAndUpdate()
    // Full navigation (vs soft reload) helps flush stale module graph on mobile
    window.location.replace(window.location.href)
  })()
  return true
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* ignore */
  }
}
