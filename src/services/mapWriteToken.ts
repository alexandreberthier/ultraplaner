const WRITE_TOKEN_PREFIX = 'ultraplaner-map-write:'

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

export function generateWriteToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export function getMapWriteToken(mapId: string): string | null {
  if (!storageAvailable() || !mapId) return null
  try {
    const v = localStorage.getItem(WRITE_TOKEN_PREFIX + mapId)
    return v && v.length >= 32 ? v : null
  } catch {
    return null
  }
}

export function setMapWriteToken(mapId: string, token: string): void {
  if (!storageAvailable() || !mapId || !token) return
  try {
    localStorage.setItem(WRITE_TOKEN_PREFIX + mapId, token)
  } catch {
    /* quota / private mode */
  }
}

export function clearMapWriteToken(mapId: string): void {
  if (!storageAvailable() || !mapId) return
  try {
    localStorage.removeItem(WRITE_TOKEN_PREFIX + mapId)
  } catch {
    /* ignore */
  }
}

export function canEditSharedMap(mapId: string): boolean {
  return Boolean(getMapWriteToken(mapId))
}
