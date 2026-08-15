import type { Conversation, Fit, Tier } from '@shared/types'
import { currentLocale, T } from '@/lib/i18n'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Ondalık sayıyı geçerli dilin yazımıyla verir (Türkçede virgül, İngilizcede nokta). */
function decimal(value: number, digits: number): string {
  return value.toLocaleString(currentLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${decimal(bytes / 1e9, 2)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${Math.max(0, Math.round(bytes))} ${T().common.units.bytes}`
}

export function formatGb(gb: number): string {
  return `${decimal(gb, 1)} GB`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const u = T().common.units
  if (seconds < 60) return `${Math.ceil(seconds)} ${u.second}`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} ${u.minute}`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h} ${u.hour} ${m} ${u.minute}` : `${h} ${u.hour}`
}

/**
 * Sözlükteki bir tabloyu, her okunduğunda geçerli dilden getiren nesneye çevirir.
 * Böylece `TIER_LABEL[tier]` gibi kullanımlar dil değişince de doğru metni verir.
 */
function localized<K extends string>(pick: () => Record<K, string>): Record<K, string> {
  return new Proxy({} as Record<K, string>, { get: (_target, key) => pick()[key as K] })
}

export const TIER_LABEL: Record<Tier, string> = localized(() => T().common.tier)

export const TIER_ORDER: Tier[] = ['baslangic', 'orta', 'iyi', 'guclu']

export const TIER_SUMMARY: Record<Tier, string> = localized(() => T().common.tierSummary)

export const FIT_LABEL: Record<Fit, string> = localized(() => T().common.fit)

/** Model saniyede kaç token ürettiğini bildirir; bir kelime yaklaşık iki token eder. */
export function wordsPerSec(tokensPerSec: number): number {
  return Math.max(1, Math.round(tokensPerSec / 2))
}

export function speedLabel(tokensPerSec: number): { label: string; tone: 'good' | 'ok' | 'slow' } {
  const tone = tokensPerSec >= 25 ? 'good' : tokensPerSec >= 8 ? 'ok' : 'slow'
  return { label: T().common.speed[tone], tone }
}

export interface ConversationGroup {
  label: string
  items: Conversation[]
}

export function groupConversations(list: Conversation[], now = new Date()): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  const g = T().common.groups
  const groups: ConversationGroup[] = [
    { label: g.pinned, items: [] },
    { label: g.today, items: [] },
    { label: g.yesterday, items: [] },
    { label: g.lastWeek, items: [] },
    { label: g.older, items: [] }
  ]
  for (const c of list) {
    if (c.pinned) groups[0].items.push(c)
    else if (c.updatedAt >= startOfToday) groups[1].items.push(c)
    else if (c.updatedAt >= startOfToday - day) groups[2].items.push(c)
    else if (c.updatedAt >= startOfToday - 7 * day) groups[3].items.push(c)
    else groups[4].items.push(c)
  }
  return groups.filter((group) => group.items.length > 0)
}

/**
 * Modeller cevabı bazen bütünüyle bir kod bloğunun (```) içine yazar.
 * Metnin tamamı tek bir blokla sarılıysa sarmalayıcıyı atar; içindeki bloklara dokunmaz.
 */
export function stripFence(text: string): string {
  const match = /^\s*```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text)
  // İçeride başka bir blok varsa bu, sarmalayıcı değil gerçek içeriktir.
  return match && !match[1].includes('```') ? match[1].trim() : text.trim()
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
