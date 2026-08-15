import { dict as en } from './en'
import { dict as tr, type Dict } from './tr'

export type { Dict }

/** Arayüzün ve modele giden talimatların dili */
export type Lang = 'tr' | 'en'

export const LANGS: Lang[] = ['tr', 'en']

const DICTS: Record<Lang, Dict> = { tr, en }

/** Dilin sözlüğü; bilinmeyen ya da boş değerde Türkçe döner. */
export function dictFor(lang: Lang | null | undefined): Dict {
  return (lang && DICTS[lang]) || tr
}

/** Tarih ve sayı biçimlendirme için yerel ayar kodu */
export function localeOf(lang: Lang | null | undefined): string {
  return lang === 'en' ? 'en-US' : 'tr-TR'
}

/** İşletim sisteminin diline göre başlangıç dili: Türkçe sistemde Türkçe, diğerlerinde İngilizce. */
export function langFromLocale(locale: string | null | undefined): Lang {
  return (locale ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}
