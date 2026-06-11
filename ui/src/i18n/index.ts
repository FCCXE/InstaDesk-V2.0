// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\i18n\index.ts
//
// i18n bootstrap (Spanish i18n — Step 1/infra). EN + ES only (operator
// commitment for v1). Language persists to localStorage 'instadesk:lang'
// and falls back to English. Resource strings live in ./locales/*.json and
// are filled in component-by-component during the string-extraction sweep
// (a Spanish glossary for the core terms is approved before that sweep).

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import es from './locales/es.json'

export type Lang = 'en' | 'es'

const STORAGE_KEY = 'instadesk:lang'

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'es') return v
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

/** Change language + persist. Driven by the Settings → Language picker. */
export function setLang(lng: Lang): void {
  i18n.changeLanguage(lng)
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* ignore persistence failure */
  }
}

export default i18n
