import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = 'ultracycling-8bd56'
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!
const auth = new GoogleAuth({
  keyFile: credPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const client = await auth.getClient()
const token = (await client.getAccessToken()).token!

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const text = await res.text()
  console.log(init?.method || 'GET', path, res.status)
  console.log(text.slice(0, 2000))
  return res
}

await api(`projects/${PROJECT_ID}/releases/cloud.firestore`)
await api(`projects/${PROJECT_ID}/rulesets/20c2f2e1-19a8-4628-b241-76644e616ac2`)

const rules = readFileSync('firestore.rules', 'utf8')
const createRes = await api(`projects/${PROJECT_ID}/rulesets`, {
  method: 'POST',
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
})
const ruleset = JSON.parse(await createRes.clone().text())

await api(`projects/${PROJECT_ID}/releases/cloud.firestore`, {
  method: 'PATCH',
  body: JSON.stringify({
    release: { rulesetName: ruleset.name },
  }),
})
