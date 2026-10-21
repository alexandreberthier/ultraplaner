/**
 * Garmin Connect OAuth 2.0 PKCE (Courses API).
 * Token exchange goes through Supabase Edge Function `garmin-token` (holds client secret).
 */
const TOKEN_KEY = 'ultraplaner-garmin-tokens'
const PKCE_KEY = 'ultraplaner-garmin-pkce'
const AUTH_URL = 'https://connect.garmin.com/oauth2Confirm'

export type GarminTokens = {
  accessToken: string
  refreshToken: string
  /** Epoch ms when access token should be refreshed */
  expiresAt: number
}

type PkcePending = {
  verifier: string
  returnUrl: string
  state: string
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
  refresh_token_expires_in?: number
}

function clientId(): string {
  return (import.meta.env.VITE_GARMIN_CLIENT_ID as string | undefined)?.trim() || ''
}

function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
}

function supabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''
}

export function garminConfigured(): boolean {
  return clientId().length > 0 && supabaseUrl().length > 0 && supabaseAnonKey().length > 0
}

export function garminRedirectUri(): string {
  const override = (import.meta.env.VITE_GARMIN_REDIRECT_URI as string | undefined)?.trim()
  if (override) return override
  if (typeof window === 'undefined') return 'https://ultraplaner.com/oauth/garmin/callback'
  return `${window.location.origin}/oauth/garmin/callback`
}

function tokenProxyUrl(): string {
  return `${supabaseUrl().replace(/\/$/, '')}/functions/v1/garmin-token`
}

function readTokens(): GarminTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GarminTokens
    if (!parsed?.accessToken || !parsed?.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeTokens(tokens: GarminTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function clearGarminTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PKCE_KEY)
  } catch {
    /* ignore */
  }
}

export function isGarminConnected(): boolean {
  return !!readTokens()
}

function randomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i]! % chars.length]!
  }
  return out
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function savePkce(pending: PkcePending) {
  localStorage.setItem(PKCE_KEY, JSON.stringify(pending))
}

function takePkce(): PkcePending | null {
  try {
    const raw = localStorage.getItem(PKCE_KEY)
    localStorage.removeItem(PKCE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PkcePending
  } catch {
    return null
  }
}

function tokensFromResponse(data: TokenResponse): GarminTokens {
  // Garmin recommends subtracting ≥600s from expires_in
  const expiresIn = Number(data.expires_in) || 86400
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 600) * 1000,
  }
}

async function postTokenViaProxy(payload: Record<string, string>): Promise<GarminTokens> {
  const res = await fetch(tokenProxyUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey()}`,
      apikey: supabaseAnonKey(),
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string }
  if (!res.ok || !data.access_token || !data.refresh_token) {
    const detail = data.error || `status ${res.status}`
    throw new Error(`Garmin token error: ${detail}`)
  }
  const tokens = tokensFromResponse(data)
  writeTokens(tokens)
  return tokens
}

/** Start OAuth: redirects the browser to Garmin Connect. */
export async function beginGarminConnect(returnUrl?: string): Promise<void> {
  const id = clientId()
  if (!id) throw new Error('Garmin client id missing')
  if (!garminConfigured()) throw new Error('Garmin not configured')

  const verifier = randomVerifier()
  const challenge = await sha256Base64Url(verifier)
  const state = randomVerifier(32)
  const redirectUri = garminRedirectUri()
  savePkce({
    verifier,
    state,
    returnUrl: returnUrl || `${window.location.pathname}${window.location.search}`,
  })

  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', id)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)

  window.location.assign(url.toString())
}

/** Finish OAuth on callback page; returns path to navigate back to. */
export async function completeGarminConnect(code: string, state: string): Promise<string> {
  const pending = takePkce()
  if (!pending?.verifier) {
    throw new Error('Garmin PKCE session missing — start connect again')
  }
  if (pending.state && state && pending.state !== state) {
    throw new Error('Garmin OAuth state mismatch')
  }

  await postTokenViaProxy({
    grant_type: 'authorization_code',
    code,
    code_verifier: pending.verifier,
    redirect_uri: garminRedirectUri(),
  })

  return pending.returnUrl || '/'
}

export async function getGarminAccessToken(): Promise<string> {
  const current = readTokens()
  if (!current) throw new Error('Garmin not connected')

  if (Date.now() < current.expiresAt) {
    return current.accessToken
  }

  const refreshed = await postTokenViaProxy({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
  })
  return refreshed.accessToken
}

/** Call on disconnect (Garmin requires DELETE registration when user disconnects in-app). */
export async function deregisterGarminUser(): Promise<void> {
  const token = await getGarminAccessToken().catch(() => null)
  if (!token) {
    clearGarminTokens()
    return
  }
  try {
    await fetch('https://apis.garmin.com/partner-gateway/rest/user/registration', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
  } catch {
    /* best-effort */
  }
  clearGarminTokens()
}
