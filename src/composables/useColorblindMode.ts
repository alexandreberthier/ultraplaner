import { colorblindMode, saveColorblindPreference } from '../config/mapStyle'

export function applyColorblindDocument(enabled: boolean) {
  document.documentElement.toggleAttribute('data-colorblind', enabled)
}

/** Apply saved preference on app boot (before first paint when possible). */
export function initColorblindMode() {
  applyColorblindDocument(colorblindMode.value)
}

export function useColorblindMode() {
  function setColorblindMode(enabled: boolean) {
    colorblindMode.value = enabled
    saveColorblindPreference(enabled)
    applyColorblindDocument(enabled)
  }

  function toggleColorblindMode() {
    setColorblindMode(!colorblindMode.value)
  }

  return { colorblindMode, setColorblindMode, toggleColorblindMode }
}
