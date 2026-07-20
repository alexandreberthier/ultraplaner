/** ETA helpers for route time planning (average speed model). */

export const DEFAULT_AVG_SPEED_KMH = 22
export const MIN_AVG_SPEED_KMH = 8
export const MAX_AVG_SPEED_KMH = 45

export function hoursForDistanceKm(km: number, speedKmh: number): number {
  const speed = Math.max(speedKmh, 0.1)
  return Math.max(0, km) / speed
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '–'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} min`
  return `${h}:${String(m).padStart(2, '0')} h`
}

/** Parse "HH:MM" local start time → Date today (or tomorrow if needed is not applied). */
export function parseStartTime(hhmm: string, base = new Date()): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function etaAtKm(
  km: number,
  speedKmh: number,
  startTimeHHmm: string | null | undefined,
  base = new Date()
): { durationLabel: string; clockLabel: string | null; arrival: Date | null } {
  const hours = hoursForDistanceKm(km, speedKmh)
  const durationLabel = formatDuration(hours)
  const start = startTimeHHmm ? parseStartTime(startTimeHHmm, base) : null
  if (!start) {
    return { durationLabel, clockLabel: null, arrival: null }
  }
  const arrival = new Date(start.getTime() + hours * 3600_000)
  return { durationLabel, clockLabel: formatClock(arrival), arrival }
}

export function defaultStartTimeHHmm(base = new Date()): string {
  return formatClock(base)
}
