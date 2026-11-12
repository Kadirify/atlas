import {
  ArrowLeft,
  Check,
  Copy,
  CopyPlus,
  Download,
  EllipsisVertical,
  MessagesSquare,
  Pencil,
  RefreshCw,
  Square,
  Star,
  Trash2
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppRun, MiniApp, RunRequest } from '@shared/types'
import { AppForm, AppIconTile, initialValues, ModelPicker, PageHeader } from '@/components/AppParts'
import { AttachButton, AttachmentList } from '@/components/Attachments'
import Markdown, { useCopy } from '@/components/Markdown'
import { Button, IconButton, Input, Notice } from '@/components/ui'
import { filesFrom, useAttachments, useJob } from '@/lib/files'
import { cn, errorText } from '@/lib/format'
import { currentLocale, T } from '@/lib/i18n'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

function runLabel(app: MiniApp, run: AppRun): string {
  const first = app.fields.map((f) => (f.type === 'toggle' ? '' : (run.values[f.key] ?? '').trim())).find(Boolean)
  return first ? first.replace(/\s+/g, ' ').slice(0, 60) : T().apps.run.fromFile
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function AppMenu({ app }: { app: MiniApp }) {
  const t = useT()
  const go = useApp((s) => s.go)
  const loadApps = useApp((s) => s.loadApps)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const item = 'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] hover:bg-surface-2'
  const { name, description, icon, category, prompt, fields } = app

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={t.apps.run.menu.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          setConfirmDelete(false)
          setStatus('')
        }}
      >
        <EllipsisVertical size={17} aria-hidden />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-10 right-0 z-20 w-60 rounded-xl border border-line bg-surface p-1 text-ink shadow-pop">
          {confirmDelete ? (
            <>
              <p className="px-2.5 py-1.5 text-[13px] text-ink-2">{t.apps.run.menu.confirmDelete}</p>
              <button
                role="menuitem"
                className={cn(item, 'text-danger')}
                onClick={() => void window.api.apps.remove(app.id).then(loadApps).then(() => go({ name: 'apps' }))}
              >
                <Trash2 size={14} aria-hidden />
                {t.common.actions.yesDelete}
              </button>
              <button role="menuitem" className={item} onClick={() => setConfirmDelete(false)}>
                {t.common.actions.cancel}
              </button>
            </>
          ) : (
            <>
              {app.builtin ? (
                <button
                  role="menuitem"
                  className={item}
                  onClick={() =>
                    go({
                      name: 'studio',
                      draft: { name: t.apps.run.menu.copyName(name), description, icon, category, prompt, fields }
                    })
                  }
                >
                  <CopyPlus size={14} aria-hidden />
                  {t.apps.run.menu.duplicate}
                </button>
              ) : (
                <button role="menuitem" className={item} onClick={() => go({ name: 'studio', editId: app.id })}>
                  <Pencil size={14} aria-hidden />
                  {t.apps.run.menu.edit}
                </button>
              )}
              <button
                role="menuitem"
                className={item}
                onClick={() =>
                  void window.api.apps.exportFile(app.id).then(
                    (saved) => (saved ? setStatus(t.apps.run.menu.exported) : setOpen(false)),
                    (e) => setStatus(errorText(e))
                  )
                }
              >
                <Download size={14} aria-hidden />
                {t.apps.run.menu.exportApp}
              </button>
              {!app.builtin && (
                <button role="menuitem" className={cn(item, 'text-danger')} onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} aria-hidden />
                  {t.common.actions.delete}
                </button>
              )}
              {status && (
                <p className="px-2.5 py-1.5 text-xs text-ink-3" role="status">
                  {status}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AppRunPage({ appId }: { appId: string }) {
  const t = useT()
  const app = useApp((s) => s.apps.find((a) => a.id === appId))
  const go = useApp((s) => s.go)
  const loadApps = useApp((s) => s.loadApps)
  const select = useApp((s) => s.select)
  const refreshConversations = useApp((s) => s.refreshConversations)

  const [values, setValues] = useState<Record<string, string>>({})
  const [runs, setRuns] = useState<AppRun[]>([])
  const [currentRun, setCurrentRun] = useState<AppRun | null>(null)
  const [instruction, setInstruction] = useState('')
  const [actionError, setActionError] = useState('')
  const attachments = useAttachments()
  const [copied, copy] = useCopy()

  const job = useJob((done) => {
    if (!done.run) return
    setCurrentRun(done.run)
    setRuns((list) => [done.run!, ...list])
  })

  useEffect(() => {
    if (!app) return
    setValues(initialValues(app.fields))
    setCurrentRun(null)
    job.setText('')
    void window.api.apps.runs(app.id).then(setRuns, () => setRuns([]))
    // Yalnızca başka bir uygulamaya geçildiğinde sıfırlanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id])

  if (!app) {
    return (
      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        <PageHeader>
          <IconButton label={t.apps.backToApps} onClick={() => go({ name: 'apps' })}>
            <ArrowLeft size={17} aria-hidden />
          </IconButton>
        </PageHeader>
        <p className="p-6 text-sm text-ink-3">{t.apps.run.notFound}</p>
      </main>
    )
  }

  const request = (refine?: RunRequest['refine']): RunRequest => ({
    appId: app.id,
    values,
    attachmentIds: attachments.items.map((a) => a.id),
    refine
  })

  const run = (refine?: RunRequest['refine']): void => {
    setActionError('')
    setCurrentRun(null)
    job.start(() => window.api.apps.run(request(refine)))
  }

  const refine = (text: string): void => {
    if (!job.text.trim() || !text.trim()) return
    setInstruction('')
    run({ previous: job.text, instruction: text.trim() })
  }

  async function continueInChat(): Promise<void> {
    if (!currentRun) return
    try {
      const conversation = await window.api.apps.toConversation(currentRun.id)
      await refreshConversations()
      await select(conversation.id)
    } catch (e) {
      setActionError(errorText(e))
    }
  }

  const hasOutput = job.text.trim() !== ''

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      <PageHeader
        actions={
          <>
            <ModelPicker
              value={app.model ?? ''}
              onChange={(model) => void window.api.apps.setModel(app.id, model || null).then(loadApps)}
            />
            <IconButton
              label={app.favorite ? t.apps.removeFavorite : t.apps.addFavorite}
              aria-pressed={app.favorite}
              onClick={() => void window.api.apps.setFavorite(app.id, !app.favorite).then(loadApps)}
              className={app.favorite ? 'text-warn hover:text-warn' : undefined}
            >
              <Star size={17} fill={app.favorite ? 'currentColor' : 'none'} aria-hidden />
            </IconButton>
            <AppMenu app={app} />
          </>
        }
      >
        <IconButton label={t.apps.backToApps} onClick={() => go({ name: 'apps' })}>
          <ArrowLeft size={17} aria-hidden />
        </IconButton>
        <AppIconTile icon={app.icon} size={32} />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-ink">{app.name}</h1>
          <p className="truncate text-xs text-ink-3">{app.description}</p>
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {/* Form */}
        <section
          aria-label={t.apps.run.formSection}
          className="flex w-[400px] shrink-0 flex-col border-r border-line"
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            attachments.add(filesFrom(e.dataTransfer))
          }}
        >
          <form
            className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (!job.running && attachments.pending === 0) run()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.requestSubmit()
            }}
          >
            <AppForm fields={app.fields} values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} />

            <div className="mt-5">
              <AttachmentList items={attachments.items} pending={attachments.pending} onRemove={attachments.remove} className="mb-2" />
              <AttachButton onFiles={attachments.add} className="-ml-2">
                {t.apps.run.attachFile}
              </AttachButton>
              <p className="mt-1 text-xs text-ink-3">{t.apps.run.attachHint}</p>
              {attachments.error && (
                <div className="mt-2">
                  <Notice tone="danger">{attachments.error}</Notice>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              {job.running ? (
                <Button type="button" onClick={job.stop}>
                  <Square size={13} fill="currentColor" aria-hidden />
                  {t.common.actions.stop}
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={attachments.pending > 0}>
                  {t.apps.run.generate}
                </Button>
              )}
              <span className="text-xs text-ink-3">Ctrl + Enter</span>
            </div>

            {runs.length > 0 && (
              <div className="mt-8 border-t border-line pt-5">
                <h2 className="mb-2 text-[13px] font-semibold text-ink">{t.apps.run.history}</h2>
                <ul className="space-y-0.5">
                  {runs.map((r) => (
                    <li key={r.id} className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentRun(r)
                          setValues({ ...initialValues(app.fields), ...r.values })
                          job.setText(r.output)
                        }}
                        aria-current={currentRun?.id === r.id ? 'true' : undefined}
                        className={cn(
                          'min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left',
                          currentRun?.id === r.id ? 'bg-accent-soft' : 'hover:bg-surface-2'
                        )}
                      >
                        <span className="block truncate text-[13px] text-ink">{runLabel(app, r)}</span>
                        <span className="block text-xs text-ink-3">{formatWhen(r.createdAt)}</span>
                      </button>
                      <IconButton
                        label={t.apps.run.removeRun}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => {
                          void window.api.apps.removeRun(r.id)
                          setRuns((list) => list.filter((x) => x.id !== r.id))
                          if (currentRun?.id === r.id) setCurrentRun(null)
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </section>

        {/* Sonuç */}
        <section aria-label={t.apps.run.resultSection} className="flex min-w-0 flex-1 flex-col bg-bg">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7" aria-busy={job.running}>
            {/* Akan metin ekran okuyucuya parça parça okunmaz; yalnızca durum bildirilir. */}
            <p className="sr-only" role="status">
              {job.running ? t.apps.run.writing : hasOutput ? t.apps.run.ready : ''}
            </p>
            <div className="mx-auto max-w-[720px]">
              {!hasOutput && !job.running && !job.error && (
                <p className="pt-16 text-center text-sm text-ink-3">{t.apps.run.empty}</p>
              )}
              {job.running && !hasOutput && (
                <p className="flex items-center gap-1 text-sm text-ink-3">
                  {t.apps.run.writing}
                  <span className="caret" aria-hidden />
                </p>
              )}
              {hasOutput && (
                <div className="rounded-2xl border border-line bg-surface px-6 py-5">
                  <Markdown text={job.text} />
                  {job.running && <span className="caret" aria-hidden />}
                </div>
              )}
              {job.notice && (
                <div className="mt-3">
                  <Notice tone="warn">{job.notice}</Notice>
                </div>
              )}
              {(job.error || actionError) && (
                <div className="mt-3">
                  <Notice tone="danger">{job.error || actionError}</Notice>
                </div>
              )}
            </div>
          </div>

          {hasOutput && !job.running && (
            <div className="shrink-0 border-t border-line bg-surface px-8 py-3">
              <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => copy(job.text)}>
                  {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {copied ? t.common.actions.copied : t.common.actions.copy}
                </Button>
                <Button size="sm" onClick={() => run()}>
                  <RefreshCw size={14} aria-hidden />
                  {t.apps.run.regenerate}
                </Button>
                {currentRun && (
                  <Button size="sm" onClick={() => void continueInChat()}>
                    <MessagesSquare size={14} aria-hidden />
                    {t.apps.run.continueInChat}
                  </Button>
                )}
                <span className="mx-1 h-5 w-px bg-line" aria-hidden />
                {t.apps.run.quickRefines.map((label) => (
                  <Button key={label} size="sm" variant="ghost" onClick={() => refine(label)}>
                    {label}
                  </Button>
                ))}
              </div>
              <form
                className="mx-auto mt-2 flex max-w-[720px] gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  refine(instruction)
                }}
              >
                <Input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t.apps.run.refinePlaceholder}
                  aria-label={t.apps.run.refineLabel}
                  className="h-9"
                />
                <Button size="sm" type="submit" disabled={!instruction.trim()} className="h-9">
                  {t.common.actions.apply}
                </Button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
