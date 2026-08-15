import {
  DEFAULT_PERSONA_ID,
  PERSONA_ICONS,
  type Level,
  type Persona,
  type PersonaDraft,
  type PersonaIcon
} from '@shared/types'
import { dictFor, type Dict, type Lang } from '@shared/i18n'
import type { Db } from '../db'
import { getLanguage, L } from '../i18n'

/** Hazır kişiliklerin dile bağlı olmayan ayarları. Ad, tanıtım ve karakter tanımı sözlükten gelir. */
type BuiltinKey = keyof Dict['prompts']['personas']['builtin']

const BUILTIN_SETTINGS: { key: BuiltinKey; icon: PersonaIcon; levels: [Level, Level, Level, Level]; multiMessage: boolean }[] = [
  { key: 'atlas', icon: 'atlas', levels: [1, 0, 1, 0], multiMessage: false },
  { key: 'kanka', icon: 'smile', levels: [2, 2, 0, 1], multiMessage: true },
  { key: 'danisman', icon: 'briefcase', levels: [1, 0, 1, 0], multiMessage: false },
  { key: 'yazilim', icon: 'code', levels: [0, 0, 1, 0], multiMessage: false },
  { key: 'ingilizce', icon: 'languages', levels: [2, 1, 0, 0], multiMessage: false }
]

/**
 * Uygulamayla gelen kişilikler, istenen dilde. İlki varsayılandır.
 * Kimlikler (builtin:atlas, builtin:kanka ...) dile göre değişmez.
 */
export function builtinPersonas(lang: Lang): Persona[] {
  const texts = dictFor(lang).prompts.personas.builtin
  return BUILTIN_SETTINGS.map(({ key, icon, levels, multiMessage }) => {
    const [warmth, humor, length, emoji] = levels
    return {
      id: `builtin:${key}`,
      name: texts[key].name,
      tagline: texts[key].tagline,
      icon,
      prompt: texts[key].prompt.replace(/\n\s+/g, '\n').trim(),
      warmth,
      humor,
      // İngilizcede bu kimlik yazı koçudur; düzeltilmiş metni vereceği için kısa yazmaya zorlanmaz.
      length: key === 'ingilizce' && lang === 'en' ? 1 : length,
      emoji,
      multiMessage,
      builtin: true,
      whatsapp: false
    }
  })
}

/** Türkçe hazır kişilikler. Dile göre liste için builtinPersonas kullanılır. */
export const BUILTIN_PERSONAS: Persona[] = builtinPersonas('tr')

export function listPersonas(db: Db): Persona[] {
  return [...builtinPersonas(getLanguage()), ...db.listPersonas()]
}

/** Kişilik bulunamazsa (silinmişse) varsayılan Atlas döner. */
export function findPersona(db: Db, id: string | null | undefined): Persona {
  const builtins = builtinPersonas(getLanguage())
  const found = builtins.find((p) => p.id === id) ?? (id ? db.getPersona(id) : null)
  return found ?? builtins.find((p) => p.id === DEFAULT_PERSONA_ID)!
}

function level(value: unknown, fallback: Level): Level {
  return value === 0 || value === 1 || value === 2 ? value : fallback
}

/** Arayüzden gelen kişilik taslağını doğrular. */
export function sanitizePersona(input: unknown): PersonaDraft {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const name = str(raw.name, 40)
  const prompt = str(raw.prompt, 8000)
  if (!name) throw new Error(L().prompts.personas.errors.nameRequired)
  if (!prompt) throw new Error(L().prompts.personas.errors.promptRequired)
  return {
    name,
    tagline: str(raw.tagline, 120),
    icon: PERSONA_ICONS.includes(raw.icon as PersonaIcon) ? (raw.icon as PersonaIcon) : 'smile',
    prompt,
    warmth: level(raw.warmth, 1),
    humor: level(raw.humor, 1),
    length: level(raw.length, 1),
    emoji: level(raw.emoji, 0),
    multiMessage: raw.multiMessage === true
  }
}

/** Kişiliğin karakter tanımı ve ayarlarından çıkan üslup talimatları. */
export function personaInstructions(persona: Persona): string {
  const t = L().prompts.personas
  // WhatsApp'tan öğrenilen kişilerin üslubu gerçek mesajlarından gelir; genel üslup ayarları uygulanmaz.
  if (persona.whatsapp) {
    return [persona.prompt, t.whatsappFormat].join('\n')
  }
  const style = [t.warmth[persona.warmth], t.humor[persona.humor], t.length[persona.length], t.emoji[persona.emoji]].filter(Boolean)
  const format = persona.multiMessage ? t.multiMessageFormat : t.markdownFormat
  // Kullanıcının oluşturduğu kişilikler adını tanımında yazmayabilir; model kendi adını uydurmasın.
  const name = persona.builtin ? '' : t.nameLine(persona.name)
  return [name, persona.prompt, style.join(' '), format].filter(Boolean).join('\n')
}

/** Mesajlaşan kişilikler her zaman "sen" der; diğerleri kullanıcının ayarına uyar. */
export function addressLine(persona: Persona, addressUser: 'sen' | 'siz' | undefined): string {
  // Taklit edilen kişi, gerçek mesajlarında nasıl hitap ediyorsa öyle eder.
  if (persona.whatsapp) return ''
  const t = L().prompts.personas
  return persona.multiMessage || addressUser !== 'siz' ? t.addressInformal : t.addressFormal
}
