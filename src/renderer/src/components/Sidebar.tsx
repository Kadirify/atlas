import { CircleAlert, Code2, Ellipsis, EyeOff, LayoutGrid, LockKeyhole, Pencil, Pin, PinOff, Plus, Search, Settings as SettingsIcon, Trash2, X } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { UNTITLED_CONVERSATION, type Conversation, type SearchHit } from '@shared/types'
import { Wordmark } from '@/components/Logo'
import { IconButton } from '@/components/ui'
import { cn, groupConversations } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'
import { useSql } from '@/stores/sql'

function ConversationRow({ conversation, snippet }: { conversation: Conversation; snippet?: string }) {
  const t = useT()
  // Adı konmamış sohbet veritabanında sabit bir işaretle durur; ekranda geçerli dildeki karşılığı görünür.
  const title = conversation.title === UNTITLED_CONVERSATION ? t.common.newChat : conversation.title
  const active = useApp((s) => s.view.name === 'chat' && s.activeId === conversation.id)
  const busy = useApp((s) => s.streaming[conversation.id] !== undefined)
  // Arka plandaki bir sohbette onay bekleyen işlem varsa cevap orada durur; satırda görünsün.
  const fileWaiting = useApp((s) => (s.approvals[conversation.id]?.length ?? 0) > 0)
  const sqlWaiting = useSql((s) => (s.approvals[conversation.id]?.length ?? 0) > 0)
  const waiting = fileWaiting || sqlWaiting
  const select = useApp((s) => s.select)
  const rename = useApp((s) => s.rename)
  const setPinned = useApp((s) => s.setPinned)
  const remove = useApp((s) => s.remove)

  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => {
      if (!rowRef.current?.contains(e.target as Node)) {
        setMenu(false)
        setConfirmDelete(false)
      }
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const commitRename = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) void rename(conversation.id, next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename()
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        aria-label={t.chat.sidebar.titleLabel}
        className="h-9 w-full rounded-lg border border-accent bg-surface px-2.5 text-sm text-ink outline-none"
      />
    )
  }

  const menuItem = 'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] hover:bg-surface-2'

  return (
    <div ref={rowRef} className="group relative">
      <button
        type="button"
        onClick={() => void select(conversation.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex w-full flex-col rounded-lg py-2 pr-9 pl-2.5 text-left transition-colors',
          active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
        )}
      >
        <span className="flex items-center gap-2">
          {waiting ? (
            <span role="img" aria-label={t.chat.sidebar.waitingApproval} title={t.chat.sidebar.waitingApproval} className="flex shrink-0 text-warn">
              <CircleAlert size={13} aria-hidden />
            </span>
          ) : (
            busy && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" role="img" aria-label={t.chat.sidebar.answering} />
          )}
          {conversation.private && <EyeOff size={13} className="shrink-0 text-ink-3" aria-label={t.chat.sidebar.privateChat} />}
          <span className={cn('truncate text-sm', active && 'font-medium')}>{title}</span>
        </span>
        {snippet && <span className="mt-0.5 truncate text-xs text-ink-3">{snippet}</span>}
      </button>

      <button
        type="button"
        aria-label={t.chat.sidebar.optionsFor(title)}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className={cn(
          'absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface hover:text-ink',
          menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        )}
      >
        <Ellipsis size={16} aria-hidden />
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute top-9 right-1 z-20 w-48 rounded-xl border border-line bg-surface p-1 text-ink shadow-pop"
        >
          {confirmDelete ? (
            <>
              <p className="px-2.5 py-1.5 text-[13px] text-ink-2">{t.chat.sidebar.confirmDelete}</p>
              <button
                role="menuitem"
                className={cn(menuItem, 'text-danger')}
                onClick={() => void remove(conversation.id)}
              >
                <Trash2 size={14} aria-hidden />
                {t.common.actions.yesDelete}
              </button>
              <button role="menuitem" className={menuItem} onClick={() => setConfirmDelete(false)}>
                <X size={14} aria-hidden />
                {t.common.actions.cancel}
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setMenu(false)
                  void setPinned(conversation.id, !conversation.pinned)
                }}
              >
                {conversation.pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
                {conversation.pinned ? t.chat.sidebar.unpin : t.chat.sidebar.pin}
              </button>
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setMenu(false)
                  setDraft(title)
                  setEditing(true)
                }}
              >
                <Pencil size={14} aria-hidden />
                {t.chat.sidebar.rename}
              </button>
              <button role="menuitem" className={cn(menuItem, 'text-danger')} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden />
                {t.common.actions.delete}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const Sidebar = forwardRef<HTMLInputElement, { onOpenSettings(): void }>(function Sidebar({ onOpenSettings }, searchRef) {
  const t = useT()
  const conversations = useApp((s) => s.conversations)
  const select = useApp((s) => s.select)
  const userName = useApp((s) => s.settings?.userName ?? '')
  const lockEnabled = useApp((s) => s.lock?.enabled ?? false)
  const go = useApp((s) => s.go)
  const inApps = useApp((s) => ['apps', 'run', 'studio'].includes(s.view.name))
  const inCode = useApp((s) => s.view.name === 'code')

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.conversations.search(q).then(
        (result) => !cancelled && setHits(result),
        () => !cancelled && setHits([])
      )
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, conversations])

  const groups = useMemo(() => groupConversations(conversations), [conversations])
  const byId = useMemo(() => new Map(conversations.map((c) => [c.id, c])), [conversations])

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-bg max-[1180px]:w-[236px] max-[900px]:w-[200px]">
      <div className="drag flex h-10 shrink-0 items-center px-4">
        <Wordmark size={21} />
      </div>

      <div className="space-y-2 px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={() => void select(null)}
          className="flex h-10 w-full items-center gap-2.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          <Plus size={17} aria-hidden />
          {t.common.newChat}
          <kbd className="ml-auto font-sans text-xs opacity-70">Ctrl N</kbd>
        </button>
        <button
          type="button"
          onClick={() => go({ name: 'apps' })}
          aria-current={inApps ? 'page' : undefined}
          className={cn(
            'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
            inApps ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          )}
        >
          <LayoutGrid size={16} aria-hidden />
          {t.chat.sidebar.apps}
        </button>
        <button
          type="button"
          onClick={() => go({ name: 'code' })}
          aria-current={inCode ? 'page' : undefined}
          className={cn(
            'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
            inCode ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          )}
        >
          <Code2 size={16} aria-hidden />
          {t.chat.sidebar.code}
        </button>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              setQuery('')
            }}
            placeholder={t.chat.sidebar.search}
            aria-label={t.chat.sidebar.search}
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t.chat.sidebar.conversations}>
        {hits !== null ? (
          hits.length === 0 ? (
            <p className="px-2.5 py-3 text-[13px] text-ink-3">{t.chat.sidebar.noResults(query.trim())}</p>
          ) : (
            <div className="space-y-0.5">
              {hits.map((hit) => {
                const conversation = byId.get(hit.conversationId)
                return conversation ? (
                  <ConversationRow key={hit.conversationId} conversation={conversation} snippet={hit.snippet} />
                ) : null
              })}
            </div>
          )
        ) : groups.length === 0 ? (
          <p className="px-2.5 py-3 text-[13px] leading-relaxed text-ink-3">{t.chat.sidebar.empty}</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-4">
              <h2 className="px-2.5 pb-1.5 text-xs font-medium text-ink-3">{group.label}</h2>
              <div className="space-y-0.5">
                {group.items.map((c) => (
                  <ConversationRow key={c.id} conversation={c} />
                ))}
              </div>
            </section>
          ))
        )}
      </nav>

      <div className="flex items-center gap-1 border-t border-line p-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <SettingsIcon size={16} aria-hidden />
          <span>{t.chat.sidebar.settings}</span>
          {userName && <span className="ml-auto truncate text-[13px] text-ink-3">{userName}</span>}
        </button>
        {lockEnabled && (
          <IconButton label={`${t.settings.desktop.lockNow} (Ctrl+L)`} onClick={() => void window.api.lock.lock()} className="h-10 w-10">
            <LockKeyhole size={16} aria-hidden />
          </IconButton>
        )}
      </div>
    </aside>
  )
})

export default Sidebar
