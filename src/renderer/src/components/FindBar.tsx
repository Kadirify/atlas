import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui'
import { useT } from '@/lib/useT'

const MAX_MATCHES = 2000

/** Kabın içindeki metinde aranan sözü bulur; büyük-küçük harf ayrımı yapmaz (Türkçe İ/ı dahil). */
function findRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLocaleLowerCase('tr')
  if (!needle) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node && ranges.length < MAX_MATCHES; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    // Türkçe küçültme "İ" harfinde uzunluğu değiştirebilir; o durumda konumlar kayar, düz küçültme kullanılır.
    const tr = text.toLocaleLowerCase('tr')
    const hay = tr.length === text.length ? tr : text.toLowerCase()
    const key = tr.length === text.length ? needle : query.toLowerCase()
    for (let at = hay.indexOf(key); at !== -1 && ranges.length < MAX_MATCHES; at = hay.indexOf(key, at + key.length)) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + key.length)
      ranges.push(range)
    }
  }
  return ranges
}

/**
 * Sohbet içinde arama çubuğu (Ctrl+F). Eşleşmeler metne dokunmadan, tarayıcının vurgu katmanıyla işaretlenir.
 * `version` değişince (yeni mesaj, akan cevap) arama yenilenir.
 */
export default function FindBar({ container, version, onClose }: { container: HTMLElement | null; version: unknown; onClose(): void }) {
  const t = useT()
  const f = t.chat.find
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    return () => {
      CSS.highlights.delete('atlas-find')
      CSS.highlights.delete('atlas-find-current')
    }
  }, [])

  useEffect(() => {
    const found = container ? findRanges(container, query.trim()) : []
    ranges.current = found
    setCount(found.length)
    setIndex((i) => (found.length === 0 ? 0 : Math.min(i, found.length - 1)))
    if (found.length > 0) CSS.highlights.set('atlas-find', new Highlight(...found))
    else CSS.highlights.delete('atlas-find')
  }, [container, query, version])

  useEffect(() => {
    const current = ranges.current[index]
    if (!current) {
      CSS.highlights.delete('atlas-find-current')
      return
    }
    CSS.highlights.set('atlas-find-current', new Highlight(current))
    current.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [index, count, query])

  const step = (by: number): void => {
    if (count > 0) setIndex((i) => (i + by + count) % count)
  }

  return (
    <div
      role="search"
      aria-label={f.label}
      className="absolute top-2 right-4 z-20 flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-3 shadow-pop"
    >
      <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder={f.placeholder}
        aria-label={f.placeholder}
        className="h-8 w-[200px] bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
      />
      <span className="min-w-[52px] text-right text-xs text-ink-3 tabular-nums" aria-live="polite">
        {query.trim() ? (count > 0 ? f.count(index + 1, count) : f.none) : ''}
      </span>
      <IconButton label={f.previous} disabled={count === 0} onClick={() => step(-1)}>
        <ChevronUp size={16} aria-hidden />
      </IconButton>
      <IconButton label={f.next} disabled={count === 0} onClick={() => step(1)}>
        <ChevronDown size={16} aria-hidden />
      </IconButton>
      <IconButton label={f.close} onClick={onClose}>
        <X size={16} aria-hidden />
      </IconButton>
    </div>
  )
}
