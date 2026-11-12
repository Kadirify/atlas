import type { Lang } from '@shared/i18n'
import { dictFor } from '@shared/i18n'
import type { PanelAction } from '@shared/types'
import type { OllamaMessage } from './ollama'

/** Panele verilen metnin en fazla bu kadarı modele gider; daha uzunu bağlama sığmaz. */
export const PANEL_TEXT_LIMIT = 12_000

/** Düzeltme ve çeviri gibi işlerde model serbest davranmasın diye düşük sıcaklık kullanılır. */
export function panelTemperature(action: PanelAction): number | undefined {
  if (action === 'fix') return 0.2
  if (action === 'translate') return 0.3
  if (action === 'ask') return undefined
  return 0.5
}

/**
 * Panelden gelen isteği modele gidecek mesajlara çevirir.
 * @param askSystem "Atlas'a sor" modunda kullanılan sistem talimatı (Atlas kişiliği)
 */
export function buildPanelMessages(
  action: PanelAction,
  text: string,
  instruction: string | undefined,
  lang: Lang,
  askSystem: string
): OllamaMessage[] {
  const body = text.trim().slice(0, PANEL_TEXT_LIMIT)
  if (!body) throw new Error('empty')
  const p = dictFor(lang).panel.prompts
  if (action === 'ask') {
    return [
      { role: 'system', content: askSystem },
      { role: 'user', content: body }
    ]
  }
  const wish = (instruction ?? '').trim().slice(0, 500)
  const user = action === 'custom' ? p.custom(wish || p.fix('').split(':')[0], body) : p[action](body)
  return [
    { role: 'system', content: p.system },
    { role: 'user', content: user }
  ]
}
