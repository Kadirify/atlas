import { Check, ChevronDown, Circle, CircleAlert, CircleCheck, CircleDot, FilePen, FileText, FolderInput, FolderOpen, FolderPlus, ListChecks, Search, ShieldAlert, SquareTerminal, Trash2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileApproval, PlanItem, FolderCapability, ToolStep } from '@shared/types'
import { Button } from '@/components/ui'
import { collapse, lineDiff } from '@/lib/diff'
import { cn, errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_folder: FolderOpen,
  read_file: FileText,
  search_files: Search,
  write_file: FilePen,
  move_file: FolderInput,
  delete_file: Trash2,
  create_folder: FolderPlus,
  run_command: SquareTerminal
}

/** Modelin cevabı yazarken kullandığı dosya araçları. */
export function StepList({ steps, running = false }: { steps: ToolStep[]; running?: boolean }) {
  const t = useT()
  if (steps.length === 0) return null
  return (
    <ul className="mb-3 space-y-1" aria-label={t.chat.steps.label}>
      {steps.map((step, index) => {
        // Plan her güncellendiğinde yeni bir adım gelir; yalnızca en sonuncusu gösterilir.
        if (step.plan && steps.slice(index + 1).some((later) => later.plan)) return null
        if (step.plan) return <PlanList key={step.id} items={step.plan} />
        const Icon = step.status === 'error' ? CircleAlert : step.status === 'denied' ? X : (TOOL_ICONS[step.tool] ?? FileText)
        return (
          <li key={step.id}>
            <div
              className={cn(
                'flex items-center gap-2 text-[13px]',
                step.status === 'error' ? 'text-danger' : step.status === 'denied' ? 'text-warn' : 'text-ink-3',
                running && index === steps.length - 1 && 'text-ink-2'
              )}
            >
              <Icon size={14} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{step.label}</span>
            </div>
            {step.terminal && <TerminalOutput terminal={step.terminal} />}
          </li>
        )
      })}
    </ul>
  )
}

/** Modelin iş planı: adımlar ve durumları. */
function PlanList({ items }: { items: PlanItem[] }) {
  const t = useT()
  const done = items.filter((item) => item.status === 'done').length
  return (
    <li className="my-2 rounded-xl border border-line bg-bg px-3.5 py-2.5">
      <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <ListChecks size={14} className="text-accent" aria-hidden />
        {t.chat.steps.plan}
        <span className="ml-auto text-xs font-normal text-ink-3 tabular-nums">{t.chat.steps.planCount(done, items.length)}</span>
      </p>
      <ol className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className={cn('flex items-start gap-2 text-[13px] leading-relaxed', item.status === 'done' ? 'text-ink-3 line-through' : item.status === 'in_progress' ? 'font-medium text-ink' : 'text-ink-2')}>
            {item.status === 'done' ? (
              <CircleCheck size={14} className="mt-0.5 shrink-0 text-teal" aria-hidden />
            ) : item.status === 'in_progress' ? (
              <CircleDot size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            ) : (
              <Circle size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            )}
            <span>{item.step}</span>
          </li>
        ))}
      </ol>
    </li>
  )
}

/** Komut çalışırken canlı terminal: çıktı geldikçe aşağı kayar. */
export function LiveTerminal({ command, output }: { command: string; output: string }) {
  const t = useT()
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [output])
  return (
    <div className="term-box mb-3 overflow-hidden rounded-lg border border-line bg-[#0b1020] text-[12.5px]">
      <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[#c7d2fe]">
        <span className="text-[#64748b]" aria-hidden>
          &gt;
        </span>
        <span className="min-w-0 flex-1 truncate">{command}</span>
        <span className="shrink-0 font-sans text-xs text-[#93c5fd]">{t.chat.steps.running}</span>
        <span className="caret" aria-hidden />
      </div>
      <pre ref={ref} className="max-h-[260px] overflow-auto border-t border-white/10 px-3 py-2 font-mono leading-relaxed whitespace-pre-wrap text-[#cbd5e1]">
        {output || ' '}
      </pre>
    </div>
  )
}

/** Çalıştırılan komutun terminal çıktısı; kısa çıktılar açık, uzunlar kapalı gelir. */
function TerminalOutput({ terminal }: { terminal: NonNullable<ToolStep['terminal']> }) {
  const t = useT()
  const lines = terminal.output ? terminal.output.split('\n').length : 0
  const [open, setOpen] = useState(lines <= 12)
  return (
    <div className="term-box mt-1.5 mb-2 ml-6 overflow-hidden rounded-lg border border-line bg-[#0b1020] text-[12.5px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[#c7d2fe]"
      >
        <span className="text-[#64748b]" aria-hidden>
          &gt;
        </span>
        <span className="min-w-0 flex-1 truncate">{terminal.command}</span>
        <span className={cn('shrink-0 font-sans text-xs', terminal.code === 0 ? 'text-[#5eead4]' : 'text-[#fca5a5]')}>
          {terminal.code === null ? t.chat.steps.timedOut : t.chat.steps.exitCode(terminal.code)}
        </span>
        <ChevronDown size={13} className={cn('shrink-0 text-[#64748b] transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <pre className="max-h-[260px] overflow-auto border-t border-white/10 px-3 py-2 font-mono leading-relaxed whitespace-pre-wrap text-[#cbd5e1]">
          {terminal.output || t.chat.steps.noOutput}
        </pre>
      )}
      {terminal.effects && <CommandEffects effects={terminal.effects} />}
    </div>
  )
}

