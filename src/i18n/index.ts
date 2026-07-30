import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'

export const LOCALE_STORAGE_KEY = 'ultraplaner-locale'
export const SUPPORTED_LOCALES = ['de', 'en', 'es', 'fr'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<AppLocale, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
}

/** Path prefix locales (de = `/`). */
export const PATH_LOCALES = ['en', 'es', 'fr'] as const
export type PathLocale = (typeof PATH_LOCALES)[number]

export function localeHomePath(locale: AppLocale): string {
  return locale === 'de' ? '/' : `/${locale}/`
}

/** SEO topic page: ultracycling supply planning (localized slugs, trailing slash). */
export function poisAlongRoutePath(locale: AppLocale): string {
  switch (locale) {
    case 'en':
      return '/en/ultracycling-supply/'
    case 'es':
      return '/es/avituallamiento-ultracycling/'
    case 'fr':
      return '/fr/ravitaillement-ultracycling/'
    default:
      return '/versorgung-ultracycling/'
  }
}

export function localeFromPath(pathname: string): AppLocale | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  const seg = parts[0]?.toLowerCase()
  if (!seg) return 'de'
  if ((PATH_LOCALES as readonly string[]).includes(seg)) return seg as AppLocale
  // German unprefixed content pages
  if (
    ['datenschutz', 'impressum', 'versorgung-ultracycling', 'pois-entlang-der-route'].includes(seg)
  ) {
    return 'de'
  }
  return null
}

export function isLocaleHomePath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/') return true
  return (PATH_LOCALES as readonly string[]).some((l) => clean === `/${l}`)
}

function detectLocale(): AppLocale {
  if (typeof window !== 'undefined') {
    try {
      const fromPath = localeFromPath(window.location.pathname)
      if (fromPath) return fromPath

      const fromQuery = new URLSearchParams(window.location.search).get('lang')?.toLowerCase()
      if (fromQuery && SUPPORTED_LOCALES.includes(fromQuery as AppLocale)) {
        return fromQuery as AppLocale
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && SUPPORTED_LOCALES.includes(saved as AppLocale)) {
      return saved as AppLocale
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.slice(0, 2).toLowerCase()
    if (lang === 'en' || lang === 'es' || lang === 'fr') return lang
  }
  return 'de'
}

export function saveLocale(locale: AppLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale
}

const initialLocale = detectLocale()
document.documentElement.lang = initialLocale
saveLocale(initialLocale)

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'de',
  messages: { de, en, es, fr },
})

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  saveLocale(locale)
}

export function tGlobal(key: string, params?: Record<string, unknown>) {
  return i18n.global.t(key, params ?? {})
}
