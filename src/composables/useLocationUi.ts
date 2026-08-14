import { ref } from 'vue'

/** Shared GPS-button state so MapView nav can mirror MapCanvas. */
const pending = ref(false)
const active = ref(false)
const following = ref(false)
const needsRecenter = ref(false)
const headingUp = ref(false)

export function useLocationUi() {
  return { pending, active, following, needsRecenter, headingUp }
}
