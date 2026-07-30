import { ref } from 'vue'

function loadOpen(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return fallback
}

function saveOpen(key: string, open: boolean) {
  try {
    localStorage.setItem(key, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Persistierte Ein-/Ausklappen-State für Sidebar-Abschnitte (Desktop + Mobile-Sheet).
 * Key-Prefix v2: neues Default — Kategorien offen, Rest zu.
 */
export function useSidebarSection(id: string, defaultOpen = false, _embedded = false) {
  const key = `onroute-section-v2-${id}`
  const open = ref(loadOpen(key, defaultOpen))

  function toggle() {
    open.value = !open.value
    saveOpen(key, open.value)
  }

  function setOpen(value: boolean) {
    open.value = value
    saveOpen(key, value)
  }

  return { open, toggle, setOpen }
}
