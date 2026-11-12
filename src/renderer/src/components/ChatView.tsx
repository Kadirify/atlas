import { ArrowDown, ArrowUp, Brain, Check, ChevronDown, Copy, Download, EyeOff, Lightbulb, Pencil, Plus, RefreshCw, ShieldCheck, Square, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_PERSONA_ID, EXPORT_FORMATS, UNTITLED_CONVERSATION, type ExportFormat, type Message, type Persona } from '@shared/types'
import { CodeViewer, FilesToggle, FileTree } from '@/components/CodeParts'
import DocPane from '@/components/DocPane'
import FindBar from '@/components/FindBar'
import MemoryMenu from '@/components/MemoryMenu'
import SlashMenu, { type SlashMenuHandle } from '@/components/SlashMenu'
import { SqlApprovals, SqlMenu, SqlPane } from '@/components/SqlParts'
import { useSql } from '@/stores/sql'
import { ApprovalCard, FolderMenu, LiveTerminal, StepList } from '@/components/FolderParts'
import { OpenSourceNote } from '@/components/Logo'
import { Bubbles, PersonaAvatar } from '@/components/PersonaParts'
import Markdown, { useCopy } from '@/components/Markdown'
import { AttachButton, AttachmentList } from '@/components/Attachments'
import { Button, IconButton, Notice } from '@/components/ui'
import { filesFrom, useAttachments, type AttachmentState } from '@/lib/files'
import { cn, errorText, wordsPerSec } from '@/lib/format'
import { asksShowOnSide } from '@/lib/intent'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const EMPTY: Message[] = []
const NO_MEMORIES: import('@shared/types').Memory[] = []
const NO_STEPS: import('@shared/types').ToolStep[] = []
const NO_APPROVALS: import('@shared/types').FileApproval[] = []

