import { computed, ref, type Ref } from 'vue'

export type RouteColorMode = 'surface' | 'grade'

const STORAGE_KEY = 'onroute-route-color-mode'

function loadPreference(): RouteColorMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'surface' || v === 'grade') return v
  } catch {
    /* ignore */
  }
  return 'surface'
}

/** Shared across MapCanvas and RoutePlanner. */
const preferredMode = ref<RouteColorMode>(loadPreference())

export function resolveRouteColorMode(
  preferred: RouteColorMode,
  canSurface: boolean,
  canGrade: boolean
): RouteColorMode | null {
  if (preferred === 'surface' && canSurface) return 'surface'
  if (preferred === 'grade' && canGrade) return 'grade'
  if (canSurface) return 'surface'
  if (canGrade) return 'grade'
  return null
}

export function useRouteColorMode(opts: {
  canSurface: Ref<boolean> | (() => boolean)
  canGrade: Ref<boolean> | (() => boolean)
}) {
  const canSurface = computed(() =>
    typeof opts.canSurface === 'function' ? opts.canSurface() : opts.canSurface.value
  )
  const canGrade = computed(() =>
    typeof opts.canGrade === 'function' ? opts.canGrade() : opts.canGrade.value
  )

  const effectiveMode = computed(() =>
    resolveRouteColorMode(preferredMode.value, canSurface.value, canGrade.value)
  )

  /** Show Belag|Steigung when at least one mode has data (GPX often has grade only). */
  const showToggle = computed(() => canSurface.value || canGrade.value)

  function setRouteColorMode(mode: RouteColorMode) {
    preferredMode.value = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return {
    preferredMode,
    effectiveMode,
    showToggle,
    canSurface,
    canGrade,
    setRouteColorMode,
  }
}
