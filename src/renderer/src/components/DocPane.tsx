import { Check, Copy, CornerDownLeft, Download, FileText, MessageSquareQuote, RotateCcw, Square, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DOCUMENT_FORMATS,
  PANEL_ACTIONS,
  type Attachment,
  type AttachmentDocument,
  type DocumentFormat,
  type DocumentOriginal,
  type PanelAction
} from '@shared/types'
import { chunkText, wordDiff } from '@shared/text'
import { Select } from '@/components/AppParts'
import DocView from '@/components/DocView'
import { Button, IconButton, Notice } from '@/components/ui'
import { cn, errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const EMPTY: Attachment[] = []
/** Belge panelinde seçime uygulanabilen hazır işlemler (özetle ve açıkla metnin yerine yazılmaz, o yüzden yok). */
const EDIT_ACTIONS = PANEL_ACTIONS.filter((a) => a !== 'summarize' && a !== 'explain')
const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length

interface Proposal {
  jobId: string | null
  /** Önerinin ait olduğu seçim */
  start: number
  end: number
  source: string
  text: string
  busy: boolean
  error: string
  /** Öneri özgün görünümdeki bir seçim için istendi; yeri metinde sonradan aranır */
  fromView: boolean
  /** Belgenin tamamı parça parça işleniyorsa ilerleme */
  progress?: { done: number; total: number }
}

/** Belgenin tamamı işlenirken modele tek seferde verilen en uzun parça (karakter) */
const WHOLE_CHUNK = 2500

type Mode = 'view' | 'text'

/** Görünümde seçilen bölümü metinde arar: boşluk ve satır sonu farkları yok sayılır. Tek eşleşme varsa yerini verir. */
function locate(text: string, selected: string): { start: number; end: number } | null {
  const words = selected.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g')
  const first = pattern.exec(text)
  if (!first || pattern.exec(text)) return null
  return { start: first.index, end: first.index + first[0].length }
}

/**
 * Belge paneli: sohbete eklenen bir dosyanın metnini sohbetin sağında gösterir.
 * Metin burada düzenlenebilir; bir bölüm seçilince Atlas yalnızca o kısmı düzeltir, kısaltır ya da çevirir.
 * Düzenlenen hali saklanır ve Atlas sonraki sorularda onu görür; özgün dosya değişmez.
 */
export default function DocPane({ attachmentId }: { attachmentId: string }) {
  const t = useT()
  const d = t.chat.doc
  const messages = useApp((s) => (s.activeId ? s.messages[s.activeId] : undefined))
  const openDoc = useApp((s) => s.openDoc)

  const [doc, setDoc] = useState<AttachmentDocument | null>(null)
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('text')
  const [original, setOriginal] = useState<DocumentOriginal | null>(null)
  const [viewSelected, setViewSelected] = useState('')
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [custom, setCustom] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [undo, setUndo] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ id: attachmentId, text: '', dirty: false })
  const proposalRef = useRef<Proposal | null>(null)
  proposalRef.current = proposal
  const [showDiff, setShowDiff] = useState(true)
  /** Belgenin tamamı işlenirken çalışan iş; durdurma ve panel kapanınca iptal için */
  const whole = useRef<{ cancelled: boolean; jobId: string | null } | null>(null)

  /** Bu sohbetteki bütün belgeler; açık olan listede yoksa (henüz gönderilmemiş ek) başa eklenir. */
  const documents = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of messages ?? []) for (const a of m.attachments ?? EMPTY) if (a.kind === 'text') seen.set(a.id, a.name)
    if (doc && !seen.has(doc.id)) seen.set(doc.id, doc.name)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [messages, doc])

  const flush = (): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const { id, text: value, dirty } = latest.current
    if (!dirty) return
    latest.current.dirty = false
    void window.api.documents.save(id, value)
  }

  // Belge değişince önceki belgenin kaydedilmemiş hali yazılır, yenisi yüklenir.
  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setMissing(false)
    setProposal(null)
    setUndo(null)
    setSelection({ start: 0, end: 0 })
    setOriginal(null)
    setViewSelected('')
    setMode('text')
    void window.api.documents.get(attachmentId).then(
      (loaded) => {
        if (cancelled) return
        if (!loaded) {
          setMissing(true)
          return
        }
        setDoc(loaded)
        setText(loaded.text)
        latest.current = { id: loaded.id, text: loaded.text, dirty: false }
        // PDF, Word ve Excel önce kendi görünümüyle açılır.
        if (loaded.view && loaded.hasOriginal) {
          setMode('view')
          void window.api.documents.original(loaded.id).then(
            (file) => {
              if (cancelled) return
              if (file) setOriginal(file)
              else setMode('text')
            },
            () => !cancelled && setMode('text')
          )
        }
      },
      () => !cancelled && setMissing(true)
    )
    return () => {
      cancelled = true
      flush()
      const p = proposalRef.current
      if (p?.busy && p.jobId) void window.api.jobs.stop(p.jobId)
      stopWhole()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId])

  useEffect(() => {
    const offChunk = window.api.jobs.onChunk(({ jobId, delta }) =>
      setProposal((p) => (p && p.jobId === jobId ? { ...p, text: p.text + delta } : p))
    )
    const offDone = window.api.jobs.onDone(({ jobId, text: full }) =>
      setProposal((p) => (p && p.jobId === jobId ? { ...p, text: full, busy: false } : p))
    )
    const offError = window.api.jobs.onError(({ jobId, error }) =>
      setProposal((p) => (p && p.jobId === jobId ? { ...p, busy: false, error } : p))
    )
    return () => {
      offChunk()
      offDone()
      offError()
    }
  }, [])

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [status])

  /** Metni değiştirir ve kısa bir beklemeden sonra saklar. */
  function update(next: string): void {
    setText(next)
    latest.current = { id: attachmentId, text: next, dirty: true }
    setDoc((current) => (current ? { ...current, edited: true } : current))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 600)
  }

  const readSelection = (e: { currentTarget: HTMLTextAreaElement }): void => {
    const { selectionStart: start, selectionEnd: end } = e.currentTarget
    setSelection((current) => (current.start === start && current.end === end ? current : { start, end }))
  }

  // Öneri hazır olunca eski ve yeni metin arasındaki fark; çok uzun metinlerde hesaplanmaz.
  const diff = useMemo(
    () => (proposal && !proposal.busy && proposal.text ? wordDiff(proposal.source.trim(), proposal.text.trim()) : null),
    [proposal]
  )
  const changes = diff ? diff.filter((part) => part.type !== 'same').length : 0

  const inView = mode === 'view'
  const selected = inView ? viewSelected : text.slice(selection.start, selection.end)
  const hasSelection = selected.trim().length > 0

  async function run(action: PanelAction, instruction?: string): Promise<void> {
    if (!hasSelection || proposal?.busy) return
    const { start, end } = selection
    setProposal({ jobId: null, start, end, source: selected, text: '', busy: true, error: '', fromView: inView })
    try {
      const jobId = await window.api.panel.run(action, selected, instruction)
      setProposal((p) => (p && p.busy && p.jobId === null ? { ...p, jobId } : p))
    } catch (e) {
      setProposal((p) => (p ? { ...p, busy: false, error: errorText(e) } : p))
    }
  }

  function stopWhole(): void {
    const w = whole.current
    if (!w) return
    w.cancelled = true
    if (w.jobId) void window.api.jobs.stop(w.jobId)
  }

  /** Tek bir parçayı modele verir ve cevabın tamamını bekler. */
  function runPart(action: PanelAction, part: string, instruction: string | undefined, state: { cancelled: boolean; jobId: string | null }): Promise<string> {
    return new Promise((resolve, reject) => {
      const off: (() => void)[] = []
      const finish = (): void => off.forEach((f) => f())
      off.push(
        window.api.jobs.onDone(({ jobId, text: full }) => {
          if (jobId !== state.jobId) return
          finish()
          resolve(full)
        }),
        window.api.jobs.onError(({ jobId, error }) => {
          if (jobId !== state.jobId) return
          finish()
          reject(new Error(error))
        })
      )
      window.api.panel.run(action, part, instruction).then(
        (jobId) => {
          state.jobId = jobId
          if (state.cancelled) void window.api.jobs.stop(jobId)
        },
        (e) => {
          finish()
          reject(e)
        }
      )
    })
  }

  /** Belgenin tamamını parça parça işler; sonuç tek bir öneri olarak onaya sunulur. */
  async function runWhole(action: PanelAction, instruction?: string): Promise<void> {
    if (proposal?.busy || !text.trim()) return
    flush()
    const source = text
    const chunks = chunkText(source, WHOLE_CHUNK)
    const total = chunks.filter((c) => c.body.trim()).length
    const state = { cancelled: false, jobId: null as string | null }
    whole.current = state
    setProposal({ jobId: null, start: 0, end: source.length, source, text: '', busy: true, error: '', fromView: false, progress: { done: 0, total } })
    let out = ''
    let done = 0
    try {
      for (const chunk of chunks) {
        if (state.cancelled) break
        if (!chunk.body.trim()) {
          out += chunk.body + chunk.separator
          continue
        }
        state.jobId = null
        const result = await runPart(action, chunk.body, instruction, state)
        if (state.cancelled) break
        // Parçanın başındaki ve sonundaki boşluklar korunur; model onları genelde atar.
        out += /^\s*/.exec(chunk.body)![0] + result.trim() + /\s*$/.exec(chunk.body)![0] + chunk.separator
        done++
        const snapshot = out
        setProposal((p) => (p && p.progress ? { ...p, text: snapshot, progress: { done, total } } : p))
      }
      if (state.cancelled) setProposal(null)
      else setProposal((p) => (p && p.progress ? { ...p, text: out, busy: false } : p))
    } catch (e) {
      setProposal((p) => (p && p.progress ? { ...p, busy: false, error: errorText(e) } : p))
    } finally {
      if (whole.current === state) whole.current = null
    }
  }

  function apply(): void {
    if (!proposal || proposal.busy || !proposal.text) return
    if (proposal.fromView) {
      // Görünümde seçilen bölümün metindeki yeri bulunur; bulunamazsa yanlış yere yazılmaz.
      const place = locate(text, proposal.source)
      if (!place) {
        setProposal({ ...proposal, error: d.notInText })
        return
      }
      const replacement = proposal.text.trim()
      setUndo(text)
      update(text.slice(0, place.start) + replacement + text.slice(place.end))
      setProposal(null)
      setViewSelected('')
      setMode('text')
      const caret = place.start + replacement.length
      requestAnimationFrame(() => {
        area.current?.focus()
        area.current?.setSelectionRange(place.start, caret)
        setSelection({ start: place.start, end: caret })
      })
      return
    }
    // Öneri beklenirken metin değiştiyse yanlış yere yazmamak için uygulanmaz.
    if (text.slice(proposal.start, proposal.end) !== proposal.source) {
      setProposal({ ...proposal, error: d.changed })
      return
    }
    if (proposal.progress) {
      setUndo(text)
      update(proposal.text)
      setProposal(null)
      setMode('text')
      return
    }
    // Seçimin başındaki ve sonundaki boşluklar korunur; model onları genelde atar.
    const lead = /^\s*/.exec(proposal.source)![0]
    const tail = /\s*$/.exec(proposal.source)![0]
    const replacement = lead + proposal.text.trim() + tail
    setUndo(text)
    update(text.slice(0, proposal.start) + replacement + text.slice(proposal.end))
    setProposal(null)
    const caret = proposal.start + replacement.length
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(proposal.start, caret)
      setSelection({ start: proposal.start, end: caret })
    })
  }

  async function save(format: DocumentFormat): Promise<void> {
    setMenuOpen(false)
    flush()
    try {
      const path = await window.api.documents.export(attachmentId, format)
      if (path) setStatus({ tone: 'ok', text: d.saved })
    } catch (e) {
      setStatus({ tone: 'error', text: errorText(e) })
    }
  }

  async function reset(): Promise<void> {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    latest.current.dirty = false
    const original = await window.api.documents.reset(attachmentId)
    if (!original) return
    setUndo(text)
    setDoc(original)
    setText(original.text)
    latest.current = { id: original.id, text: original.text, dirty: false }
    setProposal(null)
  }

  const close = (): void => {
    flush()
    openDoc(null)
  }

  return (
    <aside aria-label={d.paneLabel} className="flex w-[44%] max-w-[820px] min-w-[300px] flex-col border-l border-line bg-bg">
      {/* Pencere düğmeleri bu köşede durur; başlık onların altına girmesin diye sağda boşluk bırakılır. */}
      <header className="drag flex h-10 shrink-0 items-center gap-2 pr-[150px] pl-4">
        <FileText size={15} className="shrink-0 text-accent" aria-hidden />
        {documents.length > 1 ? (
          <Select
            value={attachmentId}
            onChange={(e) => openDoc(e.target.value)}
            aria-label={d.choose}
            title={d.choose}
            className="h-8 max-w-[260px] min-w-0 border-0 bg-transparent px-1 text-[13px] font-medium"
          >
            {documents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="min-w-0 truncate text-[13px] font-medium text-ink" title={doc?.name}>
            {doc?.name ?? ''}
          </span>
        )}
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-y border-line bg-surface px-3 py-2">
        {original && (
          <div role="tablist" aria-label={d.modes} className="flex rounded-lg bg-surface-2 p-0.5">
            {(['view', 'text'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => {
                  setMode(item)
                  setProposal(null)
                }}
                className={cn(
                  'h-7 rounded-md px-3 text-[13px] font-medium transition-colors',
                  mode === item ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                )}
              >
                {item === 'view' ? d.modeView : d.modeText}
              </button>
            ))}
          </div>
        )}
        {doc?.edited && (
          <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-medium text-teal" title={d.editedHint}>
            {d.edited}
          </span>
        )}
        {status && (
          <span className={cn('text-[13px]', status.tone === 'ok' ? 'text-teal' : 'text-danger')} role="status">
            {status.text}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {undo !== null && (
            <IconButton
              label={d.undo}
              onClick={() => {
                update(undo)
                setUndo(null)
              }}
            >
              <Undo2 size={15} aria-hidden />
            </IconButton>
          )}
          {doc?.edited && (
            <IconButton label={d.reset} onClick={() => void reset()}>
              <RotateCcw size={15} aria-hidden />
            </IconButton>
          )}
          <div className="relative">
            <IconButton label={d.save} aria-haspopup="menu" aria-expanded={menuOpen} disabled={!doc} onClick={() => setMenuOpen((o) => !o)}>
              <Download size={15} aria-hidden />
            </IconButton>
            {menuOpen && (
              <div
                role="menu"
                className="absolute top-9 right-0 z-20 w-[210px] rounded-xl border border-line bg-surface p-1.5 shadow-pop"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {DOCUMENT_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    role="menuitem"
                    onClick={() => void save(format)}
                    className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    {d.formats[format]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton label={d.close} onClick={close}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
      </div>

      {missing ? (
        <div className="p-4">
          <Notice tone="warn">{d.notFound}</Notice>
        </div>
      ) : (
        <>
          {inView && original && <DocView original={original} onSelect={setViewSelected} />}
          {!inView && doc?.view && !doc.hasOriginal && (
            <div className="shrink-0 px-3 pt-3">
              <Notice tone="info">{d.reattach}</Notice>
            </div>
          )}
          <textarea
            ref={area}
            hidden={inView}
            value={text}
            spellCheck={false}
            aria-label={d.textLabel}
            onChange={(e) => {
              update(e.target.value)
              setUndo(null)
              // Yazarken seçim de değişir; eski seçim ekranda kalmasın.
              readSelection(e)
            }}
            onSelect={readSelection}
            onKeyUp={readSelection}
            onMouseUp={readSelection}
            className="min-h-0 flex-1 resize-none bg-bg px-5 py-4 text-sm leading-relaxed text-ink selection:bg-accent/30 focus:outline-none"
          />

          <div className="shrink-0 border-t border-line bg-surface px-3 py-3">
            {proposal ? (
              <div aria-live="polite">
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-ink">
                    {proposal.busy ? (proposal.progress ? d.progress(proposal.progress.done, proposal.progress.total) : t.panel.writing) : d.proposal}
                  </h3>
                  {proposal.busy ? (
                    <Button size="sm" variant="ghost" onClick={() => (proposal.progress ? stopWhole() : proposal.jobId && void window.api.jobs.stop(proposal.jobId))}>
                      <Square size={12} aria-hidden />
                      {t.panel.stop}
                    </Button>
                  ) : (
                    diff && (
                      <Button size="sm" variant="ghost" aria-pressed={showDiff} onClick={() => setShowDiff((v) => !v)}>
                        {showDiff ? d.showNew : d.showDiff}
                      </Button>
                    )
                  )}
                </div>
                {proposal.busy && proposal.progress && (
                  <div className="mb-2 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${(proposal.progress.done / Math.max(1, proposal.progress.total)) * 100}%` }} />
                  </div>
                )}
                <p
                  className={cn(
                    'overflow-y-auto rounded-lg border border-accent/40 bg-bg px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink',
                    proposal.progress ? 'max-h-[320px]' : 'max-h-[180px]'
                  )}
                >
                  {!proposal.busy && diff && showDiff
                    ? diff.map((part, i) =>
                        part.type === 'same' ? (
                          <span key={i}>{part.text}</span>
                        ) : part.type === 'del' ? (
                          <del key={i} className="rounded-sm bg-danger-soft text-danger decoration-danger/60">
                            {part.text}
                          </del>
                        ) : (
                          <ins key={i} className="rounded-sm bg-teal-soft text-teal no-underline">
                            {part.text}
                          </ins>
                        )
                      )
                    : proposal.text || '…'}
                </p>
                {!proposal.busy && diff && changes === 0 && <p className="mt-1.5 text-xs text-ink-3">{d.noChange}</p>}
                {!proposal.busy && diff && changes > 0 && <p className="mt-1.5 text-xs text-ink-3 tabular-nums">{d.changeCount(changes)}</p>}
                {proposal.error && (
                  <div className="mt-2">
                    <Notice tone="danger">{proposal.error}</Notice>
                  </div>
                )}
                {!proposal.busy && (
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="primary" disabled={!proposal.text} onClick={apply}>
                      <Check size={14} aria-hidden />
                      {proposal.progress ? d.applyAll : proposal.fromView ? d.applyToText : d.apply}
                    </Button>
                    {proposal.fromView && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!proposal.text}
                        onClick={() => {
                          void navigator.clipboard.writeText(proposal.text.trim())
                          setStatus({ tone: 'ok', text: d.copied })
                        }}
                      >
                        <Copy size={14} aria-hidden />
                        {d.copy}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                      {d.discard}
                    </Button>
                  </div>
                )}
              </div>
            ) : hasSelection ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-3 tabular-nums">{d.selected(wordCount(selected))}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => useApp.setState({ quote: `${d.quoteIntro}\n\n"${selected.trim()}"\n\n` })}
                  >
                    <MessageSquareQuote size={14} aria-hidden />
                    {d.quote}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EDIT_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void run(action)}
                      className="h-8 rounded-full border border-line bg-bg px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                    >
                      {t.panel.actions[action]}
                    </button>
                  ))}
                </div>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (custom.trim()) void run('custom', custom.trim())
                  }}
                >
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder={t.panel.customPlaceholder}
                    aria-label={t.panel.customPlaceholder}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                  <IconButton type="submit" label={t.panel.customSend} disabled={!custom.trim()} className="h-9 w-9 border border-line bg-bg">
                    <CornerDownLeft size={15} aria-hidden />
                  </IconButton>
                </form>
              </div>
            ) : (
              <div>
                <p className="text-[13px] leading-relaxed text-ink-3">
                  {inView ? `${d.selectHintView} ${doc?.edited ? d.viewEdited : d.viewNote}` : `${d.selectHint} ${original ? '' : d.textNote}`}
                </p>
                {text.trim() && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-medium text-ink-2">{d.whole}</span>
                    {EDIT_ACTIONS.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void runWhole(action)}
                        className="h-7 rounded-full border border-line bg-bg px-3 text-xs font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                      >
                        {t.panel.actions[action]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
