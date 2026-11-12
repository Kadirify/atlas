import { ArrowDown, ArrowLeft, ArrowUp, Plus, Square, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  APP_ICONS,
  type AppField,
  type FieldType,
  type MiniAppDraft
} from '@shared/types'
import { AppForm, AppIconTile, ICONS, initialValues, ModelPicker, PageHeader, Select } from '@/components/AppParts'
import { Button, Field, IconButton, Input, Notice, Textarea } from '@/components/ui'
import { useJob } from '@/lib/files'
import { cn, errorText, stripFence } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

/** Alan türleri, açılır listede görünecekleri sırayla. Adları sözlükten gelir. */
const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'select', 'toggle']

// --- 1. adım: kısa istekten prompt ---

function PromptStep({
  model,
  onBuilt
}: {
  /** Seçilen model; boşsa varsayılan */
  model: string
  /** Prompt hazır olunca uygulama taslağıyla çağrılır. */
  onBuilt(draft: MiniAppDraft): void
}) {
  const t = useT()
  const [request, setRequest] = useState('')
  const [prompt, setPrompt] = useState('')
  const [versions, setVersions] = useState<string[]>([])
  const [versionIndex, setVersionIndex] = useState(-1)
  const [instruction, setInstruction] = useState('')
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

  const job = useJob((done) => {
    const text = stripFence(done.text)
    if (!text) return
    setPrompt(text)
    setVersions((list) => {
      setVersionIndex(list.length)
      return [...list, text]
    })
  })

  const improve = (refine?: string): void => {
    setError('')
    job.start(() =>
      window.api.studio.improve({
        request,
        refine: refine && prompt.trim() ? { previous: prompt, instruction: refine } : undefined,
        model: model || undefined
      })
    )
  }

  async function build(): Promise<void> {
    setError('')
    setBuilding(true)
    try {
      onBuilt(await window.api.studio.buildApp(prompt, model || undefined))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBuilding(false)
    }
  }

  const shown = job.running ? job.text : prompt
  const hasPrompt = prompt.trim() !== ''

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">
        {t.apps.studio.heading}
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm text-ink-2">
        {t.apps.studio.lead}
      </p>

      <div className="mt-6">
        <Textarea
          rows={2}
          autoFocus
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && request.trim() && !job.running) {
              e.preventDefault()
              improve()
            }
          }}
          placeholder={t.apps.studio.requestPlaceholder}
          aria-label={t.apps.studio.requestLabel}
          className="text-[15px]"
        />
        {!hasPrompt && !job.running && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t.apps.studio.examplesLabel}>
            {t.apps.studio.examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => setRequest(example)}
                  className="rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-accent hover:text-ink"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {job.running ? (
            <Button onClick={job.stop}>
              <Square size={13} fill="currentColor" aria-hidden />
              {t.common.actions.stop}
            </Button>
          ) : (
            <Button variant={hasPrompt ? 'secondary' : 'primary'} disabled={!request.trim()} onClick={() => improve()}>
              <WandSparkles size={16} aria-hidden />
              {hasPrompt ? t.apps.studio.improveAgain : t.apps.studio.improve}
            </Button>
          )}
          {!hasPrompt && !job.running && (
            <button
              type="button"
              onClick={() => setPrompt(t.apps.studio.promptTemplate)}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              {t.apps.studio.writeMyself}
            </button>
          )}
        </div>
      </div>

      {(hasPrompt || job.running) && (
        <section className="mt-9" aria-label={t.apps.studio.prompt}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">{t.apps.studio.prompt}</h3>
            {versions.length > 1 && !job.running && (
              <div className="flex items-center gap-1" role="group" aria-label={t.apps.studio.versions}>
                {versions.map((version, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={i === versionIndex}
                    onClick={() => {
                      setVersionIndex(i)
                      setPrompt(version)
                    }}
                    className={cn(
                      'h-7 rounded-md px-2 text-xs font-medium',
                      i === versionIndex ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
                    )}
                  >
                    {t.apps.studio.version(i + 1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Textarea
            rows={16}
            value={shown}
            readOnly={job.running}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label={t.apps.promptText}
            className="resize-y font-mono text-[13px] leading-relaxed"
          />
          <p className="mt-1.5 text-xs text-ink-3">{t.apps.studio.promptHint}</p>

          {hasPrompt && !job.running && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {t.apps.studio.promptRefines.map((label) => (
                  <Button key={label} size="sm" variant="ghost" className="border border-line" onClick={() => improve(label)}>
                    {label}
                  </Button>
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!instruction.trim()) return
                  improve(instruction.trim())
                  setInstruction('')
                }}
              >
                <Input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t.apps.studio.refinePlaceholder}
                  aria-label={t.apps.studio.refineLabel}
                  className="h-9"
                />
                <Button size="sm" type="submit" disabled={!instruction.trim()} className="h-9">
                  {t.common.actions.apply}
                </Button>
              </form>
            </>
          )}
        </section>
      )}

      {job.notice && (
        <div className="mt-4">
          <Notice tone="warn">{job.notice}</Notice>
        </div>
      )}
      {(job.error || error) && (
        <div className="mt-4">
          <Notice tone="danger">{job.error || error}</Notice>
        </div>
      )}

      {hasPrompt && !job.running && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent bg-accent-soft px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{t.apps.studio.buildTitle}</h3>
            <p className="mt-0.5 text-[13px] text-ink-2">{t.apps.studio.buildLead}</p>
          </div>
          <Button variant="primary" busy={building} onClick={() => void build()}>
            {building ? t.apps.studio.building : t.apps.studio.build}
          </Button>
        </div>
      )}
    </div>
  )
}

// --- 2. adım: uygulama düzenleyici ---

function FieldEditor({
  field,
  index,
  count,
  onChange,
  onMove,
  onRemove
}: {
  field: AppField
  index: number
  count: number
  onChange(patch: Partial<AppField>): void
  onMove(delta: number): void
  onRemove(): void
}) {
  const t = useT()
  const ed = t.apps.editor
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_160px] gap-2">
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={ed.fieldNamePlaceholder}
            aria-label={ed.fieldNameLabel(index + 1)}
            className="h-9"
          />
          <Select
            value={field.type}
            aria-label={ed.fieldTypeLabel(index + 1)}
            className="h-9"
            onChange={(e) => {
              const type = e.target.value as FieldType
              onChange({ type, required: type === 'toggle' ? false : field.required })
            }}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {ed.fieldType[type]}
              </option>
            ))}
          </Select>
          {field.type === 'select' ? (
            <Input
              value={field.options.join(', ')}
              onChange={(e) => onChange({ options: e.target.value.split(',').map((o) => o.trimStart()) })}
              onBlur={() => onChange({ options: field.options.map((o) => o.trim()).filter(Boolean) })}
              placeholder={ed.optionsPlaceholder}
              aria-label={ed.optionsLabel(index + 1)}
              className="col-span-2 h-9"
            />
          ) : field.type !== 'toggle' ? (
            <Input
              value={field.placeholder}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              placeholder={ed.samplePlaceholder}
              aria-label={ed.sampleLabel(index + 1)}
              className="col-span-2 h-9"
            />
          ) : null}
          {field.type !== 'toggle' && (
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {ed.required}
            </label>
          )}
        </div>
        <div className="flex flex-col">
          <IconButton label={ed.moveUp} disabled={index === 0} onClick={() => onMove(-1)} className="h-7 w-7">
            <ArrowUp size={14} aria-hidden />
          </IconButton>
          <IconButton label={ed.moveDown} disabled={index === count - 1} onClick={() => onMove(1)} className="h-7 w-7">
            <ArrowDown size={14} aria-hidden />
          </IconButton>
          <IconButton label={ed.removeField} disabled={count === 1} onClick={onRemove} className="h-7 w-7 hover:text-danger">
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </div>
      </div>
    </li>
  )
}

