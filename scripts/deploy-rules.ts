import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = 'ultracycling-8bd56'
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!
const rules = readFileSync('firestore.rules', 'utf8')

const auth = new GoogleAuth({
  keyFile: credPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const token = (await auth.getClient().then((c) => c.getAccessToken())).token!
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const createRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
  }
)
const ruleset = (await createRes.json()) as { name: string }
console.log('Ruleset:', ruleset.name)

const releaseRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
  {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      release: { rulesetName: ruleset.name },
      updateMask: 'rulesetName',
    }),
  }
)
if (!releaseRes.ok) throw new Error(`${releaseRes.status} ${await releaseRes.text()}`)
console.log('Firestore Rules aktiv ✓')