function UserMessage({ message, disabled, laterUndo }: { message: Message; disabled: boolean; laterUndo: boolean }) {
  const t = useT()
  const edit = useApp((s) => s.edit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  /** Düzenleme sonraki cevapları siler; onlardaki dosya değişikliklerinin geri alınamayacağı onaylandı mı */
  const [confirmLoss, setConfirmLoss] = useState(false)

  if (editing) {
    const close = (): void => {
      setEditing(false)
      setConfirmLoss(false)
    }
    const submit = (): void => {
      const changed = draft.trim() !== message.content
      if (!changed || !(draft.trim() || message.attachments.length > 0)) return close()
      if (laterUndo && !confirmLoss) return setConfirmLoss(true)
      close()
      void edit(message.id, draft)
    }
    return (
      <div className="rounded-2xl border border-accent bg-surface p-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          rows={Math.min(10, Math.max(2, draft.split('\n').length))}
          aria-label={t.chat.message.edit}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {confirmLoss ? (
            <span className="text-xs font-medium text-danger" role="alert">
              {t.chat.undo.lostWarningLater}
            </span>
          ) : (
            <span className="text-xs text-ink-3">{t.chat.message.editHint}</span>
          )}
          <span className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              {t.common.actions.cancel}
            </Button>
            <Button size="sm" variant="primary" onClick={submit}>
              {confirmLoss ? t.chat.undo.continue : t.chat.composer.send}
            </Button>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-start justify-end gap-1">
      <IconButton
        label={t.chat.message.edit}
        disabled={disabled}
        onClick={() => {
          setDraft(message.content)
          setEditing(true)
        }}
        className="mt-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil size={14} aria-hidden />
      </IconButton>
      <div className="flex max-w-[85%] flex-col items-end gap-2">
        <AttachmentList items={message.attachments} className="justify-end" />
        {message.content && (
          <div className="rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  isLast,
  busy,
  bubbles
}: {
  message: Message
  isLast: boolean
  busy: boolean
  /** Mesajlaşan kişiliklerde cevap balonlara bölünür. */
  bubbles: boolean
}) {
  const t = useT()
  const regenerate = useApp((s) => s.regenerate)
  const [copied, copy] = useCopy()
  /** Yeniden yazdırma bu cevabı siler; dosya değişikliklerinin geri alınamayacağı soruluyor mu */
  const [confirmRegen, setConfirmRegen] = useState(false)
  const speed =
    // Çok kısa cevaplarda hız ölçümü anlamsız çıkar.
    message.tokens && message.tokens >= 20 && message.durationMs && message.durationMs > 0
      ? Math.round(message.tokens / (message.durationMs / 1000))
      : null

  return (
    <div className="group">
      {message.thinking && <ThoughtBox text={message.thinking} done />}
      <StepList steps={message.steps} />
      {bubbles ? <Bubbles text={message.content} /> : <Markdown text={message.content} />}
      <div className="mt-2 -ml-2 flex items-center gap-0.5">
        <IconButton label={copied ? t.common.actions.copied : t.chat.message.copyAnswer} onClick={() => copy(message.content)}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </IconButton>
        {isLast &&
          (confirmRegen ? (
            <span className="ml-1 flex items-center gap-1.5 text-xs text-ink-2" role="alert">
              {t.chat.undo.lostWarning}
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setConfirmRegen(false)
                  void regenerate()
                }}
              >
                {t.chat.undo.continue}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(false)}>
                {t.common.actions.cancel}
              </Button>
            </span>
          ) : (
            <IconButton
              label={t.chat.message.regenerate}
              disabled={busy}
              onClick={() => (message.undoCount > 0 ? setConfirmRegen(true) : void regenerate())}
            >
              <RefreshCw size={14} aria-hidden />
            </IconButton>
          ))}
        {message.undoCount > 0 && <UndoButton messageId={message.id} count={message.undoCount} disabled={busy} />}
        <span className="ml-2 text-xs text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
          {[message.partial && t.chat.message.partial, message.model, speed && `~${wordsPerSec(speed)} ${t.common.units.wordsPerSecond}`]
            .filter(Boolean)
            .join(', ')}
        </span>
      </div>
    </div>
  )
}

/** Bir cevaptaki dosya değişikliklerini geri alan düğme; iki adımlı (önce sorar). */
function UndoButton({ messageId, count, disabled }: { messageId: string; count: number; disabled: boolean }) {
  const t = useT()
  const undo = useApp((s) => s.undo)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  if (result) return <span className="ml-1 text-xs text-teal">{result}</span>
  return confirming ? (
    <span className="ml-1 flex items-center gap-1.5 text-xs text-ink-2">
      {t.chat.undo.confirm(count)}
      <Button size="sm" variant="primary" disabled={disabled} onClick={() => void undo(messageId).then((n) => setResult(t.chat.undo.done(n)), (e) => setResult(errorText(e)))}>
        {t.chat.undo.yes}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        {t.chat.undo.no}
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirming(true)} title={t.chat.undo.hint}>
      <Undo2 size={13} aria-hidden />
      {t.chat.undo.button(count)}
    </Button>
  )
}

/** "Bu sohbette dosya düzenlemelerine izin verildi" şeridi; izin buradan kaldırılır. */
function TrustStrip({ conversationId }: { conversationId: string }) {
  const t = useT()
  const trusted = useApp((s) => s.trusted[conversationId] === true)
  const revoke = useApp((s) => s.revokeTrust)
  if (!trusted) return null
  return (
    <div className="mx-auto mb-1.5 flex w-full max-w-[780px] items-center gap-2 px-6 text-xs text-ink-3">
      <ShieldCheck size={13} className="shrink-0 text-teal" aria-hidden />
      {t.chat.approval.trustedNote}
      <button type="button" onClick={() => void revoke(conversationId)} className="font-medium text-accent hover:underline">
        {t.chat.approval.revoke}
      </button>
    </div>
  )
}

/** Mesaj kutusundaki "Düşün" düğmesi: açıkken model cevap vermeden önce düşünür. */
function ThinkToggle() {
  const t = useT()
  const on = useApp((s) => s.settings?.think === true)
  const saveSettings = useApp((s) => s.saveSettings)
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => void saveSettings({ think: !on })}
      title={on ? t.chat.think.onHint : t.chat.think.offHint}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors',
        on ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
      )}
    >
      <Lightbulb size={16} aria-hidden />
      {t.chat.think.label}
    </button>
  )
}

