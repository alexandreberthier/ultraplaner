# Garmin Connect (Courses API)

Confidential vendor PDFs stay local (gitignored). Integration summary:

- OAuth authorize: `https://connect.garmin.com/oauth2Confirm`
- Token (server-only): `https://diauth.garmin.com/di-oauth2-service/oauth/token`
- Create course: `POST https://apis.garmin.com/training-api/courses/v1/course`

## Deploy token proxy (required)

```bash
# once, from repo root — use values from .env (never commit secrets)
npx supabase login
npx supabase link --project-ref <your-supabase-project-ref>

npx supabase secrets set GARMIN_CLIENT_ID=... GARMIN_CLIENT_SECRET=...
npx supabase functions deploy garmin-token --no-verify-jwt
```

Frontend needs `VITE_GARMIN_CLIENT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Redirect URI in Garmin portal: `https://ultraplaner.com/oauth/garmin/callback`
