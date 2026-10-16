import { Cpu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LoadedModel } from '@shared/types'
import { Button } from '@/components/ui'
import { cn, decimal } from '@/lib/format'
import { useT } from '@/lib/useT'

const POLL_MS = 15000

/**
 * Bellek göstergesi: o an bellekte duran modelleri ve kapladıkları yeri gösterir, bellekten boşaltmayı sağlar.
 * Düğmedeki nokta bellekte model olduğunu belirtir.
 */
export default function MemoryMenu() {
  const t = useT()
  const m = t.chat.memory
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<LoadedModel[]>([])
  const [busy, setBusy] = useState(false)
  /** Ollama'ya bağlanılabiliyor mu; null: henüz bilinmiyor */
  const [running, setRunning] = useState<boolean | null>(null)
  const [starting, setStarting] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const refresh = (): void => {
    void window.api.ollama.status().then(
      (s) => {
        setRunning(s.running)
        if (s.running) void window.api.models.loaded().then(setModels, () => setModels([]))
        else setModels([])
      },
      () => setRunning(false)
    )
  }

  async function startOllama(): Promise<void> {
    setStarting(true)
    try {
      setRunning((await window.api.ollama.start()).running)
    } finally {
      setStarting(false)
      refresh()
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    refresh()
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function unload(name?: string): Promise<void> {
    setBusy(true)
    try {
      await window.api.models.unload(name)
      // Ollama modeli bırakana kadar kısa bir süre geçer.
      await new Promise((resolve) => setTimeout(resolve, 600))
      setModels(await window.api.models.loaded())
    } finally {
      setBusy(false)
    }
  }

  const total = models.reduce((sum, model) => sum + model.sizeGb, 0)

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={m.button}
        title={running === false ? m.ollamaDown : models.length > 0 ? `${m.button}: ${m.size(decimal(total, 1))}` : m.button}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink',
          open && 'bg-surface-2 text-ink'
        )}
      >
        <Cpu size={15} aria-hidden />
        {running === false ? (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
        ) : (
          models.length > 0 && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-teal" aria-hidden />
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={m.title} className="absolute top-9 left-0 z-30 w-[300px] rounded-xl border border-line bg-surface p-3 shadow-pop">
          <h3 className="text-[13px] font-semibold text-ink">{m.title}</h3>
          {running === false ? (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{m.ollamaDown}</p>
              <Button size="sm" variant="secondary" className="mt-2 w-full" disabled={starting} onClick={() => void startOllama()}>
                {starting ? m.ollamaStarting : m.ollamaStart}
              </Button>
            </>
          ) : models.length === 0 ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{m.empty}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {models.map((model) => (
                  <li key={model.name} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{model.label}</p>
                      <p className="text-xs text-ink-3 tabular-nums">
                        {m.size(decimal(model.sizeGb, 1))}, {m.onGpu(model.gpuPercent)}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unload(model.name)}>
                      {m.unload}
                    </Button>
                  </li>
                ))}
              </ul>
              {models.length > 1 && (
                <Button size="sm" variant="secondary" className="mt-2 w-full" disabled={busy} onClick={() => void unload()}>
                  {m.unloadAll}
                </Button>
              )}
              <p className="mt-2.5 text-xs leading-relaxed text-ink-3">{m.hint}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
