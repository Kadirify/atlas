import { dictFor, localeOf, type Dict, type Lang } from '@shared/i18n'

/**
 * Arayüzde geçerli dil. App her çizimde bunu ayarlar; dil değişince bütün ekran
 * yeniden kurulduğu için bileşen dışındaki yardımcılar da güncel dili görür.
 *
 * Bu dosya bilerek durum deposuna bağlı değildir: biçimlendirme yardımcıları
 * ve testler onu tarayıcı ortamı olmadan kullanabilir. Bileşenler için `useT` ayrı dosyadadır.
 */
let active: Lang = 'tr'

export function setActiveLanguage(lang: Lang): void {
  active = lang
}

/** Bileşen dışındaki yardımcılar için geçerli sözlük. Bileşenlerde `useT()` kullanın. */
export function T(): Dict {
  return dictFor(active)
}

/** Geçerli yerel ayar kodu: 'tr-TR' ya da 'en-US' */
export function currentLocale(): string {
  return localeOf(active)
}
