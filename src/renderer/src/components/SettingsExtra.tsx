import { CopyPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  MEMORY_CATEGORIES,
  PERSONA_ICONS,
  type FileAction,
  type Folder,
  type FolderCapability,
  type IndexProgress,
  type Level,
  type Memory,
  type MemoryCategory,
  type MemoryStatus,
  type Persona,
  type PersonaDraft,
  type PullProgress
} from '@shared/types'
import { Select } from '@/components/AppParts'
import { PersonaAvatar } from '@/components/PersonaParts'
import { Button, CheckCard, Field, IconButton, Input, Notice, ProgressBar, Textarea } from '@/components/ui'
import { cn, errorText, formatBytes, formatDay } from '@/lib/format'
import { useLocale, useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

// --- Kişilikler ---

const EMPTY_PERSONA: PersonaDraft = {
  name: '',
  tagline: '',
  icon: 'smile',
  prompt: '',
  warmth: 1,
  humor: 1,
  length: 1,
  emoji: 0,
  multiMessage: false
}

function Levels({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: Level
  options: [string, string, string]
  onChange(value: Level): void
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-bg p-1">
        {options.map((option, i) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === i}
            onClick={() => onChange(i as Level)}
            className={cn(
              'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
              value === i ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function PersonaEditor({
  initial,
  editId,
  onDone
}: {
  initial: PersonaDraft
  editId?: string
  onDone(): void
}) {
  const t = useT()
  const p = t.settings.personas
  const loadPersonas = useApp((s) => s.loadPersonas)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const patch = (p: Partial<PersonaDraft>): void => setDraft((d) => ({ ...d, ...p }))

  async function save(): Promise<void> {
    setError('')
    setSaving(true)
    try {
      await window.api.personas.save(draft, editId)
      await loadPersonas()
      onDone()
    } catch (e) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-ink">{editId ? p.editTitle : p.newPersona}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label={p.name}>
          <Input value={draft.name} maxLength={40} autoFocus onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label={p.tagline}>
          <Input
            value={draft.tagline}
            maxLength={120}
            placeholder={p.taglinePlaceholder}
            onChange={(e) => patch({ tagline: e.target.value })}
          />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{p.icon}</span>
        <div role="radiogroup" aria-label={p.icon} className="flex flex-wrap gap-2">
          {PERSONA_ICONS.filter((icon) => icon !== 'atlas').map((icon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={draft.icon === icon}
              aria-label={icon}
              onClick={() => patch({ icon })}
              className={cn('rounded-full p-0.5 ring-2 transition-shadow', draft.icon === icon ? 'ring-accent' : 'ring-transparent')}
            >
              <PersonaAvatar icon={icon} size={34} />
            </button>
          ))}
        </div>
      </div>

      <Field label={p.prompt} hint={p.promptHint}>
        <Textarea
          rows={6}
          value={draft.prompt}
          placeholder={p.promptPlaceholder}
          onChange={(e) => patch({ prompt: e.target.value })}
          className="resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Levels label={p.warmth} value={draft.warmth} options={p.warmthLevels} onChange={(warmth) => patch({ warmth })} />
        <Levels label={p.humor} value={draft.humor} options={p.humorLevels} onChange={(humor) => patch({ humor })} />
        <Levels label={p.length} value={draft.length} options={p.lengthLevels} onChange={(length) => patch({ length })} />
        <Levels label={p.emoji} value={draft.emoji} options={p.emojiLevels} onChange={(emoji) => patch({ emoji })} />
      </div>

      <CheckCard
        checked={draft.multiMessage}
        onChange={(multiMessage) => patch({ multiMessage })}
        title={p.multiMessage}
        description={p.multiMessageDescription}
      />

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex gap-3">
        <Button variant="primary" busy={saving} disabled={!draft.name.trim() || !draft.prompt.trim()} onClick={() => void save()}>
          {p.savePersona}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t.common.actions.cancel}
        </Button>
      </div>
    </div>
  )
}

export function PersonasTab({ onClose }: { onClose(): void }) {
  const t = useT()
  const p = t.settings.personas
  const personas = useApp((s) => s.personas)
  const loadPersonas = useApp((s) => s.loadPersonas)
  const go = useApp((s) => s.go)
  const [editing, setEditing] = useState<{ draft: PersonaDraft; id?: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')

  useEffect(() => {
    void loadPersonas()
  }, [loadPersonas])

  if (editing) return <PersonaEditor initial={editing.draft} editId={editing.id} onDone={() => setEditing(null)} />

  const toDraft = ({ name, tagline, icon, prompt, warmth, humor, length, emoji, multiMessage }: Persona): PersonaDraft => ({
    name,
    tagline,
    icon: icon === 'atlas' ? 'smile' : icon,
    prompt,
    warmth,
    humor,
    length,
    emoji,
    multiMessage
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-ink-3">{p.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Button size="sm" variant="primary" onClick={() => setEditing({ draft: EMPTY_PERSONA })}>
            <Plus size={15} aria-hidden />
            {p.newPersona}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose()
              go({ name: 'whatsapp' })
            }}
          >
            {p.addFromWhatsapp}
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line">
        {personas.map((persona) => (
          <li key={persona.id} className="flex items-center gap-3 px-4 py-3">
            <PersonaAvatar icon={persona.icon} letter={persona.whatsapp ? persona.name : undefined} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{persona.name}</p>
              <p className="truncate text-[13px] text-ink-3">{persona.tagline}</p>
            </div>
            {confirmDelete === persona.id ? (
              <>
                <span className="text-[13px] text-ink-2">{t.settings.confirmDelete}</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void window.api.personas.remove(persona.id).then(loadPersonas).then(() => setConfirmDelete(''))}
                >
                  {t.common.actions.yesDelete}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete('')}>
                  {t.common.actions.cancel}
                </Button>
              </>
            ) : persona.builtin ? (
              <IconButton
                label={p.duplicateLabel(persona.name)}
                onClick={() => setEditing({ draft: { ...toDraft(persona), name: p.copyName(persona.name) } })}
              >
                <CopyPlus size={15} aria-hidden />
              </IconButton>
            ) : (
              <>
                {persona.whatsapp && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onClose()
                      go({ name: 'whatsapp', personaId: persona.id })
                    }}
                  >
                    {p.viewStyle}
                  </Button>
                )}
                <IconButton label={p.editLabel(persona.name)} onClick={() => setEditing({ draft: toDraft(persona), id: persona.id })}>
                  <Pencil size={15} aria-hidden />
                </IconButton>
                <IconButton label={p.deleteLabel(persona.name)} onClick={() => setConfirmDelete(persona.id)}>
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Hafıza ---

function MemoryRow({ memory, onChanged }: { memory: Memory; onChanged(): void }) {
  const t = useT()
  const locale = useLocale()
  const m = t.settings.memory
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memory.text)
  const [category, setCategory] = useState(memory.category)

  if (editing) {
    return (
      <li className="space-y-2 px-4 py-3">
        <Input value={text} maxLength={300} autoFocus onChange={(e) => setText(e.target.value)} aria-label={m.textLabel} />
        <div className="flex items-center gap-2">
          <div className="w-36 shrink-0">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as MemoryCategory)}
              aria-label={m.categoryLabel}
              className="h-8 text-[13px]"
            >
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.common.memoryCategory[c]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="primary"
            disabled={!text.trim()}
            onClick={() => void window.api.memory.update(memory.id, text, category).then(() => (setEditing(false), onChanged()))}
          >
            {t.common.actions.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t.common.actions.cancel}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{memory.text}</p>
        <p className="text-xs text-ink-3">
          {m.rowMeta(
            t.common.memoryCategory[memory.category],
            formatDay(memory.createdAt, locale),
            !memory.conversationId
          )}
        </p>
      </div>
      <IconButton label={m.editLabel} onClick={() => setEditing(true)}>
        <Pencil size={14} aria-hidden />
      </IconButton>
      <IconButton label={m.forgetLabel} onClick={() => void window.api.memory.remove(memory.id).then(onChanged)}>
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </li>
  )
}

export function MemoryTab() {
  const t = useT()
  const locale = useLocale()
  const m = t.settings.memory
  const memoryEnabled = useApp((s) => s.settings?.memoryEnabled ?? true)
  const saveSettings = useApp((s) => s.saveSettings)
  const [memories, setMemories] = useState<Memory[]>([])
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [text, setText] = useState('')
  const [category, setCategory] = useState<MemoryCategory>('Kişisel')
  const [confirmClear, setConfirmClear] = useState(false)
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (): Promise<void> => {
    try {
      const [list, s] = await Promise.all([window.api.memory.list(), window.api.memory.status()])
      setMemories(list)
      setStatus(s)
    } catch (e) {
      setError(errorText(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(
    () =>
      window.api.models.onPullProgress((p) => {
        if (p.model === status?.embeddingModel) setProgress(p)
      }),
    [status?.embeddingModel]
  )

  async function add(): Promise<void> {
    setError('')
    try {
      await window.api.memory.add(text, category)
      setText('')
      await refresh()
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function enableSemantic(): Promise<void> {
    setError('')
    setDownloading(true)
    try {
      await window.api.memory.enableSemantic()
    } catch (e) {
      setError(errorText(e))
    }
    setDownloading(false)
    setProgress(null)
    await refresh()
  }

  return (
    <div className="space-y-7">
      <CheckCard
        checked={memoryEnabled}
        onChange={(enabled) => void saveSettings({ memoryEnabled: enabled })}
        title={m.enable}
        description={m.enableDescription}
      />

      {error && <Notice tone="danger">{error}</Notice>}

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{m.knownTitle}</h3>
        <p className="mb-3 text-[13px] text-ink-3">
          {memories.length === 0
            ? m.empty
            : m.count(memories.length)}
        </p>

        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void add()
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              placeholder={m.addPlaceholder}
              aria-label={m.addLabel}
              className="h-9"
            />
          </div>
          <div className="w-32 shrink-0">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as MemoryCategory)}
              aria-label={m.categoryLabel}
              className="h-9 text-[13px]"
            >
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.common.memoryCategory[c]}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" type="submit" disabled={!text.trim()} className="h-9 shrink-0">
            {t.common.actions.add}
          </Button>
        </form>

        {memories.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {memories.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} onChanged={() => void refresh()} />
            ))}
          </ul>
        )}

        {memories.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            {confirmClear ? (
              <>
                <span className="text-[13px] text-ink-2">{m.confirmClear}</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void window.api.memory.clear().then(() => (setConfirmClear(false), refresh()))}
                >
                  {m.yesDeleteAll}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                  {t.common.actions.cancel}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
                {m.clearAll}
              </Button>
            )}
          </div>
        )}
      </section>

      {status && (
        <section className="rounded-xl border border-line px-4 py-3.5">
          <h3 className="text-sm font-semibold text-ink">{m.semanticTitle}</h3>
          {status.semantic ? (
            <p className="mt-0.5 text-[13px] text-teal">{m.semanticOn}</p>
          ) : (
            <>
              <p className="mt-0.5 max-w-[56ch] text-[13px] leading-relaxed text-ink-2">{m.semanticDescription}</p>
              {downloading ? (
                <div className="mt-3 space-y-1.5">
                  <ProgressBar percent={progress?.percent ?? 0} />
                  <p className="text-xs text-ink-3 tabular-nums">
                    {progress && progress.totalBytes > 0
                      ? t.settings.downloadProgress(
                          Math.floor(progress.percent),
                          formatBytes(progress.completedBytes),
                          formatBytes(progress.totalBytes)
                        )
                      : t.settings.connecting}
                  </p>
                </div>
              ) : (
                <Button size="sm" className="mt-3" onClick={() => void enableSemantic()}>
                  {m.downloadHelper(
                    status.embeddingSizeGb.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  )}
                </Button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

// --- Klasörler ---

function FolderRow({ folder, onChanged }: { folder: Folder; onChanged(): void }) {
  const t = useT()
  const locale = useLocale()
  const f = t.settings.folders
  const [progress, setProgress] = useState<IndexProgress | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [actions, setActions] = useState<FileAction[] | null>(null)
  const [error, setError] = useState('')

  useEffect(
    () =>
      window.api.folders.onIndexProgress((p) => {
        if (p.folderId === folder.id) setProgress(p)
      }),
    [folder.id]
  )

  async function index(): Promise<void> {
    setError('')
    setIndexing(true)
    setProgress({ folderId: folder.id, percent: 0, file: '' })
    try {
      await window.api.folders.index(folder.id)
    } catch (e) {
      setError(errorText(e))
    }
    setIndexing(false)
    setProgress(null)
    onChanged()
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{folder.name}</p>
          <p className="truncate font-mono text-xs text-ink-3" title={folder.path}>
            {folder.path}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {folder.indexedAt
              ? f.indexed(
                  folder.chunks,
                  folder.chunks.toLocaleString(locale),
                  formatDay(folder.indexedAt, locale)
                )
              : f.notIndexed}
          </p>
        </div>
        {confirmRemove ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => void window.api.folders.remove(folder.id).then(onChanged)}
            >
              {f.removeAccess}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
              {t.common.actions.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" busy={indexing} onClick={() => void index()}>
              {folder.indexedAt ? f.reindex : f.index}
            </Button>
            <IconButton label={f.removeAccessLabel(folder.name)} onClick={() => setConfirmRemove(true)}>
              <Trash2 size={15} aria-hidden />
            </IconButton>
          </div>
        )}
      </div>

      {confirmRemove && (
        <p className="mt-2 text-xs text-ink-3">{f.removeAccessNote}</p>
      )}
      {indexing && progress && (
        <div className="mt-3 space-y-1.5">
          <ProgressBar percent={progress.percent} />
          <p className="truncate text-xs text-ink-3">{progress.file || f.scanning}</p>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <button
        type="button"
        aria-expanded={actions !== null}
        onClick={() =>
          actions === null
            ? void window.api.folders.actions(folder.id).then(setActions, () => setActions([]))
            : setActions(null)
        }
        className="mt-2 text-[13px] font-medium text-accent hover:underline"
      >
        {actions === null ? f.showChanges : f.hideChanges}
      </button>
      {actions !== null &&
        (actions.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-3">{f.noChanges}</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {actions.map((a) => (
              <li key={a.id} className="flex gap-2 text-xs text-ink-2">
                <span className="w-24 shrink-0 text-ink-3 tabular-nums">
                  {new Date(a.createdAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="w-14 shrink-0 font-medium">{f.action[a.kind]}</span>
                <span className="min-w-0 break-all">
                  {a.path} <span className="text-ink-3">({a.detail})</span>
                </span>
              </li>
            ))}
          </ul>
        ))}
    </li>
  )
}

export function FoldersTab() {
  const t = useT()
  const f = t.settings.folders
  const folders = useApp((s) => s.folders)
  const loadFolders = useApp((s) => s.loadFolders)
  const [capability, setCapability] = useState<FolderCapability | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadFolders()
    void window.api.folders.capability().then(setCapability, () => setCapability(null))
  }, [loadFolders])

  async function add(): Promise<void> {
    setError('')
    try {
      if (await window.api.folders.add()) await loadFolders()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
          <p className="mt-0.5 max-w-[52ch] text-[13px] text-ink-3">{f.description}</p>
        </div>
        <Button size="sm" variant="primary" className="shrink-0" disabled={capability !== null && !capability.read} onClick={() => void add()}>
          <Plus size={15} aria-hidden />
          {f.addFolder}
        </Button>
      </div>

      {capability?.reason && <Notice tone="warn">{capability.reason}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      {folders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-[13px] text-ink-3">
          {f.empty}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {folders.map((folder) => (
            <FolderRow key={folder.id} folder={folder} onChanged={() => void loadFolders()} />
          ))}
        </ul>
      )}
    </div>
  )
}
