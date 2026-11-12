import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SlashPrompt } from '@shared/types'
import { Button } from '@/components/ui'
import { cn } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const MAX_CUSTOM = 30

export interface SlashMenuHandle {
  /** Mesaj kutusundaki tuşu menü kullandıysa true döner */
  onKeyDown(e: React.KeyboardEvent): boolean
}

/**
 * Hazır istem menüsü: mesaj kutusuna "/" yazınca açılır. Ok tuşlarıyla seçilir, Enter ya da Tab ile kutuya yerleşir.
 * Kullanıcı kendi istemlerini buradan ekler ve siler.
 */
export default function SlashMenu({
  query,
  onPick,
  onClose,
  bind
}: {
  /** "/" işaretinden sonra yazılan kısım */
  query: string
  onPick(text: string): void
  onClose(): void
  /** Mesaj kutusunun tuşlarını menüye iletebilmesi için */
  bind(handle: SlashMenuHandle | null): void
}) {
  const t = useT()
  const s = t.chat.slash
  const custom = useApp((st) => st.settings?.slashPrompts ?? [])
  const saveSettings = useApp((st) => st.saveSettings)
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')

  const items = useMemo(() => {
    const all: (SlashPrompt & { custom: boolean })[] = [
      ...custom.map((p) => ({ ...p, custom: true })),
      ...s.builtin.map((p) => ({ ...p, custom: false }))
    ]
    const q = query.toLocaleLowerCase('tr')
    return q ? all.filter((p) => p.name.toLocaleLowerCase('tr').includes(q)) : all
  }, [custom, s.builtin, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    bind({
      onKeyDown(e) {
        if (adding) return false
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (items.length === 0) return false
          e.preventDefault()
          setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
          return true
        }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          const item = items[active]
          if (!item) return false
          e.preventDefault()
          onPick(item.text)
          return true
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
          return true
        }
        return false
      }
    })
    return () => bind(null)
  }, [items, active, adding, onPick, onClose, bind])

  const add = (): void => {
    const entry = { name: name.trim().slice(0, 40), text: body.trim().slice(0, 4000) }
    if (!entry.name || !entry.text) return
    void saveSettings({ slashPrompts: [entry, ...custom.filter((p) => p.name !== entry.name)].slice(0, MAX_CUSTOM) })
    setAdding(false)
    setName('')
    setBody('')
  }

  const field = 'w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

  return (
    <div
      role="listbox"
      aria-label={s.label}
      className="absolute bottom-full left-0 z-20 mb-2 w-[360px] max-w-full rounded-xl border border-line bg-surface p-1.5 shadow-pop"
    >
      {adding ? (
        <form
          className="space-y-2 p-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePlaceholder} aria-label={s.namePlaceholder} className={cn(field, 'h-9')} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={s.textPlaceholder} aria-label={s.textPlaceholder} className={cn(field, 'resize-none py-2 leading-relaxed')} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit" disabled={!name.trim() || !body.trim()}>
              {s.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {s.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="max-h-[260px] overflow-y-auto">
            {items.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-3">{s.empty}</p>}
            {items.map((item, i) => (
              <div
                key={`${item.custom ? 'c' : 'b'}:${item.name}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                // Tıklama mesaj kutusundan odağı almasın diye mousedown'da işlenir.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(item.text)
                }}
                className={cn('group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5', i === active && 'bg-surface-2')}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">/{item.name}</p>
                  <p className="truncate text-xs text-ink-3">{item.text}</p>
                </div>
                {item.custom && (
                  <button
                    type="button"
                    aria-label={s.remove(item.name)}
                    title={s.remove(item.name)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void saveSettings({ slashPrompts: custom.filter((p) => p.name !== item.name) })
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-danger focus-visible:opacity-100"
                  >
                    <X size={13} aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setAdding(true)
            }}
            className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg border-t border-line px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Plus size={14} aria-hidden />
            {s.add}
          </button>
        </>
      )}
    </div>
  )
}