function Editor({
  initial,
  editId,
  model,
  onBack
}: {
  initial: MiniAppDraft
  editId?: string
  /** Uygulamanın kullanacağı model; boşsa varsayılan */
  model: string
  onBack?(): void
}) {
  const t = useT()
  const go = useApp((s) => s.go)
  const loadApps = useApp((s) => s.loadApps)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const patch = (p: Partial<MiniAppDraft>): void => setDraft((d) => ({ ...d, ...p }))
  const setFields = (fn: (fields: AppField[]) => AppField[]): void => setDraft((d) => ({ ...d, fields: fn(d.fields) }))

  const addField = (): void =>
    setFields((fields) => {
      const used = new Set(fields.map((f) => f.key))
      let n = fields.length + 1
      while (used.has(`alan_${n}`)) n++
      return [...fields, { key: `alan_${n}`, label: '', type: 'text', placeholder: '', options: [], required: true }]
    })

  const problems = [
    !draft.name.trim() && t.apps.editor.problems.name,
    !draft.prompt.trim() && t.apps.editor.problems.prompt,
    draft.fields.some((f) => !f.label.trim()) && t.apps.editor.problems.fieldLabel,
    draft.fields.some((f) => f.type === 'select' && f.options.filter((o) => o.trim()).length < 2) &&
      t.apps.editor.problems.options
  ].filter(Boolean) as string[]

  async function save(): Promise<void> {
    setError('')
    setSaving(true)
    try {
      const saved = await window.api.apps.save(draft, editId)
      await window.api.apps.setModel(saved.id, model || null)
      await loadApps()
      go({ name: 'run', appId: saved.id })
    } catch (e) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] space-y-8 px-6 py-7">
          {onBack && (
            <button type="button" onClick={onBack} className="text-[13px] font-medium text-accent hover:underline">
              {t.apps.editor.backToPrompt}
            </button>
          )}

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">{t.apps.editor.appSection}</h2>
            <Field label={t.apps.editor.name}>
              <Input value={draft.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label={t.apps.editor.description} hint={t.apps.editor.descriptionHint}>
              <Input value={draft.description} maxLength={160} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{t.apps.editor.icon}</span>
              <div role="radiogroup" aria-label={t.apps.editor.icon} className="flex flex-wrap gap-1.5">
                {APP_ICONS.map((name) => {
                  const Icon = ICONS[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={draft.icon === name}
                      aria-label={name}
                      onClick={() => patch({ icon: name })}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                        draft.icon === name
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink'
                      )}
                    >
                      <Icon size={17} aria-hidden />
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">{t.apps.editor.fieldsSection}</h2>
            <p className="mt-0.5 mb-3 text-[13px] text-ink-3">{t.apps.editor.fieldsLead}</p>
            <ul className="space-y-2">
              {draft.fields.map((field, i) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  index={i}
                  count={draft.fields.length}
                  onChange={(p) => setFields((fields) => fields.map((f, j) => (j === i ? { ...f, ...p } : f)))}
                  onRemove={() => setFields((fields) => fields.filter((_, j) => j !== i))}
                  onMove={(delta) =>
                    setFields((fields) => {
                      const next = [...fields]
                      const [moved] = next.splice(i, 1)
                      next.splice(i + delta, 0, moved)
                      return next
                    })
                  }
                />
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" disabled={draft.fields.length >= 10} onClick={addField}>
              <Plus size={15} aria-hidden />
              {t.apps.editor.addField}
            </Button>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">{t.apps.editor.promptSection}</h2>
            <p className="mt-0.5 mb-3 text-[13px] text-ink-3">
              {t.apps.editor.promptLead}
            </p>
            <Textarea
              rows={12}
              value={draft.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              aria-label={t.apps.promptText}
              className="resize-y font-mono text-[13px] leading-relaxed"
            />
          </section>

          {(error || problems.length > 0) && <Notice tone={error ? 'danger' : 'warn'}>{error || problems[0]}</Notice>}

          <div className="flex items-center gap-3 pb-4">
            <Button variant="primary" busy={saving} disabled={problems.length > 0} onClick={() => void save()}>
              {editId ? t.apps.editor.saveChanges : t.apps.editor.saveApp}
            </Button>
            <Button variant="ghost" onClick={() => go(editId ? { name: 'run', appId: editId } : { name: 'apps' })}>
              {t.common.actions.cancel}
            </Button>
          </div>
        </div>
      </div>

      <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-line bg-bg px-5 py-7 lg:block" aria-label={t.apps.editor.preview}>
        <h2 className="mb-4 text-[13px] font-semibold text-ink-3">{t.apps.editor.preview}</h2>
        <div className="mb-5 flex items-start gap-3.5 rounded-xl border border-line bg-surface p-3.5">
          <AppIconTile icon={draft.icon} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{draft.name || t.apps.editor.unnamed}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{draft.description || t.apps.editor.noDescription}</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <AppForm fields={draft.fields.filter((f) => f.label.trim())} values={initialValues(draft.fields)} disabled />
        </div>
      </aside>
    </div>
  )
}

export default function StudioPage({ editId, draft: givenDraft }: { editId?: string; draft?: MiniAppDraft }) {
  const t = useT()
  const go = useApp((s) => s.go)
  const editing = useApp((s) => (editId ? s.apps.find((a) => a.id === editId) : undefined))
  const [built, setBuilt] = useState<MiniAppDraft | null>(null)
  const [model, setModel] = useState(editing?.model ?? '')

  // Başka bir uygulamayı düzenlemeye geçilirse önceki taslak kalmasın.
  useEffect(() => setBuilt(null), [editId, givenDraft])
  useEffect(() => setModel(editing?.model ?? ''), [editing?.id, editing?.model])

  const initial: MiniAppDraft | null = editing
    ? {
        name: editing.name,
        description: editing.description,
        icon: editing.icon,
        category: editing.category,
        prompt: editing.prompt,
        fields: editing.fields
      }
    : (givenDraft ?? built)

  const title = editing ? t.apps.studio.titleEdit(editing.name) : initial ? t.apps.studio.titleReview : t.apps.studio.titleNew

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      <PageHeader actions={<ModelPicker value={model} onChange={setModel} />}>
        <IconButton
          label={editing ? t.apps.studio.backToApp : t.apps.backToApps}
          onClick={() => go(editing ? { name: 'run', appId: editing.id } : { name: 'apps' })}
        >
          <ArrowLeft size={17} aria-hidden />
        </IconButton>
        <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink">{title}</h1>
      </PageHeader>

      {/* Talimat adımı, düzenleyiciden geri dönülünce yazılanlar kaybolmasın diye gizlenerek açık tutulur. */}
      {!editId && !givenDraft && (
        <div className={cn('min-h-0 flex-1 overflow-y-auto', built && 'hidden')}>
          <PromptStep model={model} onBuilt={setBuilt} />
        </div>
      )}
      {initial && (
        <Editor
          key={editId ?? initial.name}
          initial={initial}
          editId={editId}
          model={model}
          onBack={built && !givenDraft ? () => setBuilt(null) : undefined}
        />
      )}
    </main>
  )
}
