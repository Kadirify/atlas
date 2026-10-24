import { Check, ChevronDown, ChevronRight, Database, KeyRound, Pencil, Play, Plus, ShieldAlert, Table2, Trash2, X, Eye, Cog, Sigma, Zap, Clock, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SQL_ENGINES, type SqlApproval, type SqlConnection, type SqlConnectionInput, type SqlEngine, type SqlObjectType, type SqlResult, type SqlTable } from '@shared/types'
import { Button, Field, IconButton, Input, Notice } from '@/components/ui'
import { fold } from '@/lib/fold'
import { toDelimited } from '@shared/delimited'
import { useCopy } from '@/components/Markdown'
import { cn, errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'
import { subscribeSql, useSql } from '@/stores/sql'

/** Açık sohbete (ya da henüz başlamamış yeni sohbete) bağlı veritabanı bağlantısının kimliği */
function useSqlId(): string | null {
  return useApp((s) => s.conversations.find((c) => c.id === s.activeId)?.sqlId ?? (s.activeId ? null : s.draft.sqlId))
}

/** Sohbet başlığındaki veritabanı düğmesi: bağlantı seçme, ekleme, düzenleme ve tabloları açma. */
export function SqlMenu({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const q = t.chat.sql
  const connections = useSql((s) => s.connections)
  const load = useSql((s) => s.load)
  const setPane = useSql((s) => s.setPane)
  const attachSql = useApp((s) => s.attachSql)
  const sqlId = useSqlId()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ editing: SqlConnection | null } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const current = connections.find((c) => c.id === sqlId)

  useEffect(() => {
    subscribeSql()
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    // Menü her açılışta güncel bağlantı listesini okur.
    void load()
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, load])

  const item = 'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2'

  return (
    <div ref={root} className={cn('relative', compact ? 'shrink-0' : 'min-w-0 shrink')}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? q.connected(current.name) : q.connect}
        aria-label={current ? q.connected(current.name) : q.connect}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-8 max-w-[200px] min-w-0 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors hover:bg-surface-2',
          current ? 'text-accent' : 'text-ink-2 hover:text-ink'
        )}
      >
        <Database size={15} className="shrink-0" aria-hidden />
        {/* Başlık darken (yan panel açık, küçük pencere) yalnızca simge gösterilir. */}
        {!compact && <span className="truncate">{current ? current.name : q.connect}</span>}
        {!compact && <ChevronDown size={13} className="shrink-0 opacity-70" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute top-9 left-0 z-30 w-[300px] rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {connections.length === 0 && <p className="px-2.5 py-2 text-[13px] leading-relaxed text-ink-3">{q.none}</p>}
          {connections.map((c) => (
            <div key={c.id} className="group flex items-center">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={c.id === sqlId}
                className={cn(item, 'min-w-0 flex-1')}
                onClick={() => {
                  // Seçili bağlantıya yeniden tıklamak onu sohbetten ayırır; panel de kapanır.
                  const detach = c.id === sqlId
                  void attachSql(detach ? null : c.id)
                  setPane(!detach)
                  setOpen(false)
                }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-accent">{c.id === sqlId && <Check size={14} aria-hidden />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {c.engine === 'sqlite' ? `SQLite, ${c.file}` : `${ENGINE_LABEL[c.engine]}, ${c.host}${c.database ? ` / ${c.database}` : ''}`}
                  </span>
                </span>
              </button>
              <IconButton label={q.edit(c.name)} onClick={() => (setForm({ editing: c }), setOpen(false))}>
                <Pencil size={13} aria-hidden />
              </IconButton>
            </div>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            {current && (
              <button type="button" role="menuitem" className={cn(item, 'text-ink-2')} onClick={() => (setPane(true), setOpen(false))}>
                <Table2 size={14} aria-hidden />
                {q.showTables}
              </button>
            )}
            <button type="button" role="menuitem" className={cn(item, 'text-ink-2')} onClick={() => (setForm({ editing: null }), setOpen(false))}>
              <Plus size={14} aria-hidden />
              {q.add}
            </button>
          </div>
          <p className="px-2.5 pt-1.5 pb-1 text-xs leading-relaxed text-ink-3">{q.rules}</p>
        </div>
      )}
      {form && (
        <ConnectionForm
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            void load()
            void attachSql(saved.id)
            setPane(true)
            setForm(null)
          }}
          onRemoved={(id) => {
            void load()
            if (id === sqlId) {
              void attachSql(null)
              setPane(false)
            }
            setForm(null)
          }}
        />
      )}
    </div>
  )
}

