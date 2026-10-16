import type { AppLocale, SeoGuideKind } from '../i18n'
import {
  garminFitPath,
  localeHomePath,
  poisAlongRoutePath,
  seoGuidePath,
  tGlobal,
} from '../i18n'

const SITE = 'https://ultraplaner.com'
const OG_LOCALES: Record<AppLocale, string> = {
  de: 'de_DE',
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
}

const LANDING_HREFLANG: { lang: string; href: string }[] = [
  { lang: 'de', href: `${SITE}/` },
  { lang: 'en', href: `${SITE}/en/` },
  { lang: 'es', href: `${SITE}/es/` },
  { lang: 'fr', href: `${SITE}/fr/` },
  { lang: 'x-default', href: `${SITE}/` },
]

function ensureMeta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  const selector = attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  return el
}

export function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = href
}

/** Keep Firebase default hosts out of Google Search (canonical alone is not always enough). */
export function enforcePreferredHostSeo() {
  if (typeof window === 'undefined') return
  const h = window.location.hostname
  if (
    h === 'ultraplaner.com' ||
    h === 'www.ultraplaner.com' ||
    h === 'localhost' ||
    h === '127.0.0.1'
  ) {
    return
  }
  if (!/\.web\.app$/.test(h) && !/\.firebaseapp\.com$/.test(h)) return

  ensureMeta('name', 'robots').content = 'noindex, nofollow'

  const path = window.location.pathname
  if (path.startsWith('/__/') || path.startsWith('/oauth/')) return
  const target = `${SITE}${path}${window.location.search}${window.location.hash}`
  if (window.location.href !== target) {
    window.location.replace(target)
  }
}

function clearHreflang() {
  document.head
    .querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')
    .forEach((el) => el.remove())
}

function setHreflang(links: { lang: string; href: string }[]) {
  clearHreflang()
  for (const { lang, href } of links) {
    const link = document.createElement('link')
    link.rel = 'alternate'
    link.hreflang = lang
    link.href = href
    document.head.appendChild(link)
  }
}

const LD_ID = 'ld-landing'
const FAQ_IDS = ['q1', 'q17', 'q3', 'q6', 'q19', 'q13', 'q14', 'q11'] as const

function setJsonLd(data: unknown) {
  let el = document.getElementById(LD_ID) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = LD_ID
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

function landingJsonLd(locale: AppLocale, canonicalUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${SITE}/#app`,
        name: 'UltraPlaner',
        url: canonicalUrl,
        applicationCategory: 'TravelApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript. HTML5.',
        inLanguage: locale,
        description: String(tGlobal('seo.description')),
        image: `${SITE}/og-image.jpg`,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          areaServed: { '@type': 'Place', name: 'Europe' },
        },
        isAccessibleForFree: true,
      },
      {
        '@type': 'WebSite',
        '@id': `${canonicalUrl}#website`,
        url: canonicalUrl,
        name: 'UltraPlaner',
        description: String(tGlobal('seo.ogDescription')),
        inLanguage: locale,
        publisher: {
          '@type': 'Organization',
          '@id': `${SITE}/#organization`,
          name: 'UltraPlaner',
          url: `${SITE}/`,
          logo: {
            '@type': 'ImageObject',
            url: `${SITE}/logo-ultraplaner.png`,
            width: 1024,
            height: 1024,
          },
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        url: canonicalUrl,
        inLanguage: locale,
        mainEntity: FAQ_IDS.map((id) => ({
          '@type': 'Question',
          name: String(tGlobal(`landing.faq.${id}`)),
          acceptedAnswer: {
            '@type': 'Answer',
            text: String(tGlobal(`landing.faq.a${id.slice(1)}`)),
          },
        })),
      },
    ],
  }
}

function webPageJsonLd(opts: { name: string; description: string; url: string; locale: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.locale,
    isPartOf: { '@type': 'WebSite', name: 'UltraPlaner', url: `${SITE}/` },
  }
}