/** Modelin düşüncesi: yazarken açık görünür, cevap başlayınca tek satıra iner; tıklanınca açılır. */
function ThoughtBox({ text, done }: { text: string; done: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const expanded = open || !done
  return (
    <div className="mb-3 rounded-xl border border-line bg-bg">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-ink-2"
      >
        <Lightbulb size={14} className={cn('shrink-0', done ? 'text-ink-3' : 'text-accent')} aria-hidden />
        {done ? t.chat.think.thought : t.chat.think.thinking}
        {!done && <span className="caret" aria-hidden />}
        <ChevronDown size={14} className={cn('ml-auto shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded && (
        <p className="max-h-[220px] overflow-y-auto border-t border-line px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-3">
          {/* Uzun düşüncede son kısım görünür kalsın diye yalnızca sonu gösterilir. */}
          {text.length > 4000 ? `…${text.slice(-4000)}` : text}
        </p>
      )}
    </div>
  )
}

/** Sohbet başına yazılmış ama gönderilmemiş metin; "" yeni sohbetin taslağıdır. Uygulama açıkken saklanır. */
const drafts = new Map<string, string>()

function Composer({
  busy,
  model,
  attachments,
  onSend,
  onStop
}: {
  busy: boolean
  model: string
  attachments: AttachmentState
  /** Mesaj gönderildiyse (ya da istek yerine getirildiyse) true; değilse metin kutuda kalır. */
  onSend(text: string, attachmentIds: string[]): Promise<boolean>
  onStop(): void
}) {
  const t = useT()
  const activeId = useApp((s) => s.activeId)
  const key = activeId ?? ''
  const [text, setText] = useState(() => drafts.get(key) ?? '')
  const [visionMissing, setVisionMissing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const sending = useRef(false)

  // Başka sohbete geçince yazılan metin o sohbette kalır; açılan sohbetin taslağı geri gelir.
  const keyRef = useRef(key)
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    if (keyRef.current === key) return
    if (textRef.current.trim()) drafts.set(keyRef.current, textRef.current)
    else drafts.delete(keyRef.current)
    keyRef.current = key
    setText(drafts.get(key) ?? '')
  }, [key])
  // "/" ile başlayan tek kelime hazır istem menüsünü açar; Esc ile kapatılan menü metin değişene kadar açılmaz.
  const slash = /^\/(\S*)$/.exec(text)
  const [slashClosedFor, setSlashClosedFor] = useState<string | null>(null)
  const slashOpen = slash !== null && slashClosedFor !== text
  const slashMenu = useRef<SlashMenuHandle | null>(null)
  const bindSlash = useCallback((handle: SlashMenuHandle | null) => {
    slashMenu.current = handle
  }, [])
  const pickSlash = useCallback((value: string) => {
    setText(value)
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(value.length, value.length)
    })
  }, [])
  const { items, pending } = attachments
  const hasImage = items.some((a) => a.kind === 'image')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  useEffect(() => {
    ref.current?.focus()
  }, [activeId])

  // Belge panelinden gelen alıntı mesaj kutusuna eklenir.
  const quote = useApp((s) => s.quote)
  useEffect(() => {
    if (quote === null) return
    setText((current) => (current.trim() ? `${current.trimEnd()}\n\n${quote}` : quote))
    useApp.setState({ quote: null })
    ref.current?.focus()
  }, [quote])

  // Resim eklendiyse seçili modelin resim anlayıp anlamadığına bak.
  useEffect(() => {
    if (!hasImage || !model) {
      setVisionMissing(false)
      return
    }
    let cancelled = false
    void window.api.models.supportsVision(model).then((ok) => !cancelled && setVisionMissing(!ok))
    return () => {
      cancelled = true
    }
  }, [hasImage, model])

  const canSend = !busy && pending === 0 && (text.trim() !== '' || items.length > 0)
  const submit = async (): Promise<void> => {
    if (!canSend || sending.current) return
    sending.current = true
    const value = text
    const sentFrom = key
    try {
      const ok = await onSend(
        value,
        items.map((a) => a.id)
      )
      if (ok) {
        // Yeni sohbette gönderim sırasında sohbet değişmiş olabilir; gönderilen metin taslak olarak kalmasın.
        drafts.delete(sentFrom)
        setText((current) => (current === value ? '' : current))
        attachments.reset()
      } else {
        // Gönderilemeyen metin kaybolmaz; kullanıcı düzeltip yeniden dener.
        drafts.delete(sentFrom)
        setText((current) => current || value)
      }
    } finally {
      sending.current = false
    }
  }

  return (
    <div className="mx-auto w-full max-w-[780px] px-6 pb-5">
      {attachments.error && (
        <div className="mb-2">
          <Notice tone="danger">{attachments.error}</Notice>
        </div>
      )}
      {visionMissing && (
        <div className="mb-2">
          <Notice tone="warn">{t.chat.composer.visionMissing(model)}</Notice>
        </div>
      )}
      <div className="relative rounded-2xl border border-line bg-surface shadow-pop focus-within:border-accent">
        {slashOpen && <SlashMenu query={slash[1]} onPick={pickSlash} onClose={() => setSlashClosedFor(text)} bind={bindSlash} />}
        <AttachmentList items={items} pending={pending} onRemove={attachments.remove} className="px-3 pt-3" />
        <div className="flex items-end gap-1 p-2">
          <AttachButton onFiles={attachments.add} />
          <ThinkToggle />
          <textarea
            ref={ref}
            data-composer
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = filesFrom(e.clipboardData)
              if (files.length === 0) return
              e.preventDefault()
              attachments.add(files)
            }}
            onKeyDown={(e) => {
              if (slashOpen && slashMenu.current?.onKeyDown(e)) return
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder={t.chat.composer.placeholder}
            aria-label={t.chat.composer.label}
            className="max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t.chat.composer.stop}
              title={t.chat.composer.stopTitle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface hover:opacity-85"
            >
              <Square size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label={t.chat.composer.send}
              title={t.chat.composer.sendTitle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <OpenSourceNote className="mt-2 text-center" />
    </div>
  )
}

function ModelSelect() {
  const t = useT()
  const activeId = useApp((s) => s.activeId)
  const conversation = useApp((s) => s.conversations.find((c) => c.id === s.activeId))
  const installed = useApp((s) => s.installed)
  const defaultModel = useApp((s) => s.settings?.defaultModel ?? null)
  const setModel = useApp((s) => s.setModel)
  const saveSettings = useApp((s) => s.saveSettings)

  const current = conversation?.model ?? defaultModel ?? ''
  const names = installed.map((m) => m.name)
  const options = current && !names.includes(current) ? [current, ...names] : names

  if (options.length === 0) return <span className="text-[13px] text-ink-3">{t.chat.model.none}</span>

  return (
    <select
      value={current}
      aria-label={t.chat.model.select}
      title={t.chat.model.select}
      onChange={(e) => {
        // Yeni sohbet ekranında seçim varsayılan modeli değiştirir.
        if (activeId) void setModel(activeId, e.target.value)
        else void saveSettings({ defaultModel: e.target.value })
      }}
      className="h-8 max-w-[220px] min-w-[72px] shrink cursor-pointer rounded-md bg-transparent px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {options.map((name) => (
        <option key={name} value={name} className="bg-surface text-ink">
          {installed.find((m) => m.name === name)?.label ?? name}
        </option>
      ))}
    </select>
  )
}

