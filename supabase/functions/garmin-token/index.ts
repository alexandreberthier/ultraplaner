/**
 * Garmin OAuth token exchange (authorization_code | refresh_token).
 * Client secret stays here — never in Vite.
 *
 * Deploy:
 *   supabase secrets set GARMIN_CLIENT_SECRET=... GARMIN_CLIENT_ID=...
 *   supabase functions deploy garmin-token --no-verify-jwt
 *
 * POST JSON: { grant_type, code?, code_verifier?, refresh_token?, redirect_uri? }
 */
import { corsHeaders } from '../_shared/cors.ts'

const TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const clientId = Deno.env.get('GARMIN_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('GARMIN_CLIENT_SECRET') ?? ''
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const grantType = String(body.grant_type ?? '')
  const params = new URLSearchParams()
  params.set('grant_type', grantType)

  if (grantType === 'authorization_code') {
    const code = String(body.code ?? '')
    const codeVerifier = String(body.code_verifier ?? '')
    const redirectUri = String(body.redirect_uri ?? '')
    if (!code || !codeVerifier) {
      return new Response(JSON.stringify({ error: 'missing_code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    params.set('code', code)
    params.set('code_verifier', codeVerifier)
    if (redirectUri) params.set('redirect_uri', redirectUri)
  } else if (grantType === 'refresh_token') {
    const refreshToken = String(body.refresh_token ?? '')
    if (!refreshToken) {
      return new Response(JSON.stringify({ error: 'missing_refresh_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    params.set('refresh_token', refreshToken)
  } else {
    return new Response(JSON.stringify({ error: 'unsupported_grant' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const basic = btoa(`${clientId}:${clientSecret}`)
  const garminRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params,
  })

  const text = await garminRes.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { error: 'invalid_garmin_response', raw: text.slice(0, 200) }
  }

  return new Response(JSON.stringify(json), {
    status: garminRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