function guideHreflang(pathFor: (locale: AppLocale) => string) {
  return [
    { lang: 'de', href: `${SITE}${pathFor('de')}` },
    { lang: 'en', href: `${SITE}${pathFor('en')}` },
    { lang: 'es', href: `${SITE}${pathFor('es')}` },
    { lang: 'fr', href: `${SITE}${pathFor('fr')}` },
    { lang: 'x-default', href: `${SITE}${pathFor('de')}` },
  ]
}

/** Landing locale URL used as canonical (map views point back to the locale home). */
export function applyDocumentSeo(locale: AppLocale) {
  const title = String(tGlobal('seo.title'))
  const description = String(tGlobal('seo.description'))
  const ogDescription = String(tGlobal('seo.ogDescription'))
  const canonicalUrl = `${SITE}${localeHomePath(locale)}`

  document.title = title
  document.documentElement.lang = locale

  ensureMeta('name', 'description').content = description
  ensureMeta('property', 'og:title').content = title
  ensureMeta('property', 'og:description').content = ogDescription
  ensureMeta('property', 'og:url').content = canonicalUrl
  ensureMeta('property', 'og:locale').content = OG_LOCALES[locale]
  ensureMeta('name', 'twitter:title').content = String(tGlobal('seo.twitterTitle'))
  ensureMeta('name', 'twitter:description').content = String(tGlobal('seo.twitterDescription'))

  setCanonical(canonicalUrl)
  setHreflang(LANDING_HREFLANG)
  setJsonLd(landingJsonLd(locale, canonicalUrl))
}

/** Supply-guide page SEO (self-canonical + guide hreflang). */
export function applyGuideSeo(locale: AppLocale) {
  const title = String(tGlobal('landing.poiGuide.seoTitle'))
  const description = String(tGlobal('landing.poiGuide.seoDescription'))
  const path = poisAlongRoutePath(locale)
  const canonicalUrl = `${SITE}${path}`

  document.title = title
  document.documentElement.lang = locale

  ensureMeta('name', 'description').content = description
  ensureMeta('property', 'og:title').content = title
  ensureMeta('property', 'og:description').content = description
  ensureMeta('property', 'og:url').content = canonicalUrl
  ensureMeta('property', 'og:locale').content = OG_LOCALES[locale]

  setCanonical(canonicalUrl)
  setHreflang(guideHreflang(poisAlongRoutePath))
  setJsonLd(
    webPageJsonLd({ name: title, description, url: canonicalUrl, locale }),
  )
}

/** Intent SEO guides (Garmin FIT course points). */
export function applyTopicGuideSeo(locale: AppLocale, kind: SeoGuideKind) {
  const title = String(tGlobal(`landing.${kind}.seoTitle`))
  const description = String(tGlobal(`landing.${kind}.seoDescription`))
  const path = seoGuidePath(kind, locale)
  const canonicalUrl = `${SITE}${path}`

  document.title = title
  document.documentElement.lang = locale

  ensureMeta('name', 'description').content = description
  ensureMeta('property', 'og:title').content = title
  ensureMeta('property', 'og:description').content = description
  ensureMeta('property', 'og:url').content = canonicalUrl
  ensureMeta('property', 'og:locale').content = OG_LOCALES[locale]

  setCanonical(canonicalUrl)
  setHreflang(guideHreflang(garminFitPath))
  setJsonLd(
    webPageJsonLd({ name: title, description, url: canonicalUrl, locale }),
  )
}

/** Legal pages (DE only): self-canonical, no landing hreflang/FAQ schema responsibility. */
export function applyLegalSeo(opts: { title: string; description: string; path: string }) {
  const canonicalUrl = `${SITE}${opts.path}`
  document.title = opts.title
  document.documentElement.lang = 'de'
  ensureMeta('name', 'description').content = opts.description
  ensureMeta('property', 'og:title').content = opts.title
  ensureMeta('property', 'og:description').content = opts.description
  ensureMeta('property', 'og:url').content = canonicalUrl
  ensureMeta('property', 'og:locale').content = 'de_DE'
  setCanonical(canonicalUrl)
  clearHreflang()
  setJsonLd(
    webPageJsonLd({
      name: opts.title,
      description: opts.description,
      url: canonicalUrl,
      locale: 'de',
    }),
  )
}
