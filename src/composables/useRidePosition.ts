import { ref } from 'vue'

/** Shared km-along-route from GPS while in ride mode (written by MapCanvas). */
const rideKmAlong = ref<number | null>(null)
const rideLatLng = ref<{ lat: number; lng: number } | null>(null)

export function useRidePosition() {
  function setRideKmAlong(km: number | null) {
    rideKmAlong.value = km
  }

  function setRideLatLng(lat: number | null, lng: number | null) {
    rideLatLng.value = lat != null && lng != null ? { lat, lng } : null
  }

  return { rideKmAlong, rideLatLng, setRideKmAlong, setRideLatLng }
}
