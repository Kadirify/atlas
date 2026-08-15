import { dictFor, localeOf, type Dict } from '@shared/i18n'
import { useApp } from '@/stores/app'

/** Bileşenlerde geçerli dilin sözlüğü: `const t = useT()` sonra `t.chat.send` gibi kullanılır. */
export function useT(): Dict {
  return dictFor(useApp((s) => s.settings?.language))
}

/** Tarih ve sayı biçimlendirme için yerel ayar kodu: 'tr-TR' ya da 'en-US' */
export function useLocale(): string {
  return localeOf(useApp((s) => s.settings?.language))
}
