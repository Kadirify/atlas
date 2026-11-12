import { useEffect, useRef, useState } from 'react'
import type { DocumentOriginal, SheetView } from '@shared/types'
import { cn } from '@/lib/format'
import { useT } from '@/lib/useT'

/** Çok uzun PDF'lerde yalnızca baştaki sayfalar çizilir; panel bir okuma ve seçme alanıdır, PDF okuyucu değil. */
const MAX_PDF_PAGES = 60

interface Props {
  original: DocumentOriginal
  /** Görünümde seçilen metin; seçim kalkınca boş metin gelir */
  onSelect(text: string): void
}

/**
 * Belgenin özgün görünümü: PDF sayfaları, Word belgesinin düzeni ya da Excel tablosu.
 * Metin seçilebilir; seçim belge paneline bildirilir. Dosyanın kendisi burada değiştirilmez.
 */
export default function DocView({ original, onSelect }: Props) {
  const report = (root: HTMLElement | null): void => {
    const selection = window.getSelection()
    const inside = !!root && !!selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).commonAncestorContainer)
    onSelect(inside ? selection.toString() : '')
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-auto bg-surface-2"
      onMouseUp={(e) => report(e.currentTarget)}
      onKeyUp={(e) => report(e.currentTarget)}
    >
      {original.kind === 'pdf' && <PdfView bytes={original.bytes} />}
      {original.kind === 'docx' && <DocxView bytes={original.bytes} />}
      {original.kind === 'xlsx' && <SheetsView sheets={original.sheets} />}
    </div>
  )
}

/** Kabın genişliğini izler; yeniden boyutlanırken her pikselde yeniden çizmemek için kısa bir bekleme uygular. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setWidth(Math.floor(el.clientWidth)), 120)
    })
    observer.observe(el)
    setWidth(Math.floor(el.clientWidth))
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [])
  return [ref, width]
}

function PdfView({ bytes }: { bytes: Uint8Array }) {
  const t = useT()
  const [ref, width] = useWidth()
  const [state, setState] = useState<{ error: boolean; pages: number; shown: number }>({ error: false, pages: 0, shown: 0 })

  useEffect(() => {
    const host = ref.current
    if (!host || width < 120) return
    let cancelled = false
    const tasks: { cancel(): void }[] = []
    let destroy: (() => void) | null = null

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        // pdf.js verdiği diziyi işçiye devreder; özgün veri bozulmasın diye kopyası verilir.
        const loading = pdfjs.getDocument({ data: bytes.slice() })
        destroy = () => void loading.destroy()
        const pdf = await loading.promise
        if (cancelled) return
        host.replaceChildren()
        const shown = Math.min(pdf.numPages, MAX_PDF_PAGES)
        setState({ error: false, pages: pdf.numPages, shown })
        const ratio = window.devicePixelRatio || 1
        const pageWidth = width - 24

        for (let n = 1; n <= shown; n++) {
          const page = await pdf.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = pageWidth / base.width
          const viewport = page.getViewport({ scale })

          const sheet = document.createElement('div')
          sheet.className = 'pdf-page'
          sheet.style.width = `${Math.floor(viewport.width)}px`
          sheet.style.height = `${Math.floor(viewport.height)}px`
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width * ratio)
          canvas.height = Math.floor(viewport.height * ratio)
          const layer = document.createElement('div')
          layer.className = 'textLayer'
          layer.style.setProperty('--total-scale-factor', String(scale))
          sheet.append(canvas, layer)
          host.append(sheet)

          const render = page.render({
            canvas,
            canvasContext: canvas.getContext('2d')!,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined
          })
          tasks.push(render)
          await render.promise
          if (cancelled) return
          const text = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport })
          tasks.push(text)
          await text.render()
        }
      } catch (e) {
        if (!cancelled && (e as { name?: string })?.name !== 'RenderingCancelledException') setState((s) => ({ ...s, error: true }))
      }
    })()

    return () => {
      cancelled = true
      for (const task of tasks) task.cancel()
      destroy?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, width])

  return (
    <>
      {state.error && <p className="p-4 text-[13px] text-danger">{t.chat.doc.viewFailed}</p>}
      <div ref={ref} className="flex flex-col items-center gap-3 px-3 py-3" />
      {state.pages > state.shown && <p className="px-4 pb-4 text-center text-xs text-ink-3">{t.chat.doc.morePages(state.shown, state.pages)}</p>}
    </>
  )
}

function DocxView({ bytes }: { bytes: Uint8Array }) {
  const t = useT()
  const [ref, width] = useWidth()
  const body = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(0)

  useEffect(() => {
    const host = body.current
    if (!host) return
    let cancelled = false
    void (async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        const holder = document.createElement('div')
        await renderAsync(new Blob([bytes.slice()]), holder, undefined, { className: 'docx', inWrapper: true, breakPages: true, experimental: true })
        if (cancelled) return
        host.replaceChildren(...holder.childNodes)
        setReady((n) => n + 1)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bytes])

  // Sayfalar gerçek genişliğinde çizilir; panele sığması için küçültülür.
  useEffect(() => {
    const host = body.current
    if (!host || !ready || width < 120) return
    host.style.zoom = '1'
    const natural = host.scrollWidth
    // Dikey kaydırma çubuğuna yer kalsın diye birkaç piksel pay bırakılır.
    host.style.zoom = natural > width - 16 ? String((width - 16) / natural) : '1'
  }, [ready, width])

  return (
    <div ref={ref}>
      {failed && <p className="p-4 text-[13px] text-danger">{t.chat.doc.viewFailed}</p>}
      <div ref={body} className="docx-host" />
    </div>
  )
}

function SheetsView({ sheets }: { sheets: SheetView[] }) {
  const t = useT()
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  if (!sheet) return <p className="p-4 text-[13px] text-ink-3">{t.chat.doc.emptySheet}</p>
  return (
    <div className="flex min-h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label={t.chat.doc.sheets} className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                'h-7 shrink-0 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                i === active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet.rows.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3">{t.chat.doc.emptySheet}</p>
      ) : (
        <table className="sheet-table">
          <colgroup>
            <col style={{ width: 40 }} />
            {sheet.widths.map((w, i) => (
              <col key={i} style={{ width: Math.round(Math.min(Math.max(w || 12, 6), 60) * 7.5) }} />
            ))}
          </colgroup>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th scope="row">{r + 1}</th>
                {row.map((cell, c) => (
                  <td key={c} style={{ textAlign: cell.align, fontWeight: cell.bold ? 600 : undefined }}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
