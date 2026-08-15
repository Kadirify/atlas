import { BookOpen, Briefcase, CodeXml, Coffee, Heart, Languages, Smile, type LucideIcon } from 'lucide-react'
import type { PersonaIcon } from '@shared/types'
import { LogoMark } from '@/components/Logo'
import { useLocale, useT } from '@/lib/useT'

export const PERSONA_ICON_MAP: Record<Exclude<PersonaIcon, 'atlas'>, LucideIcon> = {
  smile: Smile,
  briefcase: Briefcase,
  code: CodeXml,
  languages: Languages,
  heart: Heart,
  book: BookOpen,
  coffee: Coffee
}

/** Kişiliğin yuvarlak simgesi. Atlas kendi logosunu kullanır. */
export function PersonaAvatar({
  icon,
  size = 32,
  letter
}: {
  icon: PersonaIcon
  size?: number
  /** Verilirse simge yerine bu adın baş harfi gösterilir (WhatsApp'tan öğrenilen kişiler). */
  letter?: string
}) {
  const locale = useLocale()
  if (icon === 'atlas') return <LogoMark size={size} className="shrink-0" />
  if (letter?.trim()) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-teal font-display font-semibold text-surface"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
        aria-hidden
      >
        {letter.trim()[0].toLocaleUpperCase(locale)}
      </span>
    )
  }
  const Icon = PERSONA_ICON_MAP[icon] ?? Smile
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.55)} />
    </span>
  )
}

/**
 * Mesajlaşan kişiliklerin cevabı: boş satırla ayrılmış her parça ayrı bir balon.
 * Yazılırken (typing) yalnızca tamamlanan balonlar görünür; sıradaki için "yazıyor" noktaları çıkar.
 */
export function Bubbles({ text, typing = false }: { text: string; typing?: boolean }) {
  const t = useT()
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  // Son parça hâlâ yazılıyor olabilir; metin boş satırla bittiyse o da tamamdır.
  const finished = typing && !/\n\s*\n\s*$/.test(text) ? parts.slice(0, -1) : parts
  return (
    <div className="flex flex-col items-start gap-1.5">
      {finished.map((part, i) => (
        <div
          key={i}
          className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink"
        >
          {part}
        </div>
      ))}
      {typing && (
        <div className="typing rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3.5" role="status" aria-label={t.chat.typing}>
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}