/** Sohbeti Word, PDF ya da Markdown dosyası olarak kaydeder. */
function ExportMenu({ conversationId }: { conversationId: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Esc yalnızca menüyü kapatır; süren cevabı durdurmasın diye işlendi olarak işaretlenir.
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

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [status])

  async function save(format: ExportFormat): Promise<void> {
    setOpen(false)
    try {
      const path = await window.api.conversations.export(conversationId, format)
      if (path) setStatus({ tone: 'ok', text: t.chat.export.saved })
    } catch (e) {
      setStatus({ tone: 'error', text: errorText(e) })
    }
  }

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-2">
      <IconButton label={t.chat.export.button} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download size={15} aria-hidden />
      </IconButton>
      {status && (
        <span className={cn('text-[13px]', status.tone === 'ok' ? 'text-teal' : 'text-danger')} role="status">
          {status.text}
        </span>
      )}
      {open && (
        <div role="menu" className="absolute top-9 left-0 z-20 w-[210px] rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void save(format)}
              className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {t.chat.export.formats[format]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ChatView() {
  const t = useT()
  const docId = useApp((s) => s.docId)
  const openDoc = useApp((s) => s.openDoc)
  const activeId = useApp((s) => s.activeId)
  const title = useApp((s) => s.conversations.find((c) => c.id === s.activeId)?.title)
  const messages = useApp((s) => (s.activeId ? s.messages[s.activeId] : undefined)) ?? EMPTY
  const streaming = useApp((s) => (s.activeId ? s.streaming[s.activeId] : undefined))
  const thought = useApp((s) => (s.activeId ? s.thoughts[s.activeId] : undefined))
  const error = useApp((s) => (s.activeId ? s.errors[s.activeId] : undefined))
  const userName = useApp((s) => s.settings?.userName ?? '')
  const model = useApp((s) => s.conversations.find((c) => c.id === s.activeId)?.model ?? s.settings?.defaultModel ?? '')
  const conversation = useApp((s) => s.conversations.find((c) => c.id === s.activeId))
  const personas = useApp((s) => s.personas)
  const draft = useApp((s) => s.draft)
  const setDraft = useApp((s) => s.setDraft)
  const learned = useApp((s) => (s.activeId ? s.learned[s.activeId] : undefined)) ?? NO_MEMORIES
  const forget = useApp((s) => s.forget)
  const dismissLearned = useApp((s) => s.dismissLearned)
  const go = useApp((s) => s.go)
  const memoryEnabled = useApp((s) => s.settings?.memoryEnabled ?? true)
  const liveSteps = useApp((s) => (s.activeId ? s.liveSteps[s.activeId] : undefined)) ?? NO_STEPS
  const terminal = useApp((s) => (s.activeId ? s.liveTerminal[s.activeId] : undefined))
  const approvals = useApp((s) => (s.activeId ? s.approvals[s.activeId] : undefined)) ?? NO_APPROVALS
  const folderId = conversation?.folderId ?? (activeId ? null : draft.folderId)
  const [toolsMissing, setToolsMissing] = useState(false)
  const send = useApp((s) => s.send)
  const stop = useApp((s) => s.stop)
  const regenerate = useApp((s) => s.regenerate)

  const busy = streaming !== undefined
  // Başlamış sohbette kişilik sabittir; yeni sohbette seçilen taslak kişilik geçerlidir.
  const persona: Persona | undefined =
    personas.find((p) => p.id === (conversation?.personaId ?? draft.personaId)) ??
    personas.find((p) => p.id === DEFAULT_PERSONA_ID)
  const isPrivate = conversation?.private ?? draft.private
  const bubbles = persona?.multiMessage ?? false
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const [finding, setFinding] = useState(false)
  const sqlPaneOpen = useSql((s) => s.paneOpen)
  // Sohbete proje klasörü bağlıysa dosya ağacı ve dosya görüntüleyici kullanılabilir.
  const codeFolder = useApp((s) => {
    const folderId = s.conversations.find((c) => c.id === s.activeId)?.folderId ?? (s.activeId ? null : s.draft.folderId)
    return s.folders.find((f) => f.id === folderId) ?? null
  })
  const filesOpen = useApp((s) => s.filesOpen)
  const codeFile = useApp((s) => s.codeFile)
  const viewing = codeFolder && codeFile?.folderId === codeFolder.id ? codeFile : null
  // Başlığın genişliği izlenir: dar alanda (yan panel açık, küçük pencere) rozetler yalnızca simgelerine iner.
  const headerRef = useRef<HTMLElement>(null)
  const [headerWidth, setHeaderWidth] = useState(1000)
  /** Çok darken (dosya ağacı ve yan panel birlikte açık) ikincil düğmeler (bellek, dışa aktarma, kişilik) gizlenir. */
  const tight = headerWidth < 400
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeaderWidth(el.clientWidth))
    observer.observe(el)
    setHeaderWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  // Veritabanı paneli yalnızca bu sohbete bağlı bir bağlantı varsa görünür; başlık düzeni de buna göre kurulur.
  const sqlId = conversation?.sqlId ?? (activeId ? null : draft.sqlId)
  const sqlShown = sqlPaneOpen && !!sqlId && !docId && !viewing
  const sidePanel = !!docId || !!viewing || sqlShown

  // Ctrl+F sohbet içinde aramayı açar; sohbet değişince arama kapanır.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFinding(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => setFinding(false), [activeId])
  const [sendError, setSendError] = useState('')
  const attachments = useAttachments()
  const [dragging, setDragging] = useState(false)

  // Ekler o sohbete aittir: başka sohbete geçince kutudan kalkar (gizli sohbetin eki normal sohbete gitmesin).
  const resetAttachments = attachments.reset
  useEffect(() => {
    resetAttachments()
  }, [activeId, resetAttachments])

  // Ekran okuyucu için tek duyuru: akan metin her parçada okunmaz, yalnızca durum değişince söylenir.
  const sqlWaiting = useSql((s) => (activeId ? (s.approvals[activeId]?.length ?? 0) > 0 : false))
  const waitingApproval = approvals.length > 0 || sqlWaiting
  const [announce, setAnnounce] = useState('')
  const announced = useRef<{ id: string | null; busy: boolean }>({ id: activeId, busy })
  useEffect(() => {
    const previous = announced.current
    announced.current = { id: activeId, busy }
    if (busy) setAnnounce(waitingApproval ? t.chat.live.approval : t.chat.live.writing)
    else setAnnounce(previous.id === activeId && previous.busy ? t.chat.live.done : '')
  }, [activeId, busy, waitingApproval, t])

  // Klasör bağlıyken seçili model araç kullanamıyorsa göndermeden önce uyar.
  useEffect(() => {
    if (!folderId || !model) {
      setToolsMissing(false)
      return
    }
    let cancelled = false
    void window.api.models.supportsTools(model).then((ok) => !cancelled && setToolsMissing(!ok))
    return () => {
      cancelled = true
    }
  }, [folderId, model])

  const scrollToBottom = (): void => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // Kullanıcı yukarı kaydırmadıysa yeni metin geldikçe en altta kal.
  useLayoutEffect(() => {
    if (pinnedToBottom.current) scrollToBottom()
  }, [messages, streaming, liveSteps, approvals])

  useLayoutEffect(() => {
    pinnedToBottom.current = true
    setShowJump(false)
    setSendError('')
    scrollToBottom()
  }, [activeId])

  // Esc süren cevabı durdurur; açık bir menü, pencere ya da arama kutusu Esc'i kendisi kullandıysa durdurmaz.
  useEffect(() => {
    if (!busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing) return
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target?.closest('[role="dialog"], [role="menu"], [role="search"], [role="listbox"]')) return
      // Mesaj kutusu dışındaki bir yazı alanında Esc o alana aittir (başlık düzenleme, belge, arama).
      if (target?.matches('input, textarea, select, [contenteditable="true"]') && !target.closest('[data-composer]')) return
      // Karar, bu tuşu dinleyen bütün işleyiciler çalıştıktan sonra verilir: biri Esc'i işlediyse cevap sürer.
      setTimeout(() => {
        if (!e.defaultPrevented) void stop()
      }, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, stop])

  const handleSend = async (text: string, attachmentIds: string[] = []): Promise<boolean> => {
    setSendError('')
    // Mesajın tamamı "CV'yi yanda göster" gibi bir istekse ve sohbette belge varsa belge paneli açılır.
    if (asksShowOnSide(text)) {
      const pendingDoc = attachments.items.find((a) => a.kind === 'text' && attachmentIds.includes(a.id))
      const target = pendingDoc ?? messages.flatMap((m) => m.attachments).filter((a) => a.kind === 'text').at(-1)
      if (target) {
        openDoc(target.id)
        // Yeni eklenen dosya varsa mesaj yine gönderilir; yoksa istek yerine getirilmiştir.
        if (attachmentIds.length === 0) return true
      }
    }
    pinnedToBottom.current = true
    try {
      return await send(text, attachmentIds)
    } catch (e) {
      setSendError(errorText(e))
      return false
    }
  }

  const lastIsUser = messages.at(-1)?.role === 'user'

  return (
    <>
    {codeFolder && filesOpen && <FileTree folderId={codeFolder.id} name={codeFolder.name} />}
    <main
      className="relative flex min-w-[300px] flex-1 flex-col bg-surface"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        attachments.add(filesFrom(e.dataTransfer))
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
          <p className="font-display text-xl font-semibold text-accent">{t.chat.dropHere}</p>
        </div>
      )}
      {/*
        Pencere düğmeleri sağ üst köşededir; yan panel açıkken o köşe panele aittir. Başlık taşmasın diye
        dar alanda kişilik, gizli sohbet, klasör ve veritabanı rozetleri yalnızca simgelerine iner.
      */}
      <header ref={headerRef} className={cn('drag flex h-10 shrink-0 items-center pl-5', sidePanel ? 'gap-1.5 pr-3' : 'gap-3 pr-[150px]')}>
        <h1 className="min-w-[48px] shrink truncate text-sm font-medium text-ink">{title === undefined || title === UNTITLED_CONVERSATION ? t.common.newChat : title}</h1>
        {persona && persona.id !== DEFAULT_PERSONA_ID && !tight && (
          <span className="flex min-w-0 shrink items-center gap-1.5 text-[13px] text-ink-2" title={persona.name}>
            <PersonaAvatar icon={persona.icon} letter={persona.whatsapp ? persona.name : undefined} size={20} />
            <span className={headerWidth >= 720 ? 'truncate' : 'sr-only'}>{persona.name}</span>
          </span>
        )}
        {isPrivate && (
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2"
            title={t.chat.privateHint}
          >
            <EyeOff size={12} aria-hidden />
            <span className={headerWidth >= 640 ? '' : 'sr-only'}>{t.chat.privateBadge}</span>
          </span>
        )}
        <ModelSelect />
        {!tight && <MemoryMenu />}
        {codeFolder && <FilesToggle />}
        <FolderMenu compact={headerWidth < 880} />
        <SqlMenu compact={headerWidth < 880} />
        {activeId && messages.length > 0 && !tight && <ExportMenu conversationId={activeId} />}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <div className="relative min-h-0 flex-1">
        {finding && <FindBar container={scrollRef.current} version={`${activeId}:${messages.length}:${streaming?.length ?? 0}`} onClose={() => setFinding(false)} />}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
            pinnedToBottom.current = atBottom
            setShowJump(!atBottom)
          }}
          className="h-full overflow-y-auto"
        >
          {messages.length === 0 && !busy ? (
            <div className="mx-auto flex h-full w-full max-w-[780px] flex-col justify-center px-6 pb-10">
              <h2 className="font-display text-[40px] leading-[1.1] font-semibold tracking-tight text-ink">
                {t.chat.greeting(userName)}
                <br />
                {bubbles ? t.chat.greetingQuestionCasual : t.chat.greetingQuestion}
              </h2>

              {(error || sendError) && (
                <div className="mt-6">
                  <Notice tone="danger">{error || sendError}</Notice>
                </div>
              )}

              {/* Kişilik ve gizlilik yalnızca henüz başlamamış yeni sohbette seçilir; başlamış sohbette değişmez. */}
              {!activeId && (
              <div role="radiogroup" aria-label={t.chat.personaPicker} className="mt-7 flex flex-wrap gap-2">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={persona?.id === p.id}
                    title={p.tagline}
                    onClick={() => setDraft({ personaId: p.id })}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-full border py-1 pr-4 pl-1.5 text-sm transition-colors',
                      persona?.id === p.id
                        ? 'border-accent bg-accent-soft font-medium text-ink'
                        : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'
                    )}
                  >
                    <PersonaAvatar icon={p.icon} letter={p.whatsapp ? p.name : undefined} size={28} />
                    {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => go({ name: 'whatsapp' })}
                  className="flex h-10 items-center gap-2 rounded-full border border-dashed border-line px-4 text-sm text-ink-2 transition-colors hover:border-accent hover:text-ink"
                >
                  <Plus size={15} aria-hidden />
                  {t.chat.addFromWhatsapp}
                </button>
              </div>
              )}
              {persona && <p className={cn('text-[13px] text-ink-3', activeId ? 'mt-6' : 'mt-3')}>{persona.tagline}</p>}

              {persona?.id === DEFAULT_PERSONA_ID && (
                <ul className="mt-6 grid grid-cols-2 gap-2.5">
                  {t.chat.starters.map((starter) => (
                    <li key={starter}>
                      <button
                        type="button"
                        onClick={() => void handleSend(starter)}
                        className="h-full w-full rounded-xl border border-line px-4 py-3 text-left text-sm leading-snug text-ink-2 transition-colors hover:border-accent hover:text-ink"
                      >
                        {starter}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!activeId && (
                <label className="mt-6 flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={draft.private}
                    onChange={(e) => setDraft({ private: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <EyeOff size={14} aria-hidden />
                  {t.chat.privateOption}
                </label>
              )}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[780px] space-y-7 px-6 pt-6 pb-10">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <UserMessage key={m.id} message={m} disabled={busy} laterUndo={messages.slice(i + 1).some((later) => later.undoCount > 0)} />
                ) : (
                  <AssistantMessage key={m.id} message={m} isLast={i === messages.length - 1} busy={busy} bubbles={bubbles} />
                )
              )}
              {busy && <StepList steps={liveSteps} running />}
              {busy && terminal && <LiveTerminal command={terminal.command} output={terminal.output} />}
              <SqlApprovals conversationId={activeId} />
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
              {busy && thought && <ThoughtBox text={thought} done={!!streaming} />}
              {busy &&
                approvals.length === 0 &&
                // Düşünürken düşünce kutusu zaten görünür; ayrıca "Düşünüyor" yazılmaz.
                !(thought && !streaming) &&
                (streaming && bubbles ? (
                  <Bubbles text={streaming} typing />
                ) : streaming ? (
                  <div>
                    <Markdown text={streaming} />
                    <span className="caret" aria-hidden />
                  </div>
                ) : (
                  bubbles ? (
                    <Bubbles text="" typing />
                  ) : (
                    <p className="flex items-center gap-1 text-sm text-ink-3">
                      {t.chat.thinking}
                      <span className="caret" aria-hidden />
                    </p>
                  )
                ))}
              {learned.length > 0 && memoryEnabled && activeId && (
                <div className="rounded-xl border border-line bg-bg px-4 py-3" role="status">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                      <Brain size={15} className="text-teal" aria-hidden />
                      {t.chat.learned.title}
                    </p>
                    <IconButton label={t.chat.learned.dismiss} onClick={() => dismissLearned(activeId)} className="h-7 w-7">
                      <X size={14} aria-hidden />
                    </IconButton>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {learned.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 text-[13px] text-ink">
                        <span>{m.text}</span>
                        <button
                          type="button"
                          onClick={() => void forget(activeId, m.id)}
                          className="shrink-0 font-medium text-accent hover:underline"
                        >
                          {t.chat.learned.forget}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(error || sendError) && <Notice tone="danger">{error || sendError}</Notice>}
              {/* Cevap gelmeden durdurulduysa ya da hata olduysa son mesaj cevapsız kalır. */}
              {lastIsUser && !busy && (
                <Button size="sm" onClick={() => void regenerate()}>
                  <RefreshCw size={14} aria-hidden />
                  {error || sendError ? t.common.actions.retry : t.chat.writeAnswer}
                </Button>
              )}
            </div>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => {
              pinnedToBottom.current = true
              setShowJump(false)
              scrollToBottom()
            }}
            aria-label={t.chat.jumpToBottom}
            className={cn(
              'absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full',
              'border border-line bg-surface text-ink-2 shadow-pop hover:text-ink'
            )}
          >
            <ArrowDown size={16} aria-hidden />
          </button>
        )}
      </div>

      {toolsMissing && (
        <div className="mx-auto w-full max-w-[780px] px-6 pb-2">
          <Notice tone="warn">{t.chat.composer.toolsMissing(model)}</Notice>
        </div>
      )}
      {activeId && <TrustStrip conversationId={activeId} />}
      <Composer busy={busy} model={model} attachments={attachments} onSend={handleSend} onStop={() => void stop()} />
    </main>
    {docId ? <DocPane attachmentId={docId} /> : viewing ? <CodeViewer folderId={viewing.folderId} path={viewing.path} /> : sqlShown && <SqlPane />}
    </>
  )
}
