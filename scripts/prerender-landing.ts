/**
 * Prerender SEO pages after Vite build.
 * Writes fully rendered HTML so crawlers see content without executing JS.
 *
 * Soft by default: failures warn and exit 0 so `npm run deploy` still ships.
 * Set PRERENDER_STRICT=1 to fail the process on errors.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const PORT = 4179
const BASE = `http://127.0.0.1:${PORT}`
const DIST = resolve('dist')
const SITE = 'https://ultraplaner.com'
const STRICT = process.env.PRERENDER_STRICT === '1'

type PageKind = 'landing' | 'guide' | 'legal'

const PAGES: { path: string; out: string; lang: string; kind: PageKind }[] = [
  { path: '/', out: 'index.html', lang: 'de', kind: 'landing' },
  { path: '/en/', out: 'en/index.html', lang: 'en', kind: 'landing' },
  { path: '/es/', out: 'es/index.html', lang: 'es', kind: 'landing' },
  { path: '/fr/', out: 'fr/index.html', lang: 'fr', kind: 'landing' },
  {
    path: '/versorgung-ultracycling/',
    out: 'versorgung-ultracycling/index.html',
    lang: 'de',
    kind: 'guide',
  },
  {
    path: '/en/ultracycling-supply/',
    out: 'en/ultracycling-supply/index.html',
    lang: 'en',
    kind: 'guide',
  },
  {
    path: '/es/avituallamiento-ultracycling/',
    out: 'es/avituallamiento-ultracycling/index.html',
    lang: 'es',
    kind: 'guide',
  },
  {
    path: '/fr/ravitaillement-ultracycling/',
    out: 'fr/ravitaillement-ultracycling/index.html',
    lang: 'fr',
    kind: 'guide',
  },
  { path: '/datenschutz/', out: 'datenschutz/index.html', lang: 'de', kind: 'legal' },
  { path: '/impressum/', out: 'impressum/index.html', lang: 'de', kind: 'legal' },
]

const GUIDE_HREFLANG: Record<string, string> = {
  de: `${SITE}/versorgung-ultracycling/`,
  en: `${SITE}/en/ultracycling-supply/`,
  es: `${SITE}/es/avituallamiento-ultracycling/`,
  fr: `${SITE}/fr/ravitaillement-ultracycling/`,
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForServer(url: string, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return
    } catch {
      /* retry */
    }
    await wait(250)
  }
  throw new Error(`Preview server not ready: ${url}`)
}

function startPreview(): ChildProcess {
  const viteBin = resolve('node_modules/vite/bin/vite.js')
  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    }
  )
  child.stdout?.on('data', (d: Buffer) => {
    if (process.env.DEBUG_PRERENDER) process.stdout.write(d)
  })
  child.stderr?.on('data', (d: Buffer) => {
    if (process.env.DEBUG_PRERENDER) process.stderr.write(d)
  })
  return child
}

function stopPreview(child: ChildProcess) {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } else {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }, 1000)
    }
  } catch {
    /* ignore */
  }
}

