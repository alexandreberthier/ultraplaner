import { computed, onMounted, ref } from 'vue'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<BeforeInstallPromptEvent | null>(null)
const installing = ref(false)
const guideOpen = ref(false)
let listening = false

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function onBeforeInstall(e: Event) {
  e.preventDefault()
  deferred.value = e as BeforeInstallPromptEvent
}

/** Capture install prompt app-wide (needed for Android one-tap install). */
export function initPwaInstallListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
}

export function usePwaInstall() {
  onMounted(() => {
    initPwaInstallListener()
  })

  const installed = computed(() => isStandalone())
  const canNativeInstall = computed(() => !!deferred.value)
  /** Show menu entry whenever not already running as installed app. */
  const showInstallEntry = computed(() => !installed.value)
  const isIosDevice = computed(() => isIos())

  async function install() {
    const ev = deferred.value
    if (!ev) {
      guideOpen.value = true
      return
    }
    installing.value = true
    try {
      await ev.prompt()
      const choice = await ev.userChoice
      if (choice.outcome === 'accepted') {
        deferred.value = null
        guideOpen.value = false
      }
    } finally {
      installing.value = false
    }
  }

  function openGuide() {
    guideOpen.value = true
  }

  function closeGuide() {
    guideOpen.value = false
  }

  return {
    installed,
    installing,
    canNativeInstall,
    showInstallEntry,
    isIosDevice,
    guideOpen,
    install,
    openGuide,
    closeGuide,
  }
}
