import { ref } from 'vue'

/** Shared km-along-route from GPS while in ride mode (written by MapCanvas). */
const rideKmAlong = ref<number | null>(null)

export function useRidePosition() {
  function setRideKmAlong(km: number | null) {
    rideKmAlong.value = km
  }

  return { rideKmAlong, setRideKmAlong }
}
