import { ArrowUp, Check, Copy, CornerDownLeft, MessageSquareText, Replace, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dictFor } from '@shared/i18n'
import { DEFAULT_SETTINGS, PANEL_ACTIONS, type LockState, type PanelAction, type PanelRequest } from '@shared/types'
import { LogoMark } from '@/components/Logo'
import Markdown from '@/components/Markdown'
import { Button, IconButton, Notice } from '@/components/ui'
import { cn, errorText } from '@/lib/format'
import { useApp } from '@/stores/app'

interface Run {
  jobId: string | null
  action: PanelAction
  /** İşlemin uygulandığı metin ya da sorulan soru */
  source: string
  text: string
  busy: boolean
  error: string
  notice: string
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length

/**
 * Atlas paneli: ekranın sağ kenarında açılan küçük pencere.
 * Seçili metin modunda metin üstte durur, altında işlemler ve sonuç görünür;
 * soru modunda tek bir soru kutusu ve cevap vardır.
 */
export default function PanelApp() {
  const [lock, setLock] = useState<LockState | null>(null)
  const [request, setRequest] = useState<PanelRequest | null>(null)
  const [text, setText] = useState('')
  const [custom, setCustom] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const runRef = useRef<Run | null>(null)
  runRef.current = run

  const t = dictFor(lock?.language).panel

  const open = useCallback((next: PanelRequest) => {
    // Yeni açılışta önceki iş durdurulur ve ekran temizlenir.
    const previous = runRef.current
    if (previous?.busy && previous.jobId) void window.api.jobs.stop(previous.jobId)
    setRequest(next)
    setText(next.text)
    setCustom('')
    setRun(null)
    setCopied(false)
    setMessage('')
    void window.api.lock.state().then(setLock)
    requestAnimationFrame(() => document.getElementById(next.mode === 'ask' || !next.text ? 'panel-text' : 'panel-custom')?.focus())
  }, [])

  useEffect(() => {
    void window.api.lock.state().then(setLock)
    void window.api.panel.request().then((r) => {
      if (r.id > 0) open(r)
    })
    const offOpen = window.api.panel.onOpen(open)
    const offLock = window.api.lock.onChanged(setLock)
    const offChunk = window.api.jobs.onChunk(({ jobId, delta }) =>
      setRun((r) => (r && r.jobId === jobId ? { ...r, text: r.text + delta } : r))
    )
    const offDone = window.api.jobs.onDone(({ jobId, text: full, notice }) =>
      setRun((r) => (r && r.jobId === jobId ? { ...r, text: full, busy: false, notice: notice ?? '' } : r))
    )
    const offError = window.api.jobs.onError(({ jobId, error }) =>
      setRun((r) => (r && r.jobId === jobId ? { ...r, busy: false, error } : r))
    )
    return () => {
      offOpen()
      offLock()
      offChunk()
      offDone()
      offError()
    }
  }, [open])

  // Ortak bileşenler (logo, Markdown) dili depodan okur; panelde depo yalnızca bunun için doldurulur.
  const language = lock?.language
  useEffect(() => {
    if (!language) return
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, language } })
    // Ekran okuyucular paneli doğru dilde okusun.
    document.documentElement.lang = language
  }, [language])

  // Tema: kilit durumundaki ayara göre, ana pencereyle aynı.
  const theme = lock?.theme ?? 'system'
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme = theme === 'dark' || (theme === 'system' && media.matches) ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const close = useCallback(() => {
    const current = runRef.current
    if (current?.busy && current.jobId) void window.api.jobs.stop(current.jobId)
    void window.api.panel.hide()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  async function start(action: PanelAction, instruction?: string): Promise<void> {
    const source = text.trim()
    if (!source || run?.busy) return
    setCopied(false)
    setMessage('')
    setRun({ jobId: null, action, source, text: '', busy: true, error: '', notice: '' })
    try {
      const jobId = await window.api.panel.run(action, source, instruction)
      setRun((r) => (r && r.busy && r.jobId === null ? { ...r, jobId } : r))
    } catch (e) {
      setRun((r) => (r ? { ...r, busy: false, error: errorText(e) } : r))
    }
  }

  async function replace(): Promise<void> {
    if (!run?.text) return
    const ok = await window.api.panel.replace(run.text)
    if (!ok) {
      // Panel gizlendi ama yapıştırılamadı: kullanıcı bildirimi görebilsin diye panel geri gelmez, pano doludur.
      setMessage(t.replaceFailed)
    }
  }

  async function copy(): Promise<void> {
    if (!run?.text) return
    await window.api.panel.copy(run.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (!lock || !request) return <div className="h-full bg-bg" />

  const header = (
    <header className="drag flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
      <LogoMark size={20} />
      <span className="font-display text-[15px] font-semibold tracking-tight text-ink">Atlas</span>
      <span className="text-[13px] text-ink-3">{request.mode === 'ask' ? t.askTitle : t.selectionTitle}</span>
      <IconButton label={t.close} onClick={close} className="ml-auto">
        <X size={16} aria-hidden />
      </IconButton>
    </header>
  )

  if (lock.locked) {
    return (
      <div className="flex h-full flex-col border border-line bg-bg">
        {header}
        <div className="flex flex-1 flex-col items-start gap-4 p-5">
          <Notice tone="warn">{t.locked}</Notice>
          <Button variant="primary" onClick={() => void window.api.app.showMain().then(() => window.api.panel.hide())}>
            {t.openAtlas}
          </Button>
        </div>
      </div>
    )
  }

  const ask = request.mode === 'ask'
  const hasText = text.trim().length > 0
  const unchanged = !!run && !run.busy && run.action === 'fix' && run.text.trim() === run.source

  return (
    <div className="flex h-full flex-col border border-line bg-bg">
      {header}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          {!ask && hasText && <p className="mb-1.5 text-right text-xs text-ink-3 tabular-nums">{t.words(wordCount(text))}</p>}
          <textarea
            id="panel-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (ask && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void start('ask')
              }
            }}
            rows={ask ? 3 : Math.min(9, Math.max(3, Math.ceil(text.length / 48)))}
            placeholder={ask ? t.askPlaceholder : t.selectionPlaceholder}
            aria-label={ask ? t.askTitle : t.selectionTitle}
            className={cn(
              'w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink',
              'placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none'
            )}
          />
          {!ask && !request.text && <p className="mt-1.5 text-[13px] text-ink-3">{t.selectionEmpty}</p>}
          {ask && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="primary" disabled={!hasText || !!run?.busy} onClick={() => void start('ask')}>
                <ArrowUp size={14} aria-hidden />
                {t.ask}
              </Button>
            </div>
          )}
        </section>

        {!ask && (
          <section aria-label={t.actionsLabel}>
            <div className="flex flex-wrap gap-1.5">
              {PANEL_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={!hasText || !!run?.busy}
                  onClick={() => void start(action)}
                  className={cn(
                    'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    run?.action === action
                      ? 'border-accent bg-accent-soft text-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
                  )}
                >
                  {t.actions[action]}
                </button>
              ))}
            </div>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (custom.trim()) void start('custom', custom.trim())
              }}
            >
              <input
                id="panel-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t.customPlaceholder}
                aria-label={t.customPlaceholder}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
              <IconButton
                type="submit"
                label={t.customSend}
                disabled={!hasText || !custom.trim() || !!run?.busy}
                className="h-9 w-9 border border-line bg-surface"
              >
                <CornerDownLeft size={15} aria-hidden />
              </IconButton>
            </form>
          </section>
        )}

        {run && (
          <section aria-busy={run.busy}>
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink" role="status">
                {run.busy ? t.writing : t.resultTitle}
              </h2>
              {run.busy && (
                <Button size="sm" variant="ghost" onClick={() => run.jobId && void window.api.jobs.stop(run.jobId)}>
                  <Square size={12} aria-hidden />
                  {t.stop}
                </Button>
              )}
            </div>
            {(run.text || run.busy) && (
              <div className="rounded-xl border border-accent/40 bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink">
                {ask ? (
                  <Markdown text={run.text || '…'} />
                ) : (
                  <p className="break-words whitespace-pre-wrap">{run.text || '…'}</p>
                )}
              </div>
            )}
            {unchanged && <p className="mt-2 text-[13px] text-teal">{t.noChange}</p>}
            {run.notice && <p className="mt-2 text-[13px] text-warn">{run.notice}</p>}
            {run.error && (
              <div className="mt-2">
                <Notice tone="danger">{run.error}</Notice>
              </div>
            )}
            {message && (
              <div className="mt-2">
                <Notice tone="warn">{message}</Notice>
              </div>
            )}
          </section>
        )}
      </div>

      {run && !run.busy && run.text && (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
          {!ask && request.canReplace && (
            <Button size="sm" variant="primary" title={t.replaceHint} onClick={() => void replace()}>
              <Replace size={14} aria-hidden />
              {t.replace}
            </Button>
          )}
          <Button size="sm" variant={!ask && request.canReplace ? 'secondary' : 'primary'} onClick={() => void copy()}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? t.copied : t.copy}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              void window.api.panel.toChat(ask ? run.source : `${t.actions[run.action as keyof typeof t.actions] ?? custom}\n\n${run.source}`, run.text)
            }
          >
            <MessageSquareText size={14} aria-hidden />
            {t.toChat}
          </Button>
        </footer>
      )}
    </div>
  )
}
