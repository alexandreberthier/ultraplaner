import { onMounted, onUnmounted, ref } from 'vue'

export function useOnline() {
  const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

  function sync() {
    isOnline.value = navigator.onLine
  }

  onMounted(() => {
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
  })

  onUnmounted(() => {
    window.removeEventListener('online', sync)
    window.removeEventListener('offline', sync)
  })

  return { isOnline }
}
