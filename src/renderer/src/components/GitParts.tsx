import { File, FileDiff, FileLock2, GitBranch, GitBranchPlus, RefreshCw, Sparkles, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GitChange, GitChangeKind, GitFileDiff, GitStatus } from '@shared/types'
import { Diff } from '@/components/FolderParts'
import { Button, IconButton, Notice } from '@/components/ui'
import { cn, errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const KIND_MARK: Record<GitChangeKind, string> = { added: '+', modified: '~', deleted: '−', conflict: '!' }
const KIND_COLOR: Record<GitChangeKind, string> = { added: 'text-teal', modified: 'text-accent', deleted: 'text-danger', conflict: 'text-warn' }

/** Atlas bir dosyayı değiştirdiğinde ya da cevap bittiğinde değişen sayı: git durumu ve fark buna göre yenilenir. */
function useActivity(): number {
  return useApp((s) => (s.activeId ? (s.liveSteps[s.activeId]?.length ?? 0) * 1000 + (s.messages[s.activeId]?.length ?? 0) : 0))
}

export interface GitStatusState {
  /** undefined: henüz okunmadı; null: klasör bir git deposu değil ya da git kurulu değil */
  status: GitStatus | null | undefined
  error: string
  refresh(): void
  setStatus(status: GitStatus | null): void
}

/** Bağlı proje klasörünün git durumu; Atlas dosya değiştirdikçe ve pencere öne geldikçe kendiliğinden yenilenir. */
export function useGitStatus(folderId: string): GitStatusState {
  const [status, setStatus] = useState<GitStatus | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const activity = useActivity()
  const gitTick = useApp((s) => s.gitTick)

  useEffect(() => {
    setStatus(undefined)
    setError('')
  }, [folderId])

  useEffect(() => {
    let cancelled = false
    // Art arda gelen adımlarda git her seferinde çalıştırılmaz.
    const timer = setTimeout(() => {
      window.api.git.status(folderId).then(
        (next) => {
          if (cancelled) return
          setStatus(next)
          setError('')
        },
        (e) => !cancelled && setError(errorText(e))
      )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [folderId, activity, gitTick, tick])

  // Kullanıcı terminalde commit atıp geri döndüğünde liste eski kalmasın.
  useEffect(() => {
    const onFocus = (): void => setTick((n) => n + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return { status, error, refresh: () => setTick((n) => n + 1), setStatus }
}

/**
 * "Değişiklikler" sekmesi: dal, son commit'e göre değişen dosyalar ve commit kutusu. Commit ve dal açma yalnızca
 * kullanıcının tıklamasıyla yapılır; push yoktur.
 */
export function GitChanges({ folderId, git }: { folderId: string; git: GitStatusState }) {
  const t = useT()
  const g = t.chat.git
  const { status, error } = git
  const conversationId = useApp((s) => s.activeId)
  const openCodeFile = useApp((s) => s.openCodeFile)
  const bumpGit = useApp((s) => s.bumpGit)
  const active = useApp((s) => (s.codeFile?.folderId === folderId && s.codeFile.diff ? s.codeFile.path : null))
  /** Kullanıcının elle değiştirdiği seçimler; dokunulmayan dosyalar seçilidir (gizli dosyalar ve çakışmalar hariç) */
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState<'suggest' | 'commit' | 'branch' | null>(null)
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState(false)
  const [branching, setBranching] = useState(false)
  const [branchName, setBranchName] = useState('')

  // "Commit yapıldı" bilgisi kısa süre görünür.
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  if (!status) return error ? <p className="px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-danger">{error}</p> : null
  if (status.blocked.length > 0) {
    return (
      <div className="px-2 pb-3">
        <Notice tone="warn">{g.blocked(status.blocked.join(', '))}</Notice>
      </div>
    )
  }

  const selectable = status.changes.filter((c) => c.kind !== 'conflict')
  const isPicked = (c: GitChange): boolean => c.kind !== 'conflict' && (picked[c.path] ?? !c.secret)
  const selected = status.changes.filter(isPicked).map((c) => c.path)
  const plain = selectable.filter((c) => !c.secret)
  const allPicked = plain.length > 0 && plain.every(isPicked)
  const canCommit = selected.length > 0 && message.trim() !== '' && !status.busy && status.branch !== null && working === null

  const run = async (kind: NonNullable<typeof working>, action: () => Promise<void>): Promise<void> => {
    setWorking(kind)
    setProblem('')
    setDone(false)
    try {
      await action()
    } catch (e) {
      setProblem(errorText(e))
    } finally {
      setWorking(null)
    }
  }
  const suggest = (): Promise<void> =>
    run('suggest', async () => {
      const text = await window.api.git.suggest(folderId, selected, conversationId)
      if (text) setMessage(text)
    })
  const commit = (): Promise<void> =>
    run('commit', async () => {
      git.setStatus(await window.api.git.commit(folderId, selected, message))
      setMessage('')
      setPicked({})
      setDone(true)
      // Açık fark görünümü de yenilensin.
      bumpGit()
    })
  const createBranch = (): Promise<void> =>
    run('branch', async () => {
      git.setStatus(await window.api.git.createBranch(folderId, branchName))
      setBranching(false)
      setBranchName('')
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pb-2">
        <div className="flex items-center gap-1.5 text-[13px]">
          <GitBranch size={13} className="shrink-0 text-ink-3" aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate font-medium', status.branch ? 'text-ink' : 'text-warn')} title={status.branch ?? g.noBranch}>
            {status.branch ?? g.noBranch}
          </span>
          <IconButton label={g.newBranch} aria-expanded={branching} onClick={() => setBranching((v) => !v)} className="h-7 w-7">
            <GitBranchPlus size={14} aria-hidden />
          </IconButton>
        </div>
        {branching && (
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              void createBranch()
            }}
          >
            <input
              autoFocus
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                e.stopPropagation()
                setBranching(false)
              }}
              placeholder={g.newBranchPlaceholder}
              aria-label={g.newBranch}
              spellCheck={false}
              className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <Button type="submit" size="sm" busy={working === 'branch'} disabled={!branchName.trim() || working !== null} className="h-7 px-2 text-xs">
              {g.createBranch}
            </Button>
          </form>
        )}
        {status.initial && <p className="mt-1 text-xs leading-snug text-ink-3">{g.initial}</p>}
        {!!status.ahead && <p className="mt-1 text-xs leading-snug text-ink-3">{g.ahead(status.ahead)}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {status.changes.length === 0 ? (
          <p className="px-1.5 py-1 text-[13px] leading-relaxed text-ink-3">{g.clean}</p>
        ) : (
          <>
            <label className="flex h-6 items-center gap-1.5 px-1.5 text-xs text-ink-3">
              <input
                type="checkbox"
                checked={allPicked}
                disabled={plain.length === 0}
                aria-label={g.selectAll}
                title={g.selectAll}
                onChange={(e) => setPicked(Object.fromEntries(selectable.map((c) => [c.path, e.target.checked && !c.secret])))}
              />
              {g.changesCount(status.changes.length + status.more)}
            </label>
            <ul>
              {status.changes.map((change) => {
                const name = change.path.slice(change.path.lastIndexOf('/') + 1)
                const dir = change.path.slice(0, Math.max(0, change.path.length - name.length - 1))
                return (
                  <li
                    key={change.path}
                    className={cn('flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors', active === change.path ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked(change)}
                      disabled={change.kind === 'conflict'}
                      aria-label={g.select(change.path)}
                      onChange={(e) => setPicked((all) => ({ ...all, [change.path]: e.target.checked }))}
                    />
                    <button
                      type="button"
                      title={`${change.path} (${g.kinds[change.kind]})`}
                      onClick={() => openCodeFile({ folderId, path: change.path, diff: true })}
                      className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <span aria-hidden className={cn('w-3 shrink-0 text-center font-mono font-semibold', KIND_COLOR[change.kind])}>
                        {KIND_MARK[change.kind]}
                      </span>
                      <span className={cn('truncate', change.kind === 'deleted' ? 'text-ink-3 line-through' : 'text-ink-2')}>{name}</span>
                      {dir && <span className="min-w-0 shrink-[4] truncate text-xs text-ink-3">{dir}</span>}
                      <span className="sr-only">{g.kinds[change.kind]}</span>
                    </button>
                    {change.secret && (
                      <span title={g.secret} className="shrink-0">
                        <FileLock2 size={12} className="text-warn" aria-label={g.secret} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            {status.more > 0 && <p className="px-1.5 pt-1 text-xs text-ink-3">{g.more(status.more)}</p>}
          </>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-line p-2">
        {status.busy && <p className="text-xs leading-snug text-warn">{g.busy}</p>}
        {status.branch === null && !status.busy && <p className="text-xs leading-snug text-warn">{g.detachedHint}</p>}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) void commit()
          }}
          rows={3}
          placeholder={g.messagePlaceholder}
          aria-label={g.messagePlaceholder}
          className="block w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] leading-snug text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1.5 max-[1180px]:flex-col">
          <Button size="sm" busy={working === 'suggest'} disabled={selected.length === 0 || working !== null} onClick={() => void suggest()} title={g.suggestHint} className="min-w-0 flex-1 px-2">
            {working !== 'suggest' && <Sparkles size={13} aria-hidden />}
            {g.suggest}
          </Button>
          <Button size="sm" variant="primary" busy={working === 'commit'} disabled={!canCommit} onClick={() => void commit()} className="shrink-0 px-2.5">
            {g.commit(selected.length)}
          </Button>
        </div>
        {status.hooks.length > 0 && <p className="text-[11.5px] leading-snug text-ink-3">{g.hooks(status.hooks.join(', '))}</p>}
        {problem && (
          <p role="alert" className="max-h-32 overflow-auto text-xs leading-snug break-words whitespace-pre-wrap text-danger">
            {problem}
          </p>
        )}
        {done && !problem && (
          <p role="status" className="text-xs text-teal">
            {g.committed}
          </p>
        )}
      </div>
    </div>
  )
}

/** Değişen bir dosyanın son commit'e göre farkı; dosya buradan son commit'teki haline döndürülebilir. */
export function GitDiffViewer({ folderId, path }: { folderId: string; path: string }) {
  const t = useT()
  const g = t.chat.git
  const c = t.chat.codeArea
  const openCodeFile = useApp((s) => s.openCodeFile)
  const bumpGit = useApp((s) => s.bumpGit)
  const gitTick = useApp((s) => s.gitTick)
  const activity = useActivity()
  const [diff, setDiff] = useState<GitFileDiff | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.git.diff(folderId, path).then(
      (loaded) => {
        if (cancelled) return
        setDiff(loaded)
        setError('')
      },
      (e) => {
        if (cancelled) return
        setDiff(null)
        setError(errorText(e))
      }
    )
    return () => {
      cancelled = true
    }
  }, [folderId, path, tick, gitTick, activity])

  useEffect(() => setConfirming(false), [folderId, path])

  const unchanged = diff !== null && !diff.note && diff.before === diff.after
  const isNew = diff !== null && !diff.note && diff.before === null
  const isDeleted = diff !== null && !diff.note && diff.after === null && diff.before !== null
  const kind = !diff || diff.note || unchanged ? '' : isNew ? g.kinds.added : isDeleted ? g.kinds.deleted : g.kinds.modified

  const discard = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.git.discard(folderId, path)
      bumpGit()
      openCodeFile(null)
    } catch (e) {
      setError(errorText(e))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside aria-label={g.diffLabel} className="flex w-[44%] max-w-[820px] min-w-[232px] flex-col border-l border-line bg-bg">
      <header className="drag flex h-10 shrink-0 items-center gap-2 pr-[150px] pl-4">
        <FileDiff size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[13px] text-ink" title={path}>
          {path}
        </span>
      </header>
      <div className="flex min-h-[45px] shrink-0 items-center gap-1 border-y border-line bg-surface px-3 py-1.5">
        {confirming ? (
          <>
            <span className="min-w-0 flex-1 text-xs leading-snug text-ink-2">{isNew ? g.discardConfirmNew : g.discardConfirm}</span>
            <Button size="sm" variant="danger" busy={busy} onClick={() => void discard()}>
              {g.discard}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              {t.common.actions.cancel}
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{kind}</span>
            <Button size="sm" variant="ghost" disabled={!diff || unchanged} onClick={() => setConfirming(true)} title={g.discardHint}>
              <Undo2 size={14} aria-hidden />
              {g.discard}
            </Button>
            {diff !== null && diff.after !== null && (
              <IconButton label={c.menuView} onClick={() => openCodeFile({ folderId, path })}>
                <File size={14} aria-hidden />
              </IconButton>
            )}
            <IconButton label={c.refresh} onClick={() => setTick((n) => n + 1)}>
              <RefreshCw size={14} aria-hidden />
            </IconButton>
            <IconButton label={g.closeDiff} onClick={() => openCodeFile(null)}>
              <X size={16} aria-hidden />
            </IconButton>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="p-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {diff?.note && (
          <div className="p-3">
            <Notice tone="warn">{diff.note}</Notice>
          </div>
        )}
        {unchanged && <p className="p-4 text-[13px] text-ink-3">{g.noDiff}</p>}
        {diff && !diff.note && !unchanged && <Diff before={diff.before} after={diff.after ?? ''} fill />}
      </div>
    </aside>
  )
}
