import { dictFor, localeOf, type Dict, type Lang } from '@shared/i18n'

/**
 * Ana süreçte geçerli dil. Hata mesajları ve modele giden talimatlar bu dilde üretilir.
 * Açılışta ve kullanıcı dili değiştirdiğinde güncellenir.
 */
let current: Lang = 'tr'

export function setLanguage(lang: Lang): void {
  current = lang
}

export function getLanguage(): Lang {
  return current
}

/** Geçerli dilin sözlüğü. Örnek: `L().main.ollamaNotRunning` */
export function L(): Dict {
  return dictFor(current)
}

/** Geçerli dilin yerel ayar kodu (tarih ve sayı biçimi için) */
export function locale(): string {
  return localeOf(current)
}