function ConnectionForm({
  editing,
  onClose,
  onSaved,
  onRemoved
}: {
  editing: SqlConnection | null
  onClose(): void
  onSaved(c: SqlConnection): void
  onRemoved(id: string): void
}) {
  const t = useT()
  const q = t.chat.sql
  const [engine, setEngine] = useState<SqlEngine>(editing?.engine ?? 'mssql')
  const [name, setName] = useState(editing?.name ?? '')
  const [host, setHost] = useState(editing?.host ?? '')
  const [port, setPort] = useState(String(editing?.port || PORTS[editing?.engine ?? 'mssql']))
  const [database, setDatabase] = useState(editing?.database ?? '')
  const [user, setUser] = useState(editing?.user ?? '')
  const [password, setPassword] = useState('')
  const [trustCert, setTrustCert] = useState(editing?.trustCert ?? true)
  const [encrypt, setEncrypt] = useState(editing?.encrypt ?? false)
  const [file, setFile] = useState(editing?.file ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** Silme iki adımlıdır: kayıtlı parola da gider, geri alınamaz. */
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(): Promise<void> {
    setBusy(true)
    setError('')
    const input: SqlConnectionInput = { name, engine, host, port: Number(port) || PORTS[engine], database, user, password: password || undefined, encrypt, trustCert, file }
    let createdId: string | null = null
    try {
      const saved = await window.api.sql.save(input, editing?.id)
      if (!editing) createdId = saved.id
      // Kaydedilen bağlantı hemen denenir; bağlanamıyorsa form açık kalır ve neden gösterilir.
      await window.api.sql.test(saved.id)
      onSaved(saved)
    } catch (e) {
      setError(errorText(e))
      // Yeni bağlantı bağlanamadıysa yarım kayıt bırakılmaz. Yalnızca az önce kaydedilen silinir
      // (ada göre aranırsa aynı adlı eski bir bağlantı silinebilirdi).
      if (createdId) await window.api.sql.remove(createdId).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="no-drag fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? q.formEdit : q.formNew}
        className="flex max-h-full w-[460px] max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{editing ? q.formEdit : q.formNew}</h2>
          <IconButton label={q.cancel} onClick={onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        <div className="space-y-3.5 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label={q.engine} className="flex rounded-lg bg-surface-2 p-0.5">
            {SQL_ENGINES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={engine === value}
                onClick={() => {
                  // Port elle değiştirilmediyse yeni türün varsayılanına geçer.
                  if (Object.values(PORTS).includes(Number(port))) setPort(String(PORTS[value] || ''))
                  setEngine(value)
                }}
                className={cn('h-8 flex-1 rounded-md text-[13px] font-medium transition-colors', engine === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}
              >
                {ENGINE_LABEL[value]}
              </button>
            ))}
          </div>
          <Field label={q.name} hint={q.nameHint}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          {engine !== 'sqlite' ? (
            <>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <Field label={q.host} hint={q.hostHint}>
                    <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" />
                  </Field>
                </div>
                <div className="w-[96px]">
                  <Field label={q.port}>
                    <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                  </Field>
                </div>
              </div>
              <Field label={q.database} hint={q.databaseHint}>
                <Input value={database} onChange={(e) => setDatabase(e.target.value)} />
              </Field>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <Field label={q.user}>
                    <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                <div className="min-w-0 flex-1">
                  <Field label={q.password}>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing?.hasPassword ? q.passwordKept : ''} autoComplete="new-password" />
                  </Field>
                </div>
              </div>
              {engine !== 'mssql' && (
                <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
                  <input type="checkbox" className="mt-0.5" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
                  <span>{q.ssl}</span>
                </label>
              )}
              <label className={cn('flex items-start gap-2.5 text-[13px] text-ink-2', engine !== 'mssql' && !encrypt && 'hidden')}>
                <input type="checkbox" className="mt-0.5" checked={trustCert} onChange={(e) => setTrustCert(e.target.checked)} />
                <span>{q.trustCert}</span>
              </label>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
                <KeyRound size={13} className="mt-0.5 shrink-0" aria-hidden />
                {q.passwordNote}
              </p>
            </>
          ) : (
            <Field label={q.file}>
              <div className="flex gap-2">
                <Input value={file} onChange={(e) => setFile(e.target.value)} className="min-w-0 flex-1" />
                <Button variant="secondary" onClick={() => void window.api.sql.pickFile().then((picked) => picked && setFile(picked))}>
                  {q.browse}
                </Button>
              </div>
            </Field>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">
          {editing &&
            (confirmRemove ? (
              <span className="flex min-w-0 items-center gap-2" role="alert">
                <span className="text-[13px] text-danger">{q.removeConfirm}</span>
                <Button
                  variant="ghost"
                  className="shrink-0 text-danger"
                  onClick={() => void window.api.sql.remove(editing.id).then(() => onRemoved(editing.id), (e) => setError(errorText(e)))}
                >
                  {t.common.actions.yesDelete}
                </Button>
                <Button variant="ghost" className="shrink-0" onClick={() => setConfirmRemove(false)}>
                  {t.common.actions.cancel}
                </Button>
              </span>
            ) : (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmRemove(true)}>
                <Trash2 size={14} aria-hidden />
                {q.remove}
              </Button>
            ))}
          <div className={cn('ml-auto flex gap-2', confirmRemove && 'hidden')}>
            <Button variant="ghost" onClick={onClose}>
              {q.cancel}
            </Button>
            <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
              {busy ? q.connecting : q.saveAndConnect}
            </Button>
          </div>
        </footer>
      </form>
    </div>,
    document.body
  )
}

/** Atlas'ın veriyi ya da yapıyı değiştiren bir sorgu için beklediği onay kartları. */
export function SqlApprovals({ conversationId }: { conversationId: string | null }) {
  const approvals = useSql((s) => (conversationId ? s.approvals[conversationId] : undefined))
  if (!approvals || approvals.length === 0) return null
  return (
    <>
      {approvals.map((approval) => (
        <SqlApprovalCard key={approval.id} approval={approval} />
      ))}
    </>
  )
}

function SqlApprovalCard({ approval }: { approval: SqlApproval }) {
  const t = useT()
  const q = t.chat.sql
  const respond = useSql((s) => s.respond)
  // SET ve INTO tek başına bir işlem değildir; kartta yalnızca asıl işlem gösterilir.
  const shownKeywords = approval.keywords.filter((keyword) => keyword !== 'SET' && keyword !== 'INTO')
  return (
    <div className="mx-auto w-full max-w-[780px] px-6 py-2">
      <div role="group" aria-label={q.approvalTitle} className="overflow-hidden rounded-xl border border-warn/50 bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent" data-approval tabIndex={-1}>
        <div className="flex items-center gap-2 bg-warn-soft px-4 py-2.5">
          <ShieldAlert size={16} className="shrink-0 text-warn" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{q.approvalTitle}</p>
          <span className="truncate text-xs text-ink-2">{approval.connectionName}</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink-2">{q.approvalBody}</p>
          <pre className="mt-2.5 max-h-[240px] overflow-auto rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {approval.sql}
          </pre>
          {shownKeywords.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              {q.approvalDoes}
              {shownKeywords.map((keyword) => (
                <span key={keyword} className="rounded-md bg-warn-soft px-1.5 py-0.5 font-mono font-medium text-warn">
                  {keyword}
                </span>
              ))}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void respond(approval, true)}>
              <Check size={14} aria-hidden />
              {q.approve}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void respond(approval, false)}>
              {q.decline}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const OBJECT_ICONS: Record<SqlObjectType, LucideIcon> = { table: Table2, view: Eye, procedure: Cog, function: Sigma, trigger: Zap, job: Clock }

const ENGINE_LABEL: Record<SqlEngine, string> = { mssql: 'SQL Server', postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite' }
const PORTS: Record<SqlEngine, number> = { mssql: 1433, postgres: 5432, mysql: 3306, sqlite: 0 }

/** Tablonun ilk 100 satırını getiren sorgu; adlar veritabanı türüne göre tırnaklanır. */
function peekQuery(connection: SqlConnection, table: SqlTable): string {
  if (connection.engine === 'mssql') {
    const name = `${table.schema ? `[${table.schema.replace(/]/g, ']]')}].` : ''}[${table.name.replace(/]/g, ']]')}]`
    return `SELECT TOP 100 * FROM ${name}`
  }
  const q = connection.engine === 'mysql' ? '`' : '"'
  const wrap = (part: string): string => q + part.split(q).join(q + q) + q
  return `SELECT * FROM ${table.schema ? `${wrap(table.schema)}.` : ''}${wrap(table.name)} LIMIT 100`
}

/** Veritabanı paneli: tablolar, sütunlar, verilere göz atma ve salt okunur sorgu çalıştırma. */
export function SqlPane() {
  const t = useT()
  const q = t.chat.sql
  const sqlId = useSqlId()
  const connection = useSql((s) => s.connections.find((c) => c.id === sqlId))
  const setPane = useSql((s) => s.setPane)
  const activeId = useApp((s) => s.activeId)
  const last = useSql((s) => (activeId ? s.last[activeId] : undefined))
  const [tables, setTables] = useState<SqlTable[] | null>(null)
  const [schemaError, setSchemaError] = useState('')
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<{ sql: string; result: SqlResult } | null>(null)
  const language = useApp((s) => s.settings?.language)
  const [copiedResult, copyResult] = useCopy()
  const [savedCsv, setSavedCsv] = useState(false)

  /** Görünen sonucu CSV dosyasına kaydeder (Türkçede Excel'in beklediği gibi noktalı virgülle). */
  async function saveCsv(): Promise<void> {
    if (!result) return
    try {
      if (await window.api.sql.exportCsv(result.result.columns, result.result.rows)) {
        setSavedCsv(true)
        setTimeout(() => setSavedCsv(false), 2000)
      }
    } catch (e) {
      setError(errorText(e))
    }
  }
  /** Seçilen nesnenin kaynak kodu (görünüm, yordam, işlev, tetikleyici, iş) */
  const [code, setCode] = useState<{ title: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTables(null)
    setSchemaError('')
    setResult(null)
    setError('')
    if (!sqlId) return
    let cancelled = false
    window.api.sql.schema(sqlId).then(
      (found) => !cancelled && setTables(found),
      (e) => !cancelled && setSchemaError(errorText(e))
    )
    return () => {
      cancelled = true
    }
  }, [sqlId])

  // Atlas bir sorgu çalıştırınca sonucu panelde de görünür.
  useEffect(() => {
    if (last) {
      setCode(null)
      setResult(last)
      setError('')
    }
  }, [last])

  const shown = useMemo(() => {
    const needle = fold(filter.trim())
    const order: SqlObjectType[] = ['table', 'view', 'procedure', 'function', 'trigger', 'job']
    return (tables ?? [])
      .filter((table) => !needle || fold(`${table.schema}.${table.name}`).includes(needle))
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  }, [tables, filter])

  async function run(text: string): Promise<void> {
    if (!sqlId || !text.trim() || busy) return
    setBusy(true)
    setError('')
    setCode(null)
    try {
      setResult({ sql: text, result: await window.api.sql.run(sqlId, text) })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!connection) return null
  const key = (table: SqlTable): string => `${table.type}:${table.schema}.${table.name}`

  async function showCode(table: SqlTable): Promise<void> {
    if (!sqlId || busy) return
    setBusy(true)
    setError('')
    try {
      const text = await window.api.sql.definition(sqlId, { schema: table.schema, name: table.name, type: table.type })
      setCode({ title: `${table.schema ? `${table.schema}.` : ''}${table.name}`, text: text || q.noCode })
      setResult(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside aria-label={q.paneLabel} className="flex w-[44%] max-w-[820px] min-w-[232px] flex-col border-l border-line bg-bg">
      <header className="drag flex h-10 shrink-0 items-center gap-2 pr-[150px] pl-4">
        <Database size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 truncate text-[13px] font-medium text-ink">{connection.name}</span>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-y border-line bg-surface px-3 py-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={q.filter}
          aria-label={q.filter}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <span className="shrink-0 text-xs text-ink-3 tabular-nums">{tables ? q.tableCount(shown.length) : ''}</span>
        <IconButton label={q.closePane} onClick={() => setPane(false)}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>

      <div className="max-h-[38%] min-h-[120px] shrink-0 overflow-y-auto border-b border-line px-2 py-1.5">
        {schemaError && <Notice tone="danger">{schemaError}</Notice>}
        {!tables && !schemaError && <p className="px-2 py-2 text-[13px] text-ink-3">{q.loading}</p>}
        {tables && shown.length === 0 && <p className="px-2 py-2 text-[13px] text-ink-3">{q.noTables}</p>}
        {shown.map((table, index) => {
          const open = expanded === key(table)
          const Icon = OBJECT_ICONS[table.type]
          const heading = index === 0 || shown[index - 1].type !== table.type
          const data = table.type === 'table' || table.type === 'view'
          return (
            <div key={key(table)}>
              {heading && (
                <p className="mt-1.5 mb-0.5 px-1.5 text-[11px] font-semibold tracking-wide text-ink-3">
                  {q.kinds[table.type]} ({shown.filter((x) => x.type === table.type).length})
                </p>
              )}
              <div className="group flex items-center">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : key(table))}
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] text-ink hover:bg-surface-2"
                >
                  {open ? <ChevronDown size={13} className="shrink-0 text-ink-3" aria-hidden /> : <ChevronRight size={13} className="shrink-0 text-ink-3" aria-hidden />}
                  <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate">
                    {table.schema && table.schema !== 'dbo' ? `${table.schema}.` : ''}
                    {table.name}
                  </span>
                  {table.parent && <span className="min-w-0 shrink truncate text-xs text-ink-3">{table.parent}</span>}
                </button>
                {data && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(peekQuery(connection, table))}>
                    {q.peek}
                  </Button>
                )}
                {table.type !== 'table' && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void showCode(table)}>
                    {q.showCode}
                  </Button>
                )}
              </div>
              {open && table.columns.length > 0 && (
                <ul className="mb-1 ml-8 border-l border-line pl-3">
                  {table.columns.map((column) => (
                    <li key={column.name} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <span className={cn('truncate', column.key ? 'font-medium text-ink' : 'text-ink-2')}>{column.name}</span>
                      {column.key && <KeyRound size={11} className="shrink-0 text-accent" aria-label={q.key} />}
                      <span className="ml-auto shrink-0 font-mono text-xs text-ink-3">
                        {column.type}
                        {column.nullable ? '' : ' *'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="shrink-0 border-b border-line bg-surface px-3 py-2.5">
        <div className="flex gap-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void run(sql)
              }
            }}
            rows={2}
            spellCheck={false}
            placeholder={q.queryPlaceholder}
            aria-label={q.queryPlaceholder}
            className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
          <Button variant="primary" disabled={busy || !sql.trim()} onClick={() => void run(sql)} title={q.runHint}>
            <Play size={14} aria-hidden />
            {q.run}
          </Button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{q.readOnlyNote}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="p-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {busy && <p className="p-3 text-[13px] text-ink-3">{q.running}</p>}
        {!busy && !error && code && (
          <>
            <p className="sticky top-0 left-0 z-10 border-b border-line bg-bg px-3 py-1.5 font-mono text-xs text-ink-2">{code.title}</p>
            <pre className="px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">{code.text}</pre>
          </>
        )}
        {!busy && !error && !result && !code && <p className="p-3 text-[13px] leading-relaxed text-ink-3">{q.empty}</p>}
        {!busy && !error && result && (
          <>
            <div className="sticky top-0 left-0 z-10 flex items-center gap-2 border-b border-line bg-bg px-3 py-1.5 text-xs text-ink-3 tabular-nums">
              <span className="shrink-0">{q.resultInfo(result.result.rowCount, result.result.truncated, result.result.ms)}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-2">{result.sql.replace(/\s+/g, ' ').slice(0, 120)}</span>
              {result.result.rows.length > 0 && (
                <>
                  {/* Sekmeyle ayrılmış metin Excel'e yapıştırılınca sütunlara oturur. */}
                  <button
                    type="button"
                    className="shrink-0 rounded px-1.5 py-0.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
                    onClick={() => copyResult(toDelimited(result.result.columns, result.result.rows, '\t', language === 'tr'))}
                  >
                    {copiedResult ? q.copiedResult : q.copyResult}
                  </button>
                  <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => void saveCsv()}>
                    {savedCsv ? q.savedCsv : q.saveCsv}
                  </button>
                </>
              )}
            </div>
            {result.result.rows.length === 0 ? (
              <p className="p-3 text-[13px] text-ink-3">{q.noRows}</p>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    {result.result.columns.map((column, i) => (
                      <th key={i} scope="col" style={{ textAlign: 'left', color: 'var(--ink)', fontWeight: 600 }}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.result.rows.map((row, r) => (
                    <tr key={r}>
                      <th scope="row">{r + 1}</th>
                      {row.map((value, c) => (
                        <td key={c} style={{ textAlign: typeof value === 'number' ? 'right' : 'left', maxWidth: 320 }} title={value === null ? undefined : String(value)}>
                          {value === null ? <span className="text-ink-3 italic">NULL</span> : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
