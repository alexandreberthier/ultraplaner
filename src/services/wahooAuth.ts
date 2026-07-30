const TOKEN_KEY = 'ultraplaner-wahoo-tokens'
const PKCE_KEY = 'ultraplaner-wahoo-pkce'
const AUTH_BASE = 'https://api.wahooligan.com'
const SCOPES = 'routes_read routes_write offline_data user_read'

export type WahooTokens = {
  accessToken: string
  refreshToken: string
  /** Epoch ms when access token expires */
  expiresAt: number
}

type PkcePending = {
  verifier: string
  returnUrl: string
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type?: string
}

function clientId(): string {
  return (import.meta.env.VITE_WAHOO_CLIENT_ID as string | undefined)?.trim() || ''
}

export function wahooConfigured(): boolean {
  return clientId().length > 0
}

export function wahooRedirectUri(): string {
  const override = (import.meta.env.VITE_WAHOO_REDIRECT_URI as string | undefined)?.trim()
  if (override) return override
  if (typeof window === 'undefined') return 'https://ultraplaner.com/oauth/wahoo/callback'
  return `${window.location.origin}/oauth/wahoo/callback`
}

function readTokens(): WahooTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WahooTokens
    if (!parsed?.accessToken || !parsed?.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeTokens(tokens: WahooTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function clearWahooTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PKCE_KEY)
  } catch {
    /* ignore */
  }
}

export function isWahooConnected(): boolean {
  return !!readTokens()
}

function randomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
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

function tokensFromResponse(data: TokenResponse): WahooTokens {
  const expiresIn = Number(data.expires_in) || 7200
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Refresh ~60s early
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  }
}

async function postToken(params: Record<string, string>): Promise<WahooTokens> {
  const body = new URLSearchParams(params)
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Wahoo token error ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as TokenResponse
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Wahoo token response incomplete')
  }
  const tokens = tokensFromResponse(data)
  writeTokens(tokens)
  return tokens
}

/** Start OAuth: redirects the browser to Wahoo. */
export async function beginWahooConnect(returnUrl?: string): Promise<void> {
  const id = clientId()
  if (!id) throw new Error('Wahoo client id missing')

  const verifier = randomVerifier()
  const challenge = await sha256Base64Url(verifier)
  const redirectUri = wahooRedirectUri()
  savePkce({
    verifier,
    returnUrl: returnUrl || `${window.location.pathname}${window.location.search}`,
  })

  const url = new URL(`${AUTH_BASE}/oauth/authorize`)
  url.searchParams.set('client_id', id)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  window.location.assign(url.toString())
}

/** Finish OAuth on callback page; returns path to navigate back to. */
export async function completeWahooConnect(code: string): Promise<string> {
  const pending = takePkce()
  if (!pending?.verifier) {
    throw new Error('Wahoo PKCE session missing — start connect again')
  }
  const id = clientId()
  if (!id) throw new Error('Wahoo client id missing')

  await postToken({
    client_id: id,
    code,
    redirect_uri: wahooRedirectUri(),
    grant_type: 'authorization_code',
    code_verifier: pending.verifier,
  })

  return pending.returnUrl || '/'
}

/**
 * Valid access token for API calls. Refreshes only when expired / about to expire,
 * then immediately usable (Wahoo revokes prior tokens after first API use of new token).
 */
export async function getWahooAccessToken(): Promise<string> {
  const current = readTokens()
  if (!current) throw new Error('Wahoo not connected')

  if (Date.now() < current.expiresAt) {
    return current.accessToken
  }

  const id = clientId()
  if (!id) throw new Error('Wahoo client id missing')

  const refreshed = await postToken({
    client_id: id,
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
  })
  return refreshed.accessToken
}