/** Komutun proje klasöründe değiştirdikleri (güvenli kip): neyin değiştiği ve geri alınabileceği */
function CommandEffects({ effects }: { effects: NonNullable<NonNullable<ToolStep['terminal']>['effects']> }) {
  const t = useT()
  const s = t.chat.steps
  const files = [
    ...effects.deleted.map((path) => ({ path, note: s.effectsDeleted })),
    ...effects.changed.map((path) => ({ path, note: '' })),
    ...effects.created.map((path) => ({ path, note: s.effectsCreated }))
  ]
  const risky = effects.deleted.length + effects.changed.length > 0
  return (
    <div className="border-t border-white/10 px-3 py-2 font-sans text-[12.5px] leading-relaxed text-[#cbd5e1]">
      <p className={cn('font-medium', effects.deleted.length > 0 ? 'text-[#fca5a5]' : 'text-[#c7d2fe]')}>
        {s.effects(effects.changed.length, effects.deleted.length, effects.created.length)}
        {effects.partial && ' …'}
      </p>
      <ul className="mt-1 max-h-[120px] overflow-auto font-mono text-[12px] text-[#94a3b8]">
        {files.map((f) => (
          <li key={f.path} className="truncate">
            {f.path}
            {f.note && <span className="font-sans text-[#64748b]"> ({f.note})</span>}
          </li>
        ))}
      </ul>
      {effects.lost.length > 0 && <p className="mt-1 text-[#fca5a5]">{s.effectsLost(effects.lost.join(', '))}</p>}
      {risky && <p className="mt-1 text-[#94a3b8]">{s.effectsUndo}</p>}
    </div>
  )
}

function Diff({ before, after }: { before: string | null; after: string }) {
  const t = useT()
  const rows = useMemo(() => {
    if (before === null) return after.split('\n').map((text) => ({ type: 'add' as const, text }))
    const diff = lineDiff(before, after)
    return diff ? collapse(diff) : null
  }, [before, after])

  if (!rows) {
    return (
      <div>
        <p className="mb-1.5 text-xs text-ink-3">{t.chat.diff.tooLarge}</p>
        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-ink">
          {after.slice(0, 20_000)}
        </pre>
      </div>
    )
  }

  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-line bg-bg font-mono text-xs leading-relaxed" role="group" aria-label={t.chat.diff.label}>
      {rows.map((row, i) =>
        row.type === 'skip' ? (
          <div key={i} className="px-3 py-1 text-ink-3 select-none">
            {t.chat.diff.unchanged(row.count)}
          </div>
        ) : (
          <div
            key={i}
            className={cn(
              'flex gap-2 px-3 whitespace-pre-wrap',
              row.type === 'add' && 'bg-teal-soft text-ink',
              row.type === 'del' && 'bg-danger-soft text-ink line-through decoration-danger/50',
              row.type === 'same' && 'text-ink-2'
            )}
          >
            <span className="w-3 shrink-0 text-ink-3 select-none" aria-hidden>
              {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''}
            </span>
            <span className="min-w-0 break-words">
              <span className="sr-only">{row.type === 'add' ? t.chat.diff.added : row.type === 'del' ? t.chat.diff.removed : ''}</span>
              {row.text || ' '}
            </span>
          </div>
        )
      )}
    </div>
  )
}

