import { computed, nextTick, ref } from 'vue'

const STORAGE_KEY = 'onroute-section-v3-active'
/** Matches previous default: categories open, rest closed. */
const DEFAULT_SECTION = 'categories'

function loadActive(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '') return null
    if (v) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_SECTION
}

function saveActive(id: string | null) {
  try {
    if (id == null) localStorage.setItem(STORAGE_KEY, '')
    else localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

function scrollSectionIntoView(id: string) {
  void nextTick(() => {
    const candidates = document.querySelectorAll(`[data-sidebar-section="${CSS.escape(id)}"]`)
    let el: HTMLElement | null = null
    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue
      // Skip desktop sidebar copies that are display:none on mobile
      if (node.getClientRects().length === 0) continue
      el = node
      break
    }
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

/**
 * Accordion for sidebar sections (Desktop + Mobile-Sheet).
 * Only one section open at a time — opening one closes the previous.
 */
const activeSectionId = ref<string | null>(loadActive())

export function useSidebarSection(id: string, _defaultOpen = false, _embedded = false) {
  const open = computed(() => activeSectionId.value === id)

  function setOpen(value: boolean) {
    if (value) {
      activeSectionId.value = id
      saveActive(id)
      scrollSectionIntoView(id)
    } else if (activeSectionId.value === id) {
      activeSectionId.value = null
      saveActive(null)
    }
  }

  function toggle() {
    setOpen(!open.value)
  }

  return { open, toggle, setOpen }
}
