import { ChevronDown, ChevronRight, Code2, Database, ExternalLink, File, FileLock2, Folder as FolderIcon, FolderOpen, FolderPlus, MessageSquareQuote, PanelLeft, RefreshCw, ShieldCheck, Terminal, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CodeEntry, CodeFile } from '@shared/types'
import { Button, IconButton, Notice } from '@/components/ui'
import { cn, errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

/**
 * Kod alanının giriş ekranı: bir proje klasörü seçilir ve o projede Atlas Code ile bir geliştirme sohbeti başlar.
 * Sohbete klasör bağlanır; Atlas dosyaları okur, değiştirir (onayla) ve komut çalıştırır (onayla). Silme yapmaz.
 */
export default function CodeHome() {
  const t = useT()
  const c = t.chat.codeArea
  const folders = useApp((s) => s.folders)
  const loadFolders = useApp((s) => s.loadFolders)
  const startCode = useApp((s) => s.startCode)
  const installed = useApp((s) => s.installed)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const hasCodeModel = installed.some((m) => m.name.startsWith('atlas-code'))

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  async function open(folderId?: string): Promise<void> {
    setError('')
    setBusy(true)
    try {
      let id = folderId
      if (!id) {
        const folder = await window.api.folders.add()
        if (!folder) return
        await loadFolders()
        id = folder.id
      }
      await startCode(id)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const rules = [
    { icon: Code2, text: c.ruleEdit },
    { icon: Terminal, text: c.ruleCommand },
    { icon: Database, text: c.ruleSql },
    { icon: ShieldCheck, text: c.ruleDelete }
  ]

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface">
      <div className="drag h-10 shrink-0" />
      <div className="mx-auto w-full max-w-[760px] px-8 pb-12">
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{c.intro}</p>

        <ul className="mt-6 space-y-2.5">
          {rules.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm leading-relaxed text-ink-2">
              <Icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {text}
            </li>
          ))}
        </ul>

        {!hasCodeModel && (
          <div className="mt-6">
            <Notice tone="info">{c.noCodeModel}</Notice>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">{c.projects}</h2>
          <Button variant="primary" disabled={busy} onClick={() => void open()}>
            <FolderPlus size={15} aria-hidden />
            {c.openFolder}
          </Button>
        </div>
        {folders.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">{c.noProjects}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {folders.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void open(folder.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <FolderIcon size={18} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{folder.name}</span>
                    <span className="block truncate font-mono text-xs text-ink-3">{folder.path}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-accent">{c.start}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

/** Sohbet başlığındaki "Dosyalar" düğmesi: bağlı proje klasörünün dosya ağacını açar ve kapatır. */
export function FilesToggle() {
  const t = useT()
  const open = useApp((s) => s.filesOpen)
  const setFilesOpen = useApp((s) => s.setFilesOpen)
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label={t.chat.codeArea.files}
      title={t.chat.codeArea.files}
      onClick={() => setFilesOpen(!open)}
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-2', open ? 'text-accent' : 'text-ink-3 hover:text-ink')}
    >
      <PanelLeft size={15} aria-hidden />
    </button>
  )
}

/** Proje dosya ağacı: klasörler tıklanınca açılır, dosyaya tıklanınca sağda görüntülenir. */
export function FileTree({ folderId, name }: { folderId: string; name: string }) {
  const t = useT()
  const c = t.chat.codeArea
  const [children, setChildren] = useState<Record<string, CodeEntry[]>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const active = useApp((s) => (s.codeFile?.folderId === folderId ? s.codeFile.path : null))
  const openCodeFile = useApp((s) => s.openCodeFile)
  const setFilesOpen = useApp((s) => s.setFilesOpen)
  const [menu, setMenu] = useState<{ entry: CodeEntry; x: number; y: number } | null>(null)

  const load = useCallback(
    async (rel: string): Promise<void> => {
      try {
        const entries = await window.api.code.list(folderId, rel)
        setChildren((all) => ({ ...all, [rel]: entries }))
        setError('')
      } catch (e) {
        setError(errorText(e))
      }
    },
    [folderId]
  )

  useEffect(() => {
    setChildren({})
    setOpen({})
    void load('')
  }, [load])

  const refresh = (): void => {
    void load('')
    for (const [rel, isOpen] of Object.entries(open)) if (isOpen) void load(rel)
  }

  // Atlas bir dosya oluşturunca ya da cevap bitince ağaç kendiliğinden yenilenir.
  const activity = useApp((st) => (st.activeId ? (st.liveSteps[st.activeId]?.length ?? 0) * 1000 + (st.messages[st.activeId]?.length ?? 0) : 0))
  useEffect(() => {
    if (activity > 0) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity])

  const render = (rel: string, depth: number): React.ReactNode =>
    (children[rel] ?? []).map((entry) => (
      <li key={entry.path} role="treeitem" aria-expanded={entry.dir ? !!open[entry.path] : undefined} aria-selected={active === entry.path}>
        <button
          type="button"
          title={entry.path}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ entry, x: e.clientX, y: e.clientY })
          }}
          onClick={() => {
            if (!entry.dir) return openCodeFile({ folderId, path: entry.path })
            const next = !open[entry.path]
            setOpen((all) => ({ ...all, [entry.path]: next }))
            if (next && !children[entry.path]) void load(entry.path)
          }}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] transition-colors hover:bg-surface-2',
            active === entry.path ? 'bg-accent-soft text-ink' : 'text-ink-2'
          )}
        >
          {entry.dir ? (
            open[entry.path] ? <ChevronDown size={12} className="shrink-0 text-ink-3" aria-hidden /> : <ChevronRight size={12} className="shrink-0 text-ink-3" aria-hidden />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {entry.dir ? (
            open[entry.path] ? <FolderOpen size={14} className="shrink-0 text-accent" aria-hidden /> : <FolderIcon size={14} className="shrink-0 text-accent" aria-hidden />
          ) : entry.secret ? (
            <FileLock2 size={14} className="shrink-0 text-warn" aria-hidden />
          ) : (
            <File size={14} className="shrink-0 text-ink-3" aria-hidden />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {entry.dir && open[entry.path] && <ul role="group">{render(entry.path, depth + 1)}</ul>}
      </li>
    ))

  return (
    <nav aria-label={c.files} className="flex w-[230px] shrink-0 flex-col border-r border-line bg-bg">
      <header className="drag flex h-10 shrink-0 items-center gap-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink" title={name}>
          {name}
        </span>
        <IconButton label={c.refresh} onClick={refresh}>
          <RefreshCw size={13} aria-hidden />
        </IconButton>
        <IconButton label={c.hideFiles} onClick={() => setFilesOpen(false)}>
          <X size={14} aria-hidden />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {error && <p className="px-2 py-2 text-[13px] text-danger">{error}</p>}
        {!error && children[''] && children[''].length === 0 && <p className="px-2 py-2 text-[13px] text-ink-3">{c.emptyFolder}</p>}
        <ul role="tree">{render('', 0)}</ul>
      </div>
      {menu && <EntryMenu folderId={folderId} entry={menu.entry} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </nav>
  )
}

/** Dosya görüntüleyici: seçilen dosyayı satır numaralarıyla, salt okunur gösterir. */
export function CodeViewer({ folderId, path }: { folderId: string; path: string }) {
  const t = useT()
  const c = t.chat.codeArea
  const openCodeFile = useApp((s) => s.openCodeFile)
  const [file, setFile] = useState<CodeFile | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError('')
    window.api.code.read(folderId, path).then(
      (loaded) => !cancelled && setFile(loaded),
      (e) => !cancelled && (setFile(null), setError(errorText(e)))
    )
    return () => {
      cancelled = true
    }
  }, [folderId, path, tick])

  const lines = file?.text.split('\n') ?? []
  const quote = (): void => {
    const selected = window.getSelection()?.toString().trim()
    const body = selected || file?.text.slice(0, 4000) || ''
    if (body) useApp.setState({ quote: `${c.quoteIntro(path)}\n\n\`\`\`\n${body}\n\`\`\`\n\n` })
  }

  return (
    <aside aria-label={c.viewerLabel} className="flex w-[44%] max-w-[820px] min-w-[300px] flex-col border-l border-line bg-bg">
      <header className="drag flex h-10 shrink-0 items-center gap-2 pr-[150px] pl-4">
        <File size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[13px] text-ink" title={path}>
          {path}
        </span>
      </header>
      <div className="flex shrink-0 items-center gap-1 border-y border-line bg-surface px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3 tabular-nums">{file && !file.note ? c.lineCount(lines.length) + (file.truncated ? `, ${c.truncated}` : '') : ''}</span>
        <Button size="sm" variant="ghost" disabled={!file?.text} onClick={quote} title={c.quoteHint}>
          <MessageSquareQuote size={14} aria-hidden />
          {c.quote}
        </Button>
        <IconButton label={c.refresh} onClick={() => setTick((n) => n + 1)}>
          <RefreshCw size={14} aria-hidden />
        </IconButton>
        <IconButton label={c.closeViewer} onClick={() => openCodeFile(null)}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="p-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {file?.note && (
          <div className="p-3">
            <Notice tone="warn">{file.note}</Notice>
          </div>
        )}
        {file && !file.note && (
          <div className="flex min-w-max font-mono text-[13px] leading-[1.55]">
            <pre aria-hidden className="sticky left-0 shrink-0 border-r border-line bg-bg px-3 py-3 text-right text-ink-3 select-none">
              {lines.map((_, i) => i + 1).join('\n')}
            </pre>
            <pre className="px-4 py-3 text-ink">{file.text}</pre>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Dosya ağacında sağ tık menüsü: aç, görüntüle, Gezgin'de göster, sohbete ekle. */
function EntryMenu({ folderId, entry, x, y, onClose }: { folderId: string; entry: CodeEntry; x: number; y: number; onClose(): void }) {
  const t = useT()
  const c = t.chat.codeArea
  const openCodeFile = useApp((s) => s.openCodeFile)
  const [note, setNote] = useState('')

  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      onClose()
    } catch (e) {
      setNote(errorText(e))
    }
  }
  const item = 'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink'
  return (
    <div
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 190) }}
      className="fixed z-50 w-[220px] rounded-xl border border-line bg-surface p-1.5 shadow-pop"
    >
      {!entry.dir && (
        <button type="button" role="menuitem" className={item} onClick={() => void run(() => window.api.code.open(folderId, entry.path))}>
          <ExternalLink size={14} aria-hidden />
          {c.menuOpen}
        </button>
      )}
      {!entry.dir && (
        <button type="button" role="menuitem" className={item} onClick={() => (openCodeFile({ folderId, path: entry.path }), onClose())}>
          <File size={14} aria-hidden />
          {c.menuView}
        </button>
      )}
      <button type="button" role="menuitem" className={item} onClick={() => void run(() => window.api.code.reveal(folderId, entry.path))}>
        <FolderOpen size={14} aria-hidden />
        {c.menuReveal}
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          useApp.setState({ quote: `${entry.path} ` })
          onClose()
        }}
      >
        <MessageSquareQuote size={14} aria-hidden />
        {c.menuMention}
      </button>
      {note && <p className="px-2.5 pt-1 text-xs text-danger">{note}</p>}
    </div>
  )
}