/** Dosyayı değiştiren bir işlem için kullanıcıdan onay isteyen kart. */
export function ApprovalCard({ approval }: { approval: FileApproval }) {
  const t = useT()
  const respond = useApp((s) => s.respondApproval)
  const isNew = approval.kind === 'write' && approval.before === null
  const title =
    approval.kind === 'write'
      ? isNew
        ? t.chat.approval.create
        : t.chat.approval.change
      : approval.kind === 'move'
        ? t.chat.approval.move
        : approval.kind === 'command'
          ? t.chat.approval.command
          : t.chat.approval.trash

  return (
    <div className="rounded-xl border border-accent bg-surface p-4" role="alertdialog" aria-label={title}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 font-mono text-[13px] break-all text-ink-2">
        {approval.path}
        {approval.target && (
          <>
            {' '}
            <span className="font-sans text-ink-3">{t.chat.approval.moveTo}</span> {approval.target}
          </>
        )}
      </p>
      {approval.kind === 'write' && approval.after !== undefined && (
        <div className="mt-3">
          <Diff before={approval.before ?? null} after={approval.after} />
        </div>
      )}
      {approval.kind === 'command' && <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{t.chat.approval.commandNote}</p>}
      {approval.kind === 'delete' && (
        <p className="mt-2 text-[13px] text-ink-3">{t.chat.approval.trashNote}</p>
      )}
      {approval.protected && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] leading-relaxed font-medium text-danger">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {t.chat.approval.protectedWarning}
        </p>
      )}
      {approval.recheck && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-relaxed font-medium text-warn">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {t.chat.approval.recheckWarning}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void respond(approval, true)}>
          <Check size={14} aria-hidden />
          {t.common.actions.approve}
        </Button>
        {/* Başka programların kendiliğinden çalıştırdığı dosyalar her seferinde sorulur; kalıcı izin önerilmez. */}
        {approval.kind !== 'delete' && !approval.protected && (
          <Button size="sm" variant="secondary" onClick={() => void respond(approval, true, true)} title={approval.kind === 'command' ? t.chat.approval.alwaysCommandHint : t.chat.approval.alwaysEditsHint}>
            {approval.kind === 'command' ? t.chat.approval.alwaysCommand : t.chat.approval.alwaysEdits}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void respond(approval, false)}>
          {t.common.actions.reject}
        </Button>
      </div>
    </div>
  )
}

/** Sohbet başlığındaki klasör düğmesi: klasör bağlar, değiştirir ya da bağlantıyı kaldırır. compact: yalnızca simge. */
export function FolderMenu({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const folders = useApp((s) => s.folders)
  const loadFolders = useApp((s) => s.loadFolders)
  const folderId = useApp((s) => s.conversations.find((c) => c.id === s.activeId)?.folderId ?? (s.activeId ? null : s.draft.folderId))
  const attachFolder = useApp((s) => s.attachFolder)
  const [open, setOpen] = useState(false)
  const [capability, setCapability] = useState<FolderCapability | null>(null)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const current = folders.find((f) => f.id === folderId)

  useEffect(() => {
    void window.api.folders.capability().then(setCapability, () => setCapability(null))
  }, [])

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

  async function pick(): Promise<void> {
    setError('')
    try {
      const folder = await window.api.folders.add()
      if (!folder) return
      await loadFolders()
      await attachFolder(folder.id)
      setOpen(false)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const disabled = capability !== null && !capability.read
  const item = 'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2'

  return (
    <div ref={ref} className={cn('relative', compact ? 'shrink-0' : 'min-w-0 shrink')}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? current.name : t.chat.folder.attach}
        title={disabled ? capability?.reason : current ? current.path : t.chat.folder.attachHint}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 max-w-[220px] min-w-0 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          current ? 'bg-teal-soft font-medium text-teal' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
        )}
      >
        <FolderOpen size={14} className="shrink-0" aria-hidden />
        {/* Başlık darken (yan panel açık, küçük pencere) yalnızca simge kalır; yolu üzerine gelince görünür. */}
        {!compact && <span className="truncate">{current ? current.name : t.chat.folder.attach}</span>}
        {!compact && <ChevronDown size={13} className="shrink-0 opacity-70" aria-hidden />}
      </button>

      {open && (
        <div role="menu" className="absolute top-9 left-0 z-30 w-72 rounded-xl border border-line bg-surface p-1 text-ink shadow-pop">
          {folders.length > 0 && (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{t.chat.folder.allowed}</p>
              {folders.map((f) => (
                <button
                  key={f.id}
                  role="menuitemradio"
                  aria-checked={f.id === folderId}
                  className={item}
                  onClick={() => {
                    void attachFolder(f.id)
                    setOpen(false)
                  }}
                >
                  <FolderOpen size={14} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block truncate text-xs text-ink-3">{f.path}</span>
                  </span>
                  {f.id === folderId && <Check size={14} className="shrink-0 text-teal" aria-hidden />}
                </button>
              ))}
              <div className="my-1 border-t border-line" />
            </>
          )}
          <button role="menuitem" className={item} onClick={() => void pick()}>
            <FolderPlus size={14} className="shrink-0 text-ink-3" aria-hidden />
            {t.chat.folder.pickAnother}
          </button>
          {current && (
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                void attachFolder(null)
                setOpen(false)
              }}
            >
              <X size={14} className="shrink-0 text-ink-3" aria-hidden />
              {t.chat.folder.detach}
            </button>
          )}
          <p className="px-2.5 pt-1.5 pb-1.5 text-xs leading-relaxed text-ink-3">
            {t.chat.folder.scopeNote}
            {capability && !capability.write ? ` ${capability.reason}` : ` ${t.chat.folder.asksFirst}`}
          </p>
          {error && <p className="px-2.5 pb-1.5 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
