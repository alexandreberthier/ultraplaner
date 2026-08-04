import { getSupabase, isSupabaseConfigured } from '../supabase'
import { tGlobal } from '../i18n'

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000

export type RouteExportKind = 'gpx' | 'fit'
export type RouteExportTarget = 'coros'

export interface RouteExportRecord {
  id: string
  name: string
  filename: string
  mimeType: string
  encoding: 'utf8' | 'base64'
  kind: RouteExportKind
  target: RouteExportTarget | null
  content: string
  createdAt: string
  expiresAt: string
}

export interface CreateRouteExportInput {
  name: string
  filename: string
  mimeType: string
  encoding: 'utf8' | 'base64'
  kind: RouteExportKind
  target?: RouteExportTarget | null
  content: string
}

function generateExportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Public HTTPS URL for the import page (never blob:). */
export function routeExportUrl(id: string, target?: RouteExportTarget | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ultraplaner.com'
  const base = `${origin}/routes/import/${id}`
  return target === 'coros' ? `${base}?target=coros` : base
}

export async function createRouteExport(
  input: CreateRouteExportInput
): Promise<{ id: string; url: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error(tGlobal('export.qrUnavailable'))
  }

  const sb = getSupabase()
  const id = generateExportId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS)
  const target = input.target ?? null

  const { error } = await sb.rpc('create_route_export', {
    p_id: id,
    p_name: input.name.slice(0, 200),
    p_filename: input.filename.slice(0, 120),
    p_mime_type: input.mimeType.slice(0, 120),
    p_encoding: input.encoding,
    p_kind: input.kind,
    p_target: target,
    p_content: input.content,
    p_expires_at: expiresAt.toISOString(),
  })

  if (error) {
    const rpcMissing =
      error.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(error.message)

    if (rpcMissing) {
      console.warn(
        '[route_exports] create_route_export fehlt — bitte supabase/route_exports.sql im SQL Editor ausführen.'
      )
      throw new Error(tGlobal('export.qrUnavailable'))
    }
    throw new Error(tGlobal('export.qrFailed'))
  }

  return { id, url: routeExportUrl(id, target) }
}

export async function createGpxRouteExport(opts: {
  name: string
  filename: string
  gpx: string
  target?: RouteExportTarget | null
}): Promise<{ id: string; url: string }> {
  return createRouteExport({
    name: opts.name,
    filename: opts.filename,
    mimeType: 'application/gpx+xml',
    encoding: 'utf8',
    kind: 'gpx',
    target: opts.target ?? null,
    content: opts.gpx,
  })
}

export async function createFitRouteExport(opts: {
  name: string
  filename: string
  bytes: Uint8Array
}): Promise<{ id: string; url: string }> {
  return createRouteExport({
    name: opts.name,
    filename: opts.filename,
    mimeType: 'application/octet-stream',
    encoding: 'base64',
    kind: 'fit',
    content: bytesToBase64(opts.bytes),
  })
}

export async function loadRouteExport(id: string): Promise<RouteExportRecord | null> {
  if (!isSupabaseConfigured()) return null
  if (!/^[a-f0-9]{32}$/i.test(id)) return null

  const sb = getSupabase()
  const { data, error } = await sb
    .from('route_exports')
    .select('id,name,filename,mime_type,encoding,kind,target,content,created_at,expires_at')
    .eq('id', id.toLowerCase())
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const expiresAt = data.expires_at as string
  if (new Date(expiresAt).getTime() < Date.now()) return null

  const encoding = data.encoding === 'base64' ? 'base64' : 'utf8'
  const kind = data.kind === 'fit' ? 'fit' : 'gpx'
  const target = data.target === 'coros' ? 'coros' : null

  return {
    id: data.id as string,
    name: data.name as string,
    filename: data.filename as string,
    mimeType: (data.mime_type as string) || 'application/octet-stream',
    encoding,
    kind,
    target,
    content: data.content as string,
    createdAt: data.created_at as string,
    expiresAt,
  }
}

export function routeExportToBlob(record: RouteExportRecord): Blob {
  if (record.encoding === 'base64') {
    const bytes = base64ToBytes(record.content)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return new Blob([copy], { type: record.mimeType })
  }
  return new Blob([record.content], { type: record.mimeType })
}