function replaceOrInsertCanonical(html: string, href: string): string {
  if (/rel=["']canonical["']/i.test(html)) {
    return html.replace(
      /<link[^>]*rel=["']canonical["'][^>]*>/i,
      `<link rel="canonical" href="${href}">`
    )
  }
  return html.replace(/<\/head>/i, `<link rel="canonical" href="${href}">\n</head>`)
}

function stripLandingLdJson(html: string): string {
  return html
    .replace(/<script[^>]*id=["']ld-landing["'][^>]*>[\s\S]*?<\/script>/i, '')
    .replace(/<script type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, (block) =>
      /FAQPage|WebApplication|"@type"\s*:\s*"WebSite"/i.test(block) ? '' : block
    )
}

function stripAlternateHreflang(html: string): string {
  return html.replace(/<link[^>]*rel=["']alternate["'][^>]*hreflang=[^>]*>/gi, '')
}

function insertGuideHreflang(html: string): string {
  const tags = Object.entries(GUIDE_HREFLANG)
    .map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${href}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${GUIDE_HREFLANG.de}">`)
    .join('\n')
  return html.replace(/<\/head>/i, `${tags}\n</head>`)
}

function insertWebPageLd(html: string, opts: { name: string; description: string; url: string }): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    isPartOf: { '@type': 'WebSite', name: 'UltraPlaner', url: `${SITE}/` },
  }
  const tag = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
  return html.replace(/<\/head>/i, `${tag}\n</head>`)
}

function patchHtml(
  html: string,
  entry: { path: string; lang: string; kind: PageKind }
): string {
  let out = html
  out = out.replaceAll(`http://127.0.0.1:${PORT}/`, '/')
  out = out.replaceAll(`http://localhost:${PORT}/`, '/')
  out = out.replace(/<html\b([^>]*)>/i, (_m, attrs: string) => {
    if (/\blang=/.test(attrs)) {
      return `<html${attrs.replace(/\blang=(["']).*?\1/i, `lang="${entry.lang}"`)}>`
    }
    return `<html lang="${entry.lang}"${attrs}>`
  })

  // Noscript shell is only for JS-off; prerendered pages already have real content.
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, '')

  const canonical = `${SITE}${entry.path === '/' ? '/' : entry.path}`

  if (entry.kind === 'landing') {
    out = replaceOrInsertCanonical(out, canonical)
    // Ensure trailing-slash hreflang (in case shell still had old links)
    out = out.replace(
      /href="https:\/\/ultraplaner\.com\/(en|es|fr)"(?![/\w])/g,
      'href="https://ultraplaner.com/$1/"'
    )
  } else if (entry.kind === 'guide') {
    out = stripLandingLdJson(out)
    out = stripAlternateHreflang(out)
    out = replaceOrInsertCanonical(out, canonical)
    out = insertGuideHreflang(out)
    const titleMatch = out.match(/<title>([^<]*)<\/title>/i)
    const descMatch = out.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    out = insertWebPageLd(out, {
      name: titleMatch?.[1]?.trim() || 'UltraPlaner',
      description: descMatch?.[1]?.trim() || '',
      url: canonical,
    })
  } else {
    out = stripLandingLdJson(out)
    out = stripAlternateHreflang(out)
    out = replaceOrInsertCanonical(out, canonical)
    const titleMatch = out.match(/<title>([^<]*)<\/title>/i)
    const descMatch = out.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    out = insertWebPageLd(out, {
      name: titleMatch?.[1]?.trim() || 'UltraPlaner',
      description: descMatch?.[1]?.trim() || '',
      url: canonical,
    })
  }

  if (!out.includes('data-prerendered')) {
    out = out.replace('<body', `<body data-prerendered="${entry.kind}"`)
  }
  return out
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'playwright ist nicht installiert. Einmal: npm i -D playwright && npx playwright install chromium'
    )
  }
}

async function main() {
  let preview: ChildProcess | null = null
  let failed = false

  try {
    console.log('[prerender] Starte vite preview…')
    preview = startPreview()
    await waitForServer(`${BASE}/`)

    const { chromium } = await loadPlaywright()
    console.log('[prerender] Browser…')
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      locale: 'de-DE',
      serviceWorkers: 'block',
    })
    await context.route('**/*', async (route) => {
      const url = route.request().url()
      if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
        await route.continue()
        return
      }
      await route.abort()
    })

    const page = await context.newPage()

    for (const entry of PAGES) {
      const url = `${BASE}${entry.path}`
      console.log(`[prerender] ${url} → dist/${entry.out}`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('h1.hero-title, .guide-body h1, .privacy-policy h1, .imprint h1, main h1', {
        timeout: 30_000,
      })
      await wait(500)

      const html = patchHtml(await page.content(), entry)
      const outPath = resolve(DIST, entry.out)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, html, 'utf8')
    }

    await browser.close()
    console.log('[prerender] Fertig.')
  } catch (err) {
    failed = true
    console.warn('[prerender] Übersprungen / Fehler (Deploy läuft weiter):', err)
  } finally {
    if (preview) stopPreview(preview)
  }

  if (failed && STRICT) process.exit(1)
  process.exit(0)
}

void main()
