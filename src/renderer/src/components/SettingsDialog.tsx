import { Check, Download, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Lang } from '@shared/i18n'
import type { OllamaStatus, PullProgress, Recommendation, Settings, Theme, UpdateInfo } from '@shared/types'
import { Button, CheckCard, Field, IconButton, Input, Notice, ProgressBar, Textarea } from '@/components/ui'
import { APP_NAME, RepoLink, Wordmark } from '@/components/Logo'
import { DesktopTab } from '@/components/DesktopTab'
import Markdown from '@/components/Markdown'
import { FoldersTab, MemoryTab, PersonasTab } from '@/components/SettingsExtra'
import { cn, errorText, FIT_LABEL, formatBytes, formatGb } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

type Tab = 'genel' | 'masaustu' | 'kisilikler' | 'hafiza' | 'klasorler' | 'modeller' | 'hakkinda'

/** Sekme kimlikleri kod içi anahtarlardır; görünen etiketler sözlükten gelir. */
const TAB_IDS: Tab[] = ['genel', 'masaustu', 'kisilikler', 'hafiza', 'klasorler', 'modeller', 'hakkinda']
const THEME_IDS: Theme[] = ['system', 'light', 'dark']
const LANG_IDS: Lang[] = ['tr', 'en']

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange(value: T): void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-bg p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'h-8 rounded-md px-3.5 text-[13px] font-medium transition-colors',
            value === option.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Hazır önerileri olan ama serbestçe de yazılabilen metin kutusu. */
function SuggestInput({
  id,
  value,
  suggestions,
  onChange
}: {
  id: string
  value: string
  suggestions: string[]
  onChange(value: string): void
}) {
  return (
    <>
      <Input value={value} list={id} maxLength={40} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  )
}

function GeneralTab() {
  const t = useT()
  const g = t.settings.general
  const settings = useApp((s) => s.settings)!
  const saveSettings = useApp((s) => s.saveSettings)
  const [profile, setProfile] = useState({
    userName: settings.userName,
    jobTitle: settings.jobTitle,
    company: settings.company,
    signature: settings.signature,
    corporateMode: settings.corporateMode,
    salutation: settings.salutation,
    closing: settings.closing
  })
  const [saved, setSaved] = useState(false)

  const dirty = (Object.keys(profile) as (keyof typeof profile)[]).some((k) => profile[k] !== settings[k])
  const set = <K extends keyof typeof profile>(key: K, value: (typeof profile)[K]): void => {
    setSaved(false)
    setProfile((p) => ({ ...p, [key]: value }))
  }
  const sampleName = g.sampleName

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{g.appearance}</h3>
        <Segmented
          label={g.themeLabel}
          value={settings.theme}
          options={THEME_IDS.map((id) => ({ id, label: g.theme[id] }))}
          onChange={(theme) => void saveSettings({ theme })}
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{g.language}</h3>
        <Segmented
          label={g.language}
          value={settings.language}
          options={LANG_IDS.map((id) => ({ id, label: t.common.languageName[id] }))}
          onChange={(language) => void saveSettings({ language })}
        />
        <p className="mt-2 text-[13px] text-ink-3">{g.languageHint}</p>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{g.addressTitle}</h3>
        <p className="mb-3 text-[13px] text-ink-3">{g.addressHint}</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-[240px]">
            <Field label={g.yourName}>
              <Input value={profile.userName} onChange={(e) => set('userName', e.target.value)} />
            </Field>
          </div>
          <Segmented
            label={g.addressLabel}
            value={settings.addressUser}
            options={[
              { id: 'sen', label: g.address.sen },
              { id: 'siz', label: g.address.siz }
            ]}
            onChange={(addressUser) => void saveSettings({ addressUser })}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{g.lettersTitle}</h3>
        <p className="mb-3 text-[13px] text-ink-3">{g.lettersHint}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={g.salutation}>
            <SuggestInput
              id="salutations"
              value={profile.salutation}
              suggestions={g.salutationSuggestions}
              onChange={(v) => set('salutation', v)}
            />
          </Field>
          <Field label={g.closing}>
            <SuggestInput
              id="closings"
              value={profile.closing}
              suggestions={g.closingSuggestions}
              onChange={(v) => set('closing', v)}
            />
          </Field>
        </div>
        <p className="mt-3 rounded-lg bg-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
          {profile.salutation.trim() ? `${profile.salutation.trim()} ${sampleName},` : `${sampleName},`}
          <br />
          <span className="text-ink-3">…</span>
          <br />
          {profile.corporateMode && profile.signature.trim()
            ? profile.signature.trim().split('\n')[0]
            : profile.closing.trim()
              ? `${profile.closing.trim()},`
              : ''}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{g.corporateTitle}</h3>
        <div className="space-y-4">
          <CheckCard
            checked={profile.corporateMode}
            onChange={(corporateMode) => set('corporateMode', corporateMode)}
            title={g.corporateCheck}
            description={g.corporateDescription}
          />
          {profile.corporateMode && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={g.jobTitle}>
                <Input value={profile.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
              </Field>
              <Field label={g.company}>
                <Input value={profile.company} onChange={(e) => set('company', e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label={g.signature} hint={g.signatureHint}>
                  <Textarea rows={3} value={profile.signature} onChange={(e) => set('signature', e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="sticky -bottom-6 -mr-14 -ml-7 flex items-center gap-3 border-t border-line bg-surface py-3 pr-14 pl-7">
        <Button variant="primary" disabled={!dirty} onClick={() => void saveSettings(profile).then(() => setSaved(true))}>
          {g.saveChanges}
        </Button>
        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-[13px] text-teal" role="status">
            <Check size={14} aria-hidden />
            {g.saved}
          </span>
        )}
      </div>
    </div>
  )
}

function ModelsTab() {
  const t = useT()
  const m = t.settings.models
  const settings = useApp((s) => s.settings)!
  const saveSettings = useApp((s) => s.saveSettings)
  const installed = useApp((s) => s.installed)
  const refreshInstalled = useApp((s) => s.refreshInstalled)

  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({})
  const [confirmRemove, setConfirmRemove] = useState('')
  const [error, setError] = useState('')
  const cancelled = useRef(new Set<string>())

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await window.api.ollama.status())
      await refreshInstalled()
      setRec(await window.api.models.recommend())
    } catch (e) {
      setError(errorText(e))
    }
  }

  useEffect(() => {
    void refresh()
    const timers: ReturnType<typeof setTimeout>[] = []
    const off = window.api.models.onPullProgress((p) => {
      setPulls((prev) => ({ ...prev, [p.model]: p }))
      // Pencere indirme sürerken kapatılıp açıldıysa indirmeyi başlatan pencere artık yoktur; bitişi burada yakalanır.
      // İndirmeden sonra model birkaç saniyede kurulur; sonra satır kalkar ve liste yenilenir.
      if (p.status === 'success') {
        timers.push(
          setTimeout(() => {
            clearPull(p.model)
            void refresh()
          }, 4000)
        )
      }
    })
    return () => {
      off()
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearPull = (id: string): void =>
    setPulls((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })

  async function download(id: string): Promise<void> {
    setError('')
    cancelled.current.delete(id)
    setPulls((prev) => ({
      ...prev,
      [id]: { model: id, status: '', completedBytes: 0, totalBytes: 0, percent: 0, bytesPerSec: 0 }
    }))
    try {
      await window.api.models.pull(id)
      if (!settings.defaultModel) await saveSettings({ defaultModel: id })
    } catch (e) {
      if (!cancelled.current.has(id)) setError(errorText(e))
    } finally {
      clearPull(id)
      await refresh()
    }
  }

  async function removeModel(name: string): Promise<void> {
    setError('')
    setConfirmRemove('')
    try {
      await window.api.models.remove(name)
      // Varsayılan model silindiyse ana süreç ayarı temizler; arayüz de güncellensin.
      useApp.setState({ settings: await window.api.settings.get() })
    } catch (e) {
      setError(errorText(e))
    }
    await refresh()
  }

  const installedNames = new Set(installed.map((model) => model.name))
  const downloadable = rec?.all.filter((model) => !installedNames.has(model.id)) ?? []

  return (
    <div className="space-y-8">
      {error && <Notice tone="danger">{error}</Notice>}

      <section className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Ollama</h3>
          <p className={cn('text-[13px]', status?.running ? 'text-teal' : 'text-warn')}>
            {status === null
              ? m.checking
              : status.running
                ? m.running(status.version)
                : status.installed
                  ? m.installedNotRunning
                  : m.notInstalled}
          </p>
        </div>
        {status && !status.running && status.installed && (
          <Button
            busy={starting}
            onClick={() => {
              setStarting(true)
              void window.api.ollama
                .start()
                .then(setStatus, (e) => setError(errorText(e)))
                .finally(() => {
                  setStarting(false)
                  void refresh()
                })
            }}
          >
            {m.startOllama}
          </Button>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{m.installedTitle}</h3>
        <p className="mb-3 text-[13px] text-ink-3">{m.installedHint}</p>
        {installed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-[13px] text-ink-3">
            {m.noneInstalled}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {installed.map((model) => {
              const isDefault = settings.defaultModel === model.name
              return (
                <li key={model.name} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {model.label ?? model.name}
                    </p>
                    <p className="text-xs text-ink-3">{formatGb(model.sizeGb)}</p>
                  </div>
                  {confirmRemove === model.name ? (
                    <>
                      <span className="text-[13px] text-ink-2">{t.settings.confirmDelete}</span>
                      <Button size="sm" variant="danger" onClick={() => void removeModel(model.name)}>
                        {t.common.actions.yesDelete}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove('')}>
                        {t.common.actions.cancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      {isDefault ? (
                        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                          {m.default}
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void saveSettings({ defaultModel: model.name })}>
                          {m.makeDefault}
                        </Button>
                      )}
                      <IconButton label={m.deleteModel(model.name)} onClick={() => setConfirmRemove(model.name)}>
                        <Trash2 size={15} aria-hidden />
                      </IconButton>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {downloadable.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink">{m.downloadableTitle}</h3>
          <p className="mb-3 text-[13px] text-ink-3">{m.downloadableHint}</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {downloadable.map((model) => {
              const progress = pulls[model.id]
              return (
                <li key={model.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2.5 text-sm font-medium text-ink">
                        {model.name}
                        {rec?.recommended.id === model.id && <span className="text-[13px] text-accent">{m.recommended}</span>}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{model.description}</p>
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          model.fit === 'rahat' ? 'text-teal' : model.fit === 'yavas' ? 'text-warn' : 'text-ink-3'
                        )}
                      >
                        {FIT_LABEL[model.fit]}, {formatGb(model.sizeGb)}
                      </p>
                    </div>
                    {progress ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          cancelled.current.add(model.id)
                          void window.api.models.cancelPull(model.id)
                        }}
                      >
                        {m.pause}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={model.fit === 'sigmaz' || !status?.running}
                        onClick={() => void download(model.id)}
                      >
                        <Download size={14} aria-hidden />
                        {m.download}
                      </Button>
                    )}
                  </div>
                  {progress && (
                    <div className="mt-3 space-y-1.5">
                      <ProgressBar percent={progress.percent} />
                      <p className="text-xs text-ink-3 tabular-nums">
                        {progress.totalBytes > 0
                          ? t.settings.downloadProgress(
                              Math.floor(progress.percent),
                              formatBytes(progress.completedBytes),
                              formatBytes(progress.totalBytes)
                            )
                          : t.settings.connecting}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function AboutTab({ onClose }: { onClose(): void }) {
  const t = useT()
  const a = t.settings.about
  const saveSettings = useApp((s) => s.saveSettings)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [updateError, setUpdateError] = useState('')
  /** null: indirme başlamadı; 100: indirildi ve kuruluma hazır */
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  useEffect(() => {
    void window.api.app.version().then(setVersion)
    return window.api.app.onUpdateProgress((p) => setDownloadPercent((current) => (current === null ? current : Math.floor(p.percent))))
  }, [])

  async function download(): Promise<void> {
    setUpdateError('')
    setDownloadPercent(0)
    try {
      await window.api.app.downloadUpdate()
      setDownloadPercent(100)
    } catch (e) {
      setDownloadPercent(null)
      setUpdateError(errorText(e))
    }
  }

  async function check(): Promise<void> {
    setChecking(true)
    setUpdateError('')
    try {
      setUpdate(await window.api.app.checkUpdates())
    } catch (e) {
      setUpdate(null)
      setUpdateError(errorText(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <Wordmark size={34} />
        <p className="mt-2 text-[13px] text-ink-3">{a.version(version)}</p>
        <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-ink-2">{a.privacy}</p>
        <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-2">{a.openSource(APP_NAME)}</p>
        <p className="mt-3 text-sm">
          <RepoLink />
        </p>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{a.updatesTitle}</h3>
        <p className="mb-3 max-w-[52ch] text-[13px] text-ink-3">{a.updatesHint}</p>
        <Button disabled={checking} onClick={() => void check()}>
          {checking ? a.checking : a.checkUpdates}
        </Button>
        <div className="mt-3 space-y-1 text-[13px]" role="status">
          {update && (
            <p className="text-ink-2">
              {update.hasUpdate && update.latestVersion
                ? a.updateAvailable(update.latestVersion)
                : update.latestVersion
                  ? a.upToDate
                  : a.noRelease}{' '}
              {update.hasUpdate && (
                <a href={update.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                  {a.download}
                </a>
              )}
            </p>
          )}
          {update?.hasUpdate && update.notes && (
            <div className="mt-3 max-h-[220px] overflow-y-auto rounded-xl border border-line bg-bg px-4 py-3">
              <h4 className="mb-2 text-[13px] font-semibold text-ink">{a.notesTitle}</h4>
              <Markdown text={update.notes} />
            </div>
          )}
          {update?.hasUpdate && update.installable && (
            <div className="mt-3 space-y-2">
              {downloadPercent === null && (
                <Button variant="primary" onClick={() => void download()}>
                  <Download size={15} aria-hidden />
                  {a.downloadAndInstall(update.sizeMb)}
                </Button>
              )}
              {downloadPercent !== null && downloadPercent < 100 && (
                <>
                  <ProgressBar percent={downloadPercent} />
                  <p className="text-xs text-ink-3 tabular-nums">{a.downloading(downloadPercent)}</p>
                </>
              )}
              {downloadPercent === 100 && (
                <>
                  <p className="text-ink-2">{a.readyToInstall}</p>
                  <Button variant="primary" onClick={() => void window.api.app.installUpdate().catch((e) => setUpdateError(errorText(e)))}>
                    {a.install}
                  </Button>
                </>
              )}
            </div>
          )}
          {update?.modelsUpdated && <p className="text-ink-2">{a.modelsUpdated}</p>}
          {updateError && <p className="text-danger">{updateError}</p>}
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{a.wizardTitle}</h3>
        <p className="mb-3 text-[13px] text-ink-3">{a.wizardHint}</p>
        <Button
          onClick={() => {
            onClose()
            void saveSettings({ setupDone: false })
          }}
        >
          {a.restartWizard}
        </Button>
      </section>
    </div>
  )
}

export default function SettingsDialog({ onClose }: { onClose(): void }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('genel')
  const settings = useApp((s) => s.settings) as Settings
  const panelRef = useRef<HTMLDivElement>(null)

  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Esc yalnızca pencereyi kapatır; arkadaki sohbette süren cevap durmaz.
      e.preventDefault()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!settings) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.title}
        tabIndex={-1}
        className="flex h-[min(640px,100%)] w-full max-w-[820px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none"
      >
        <nav className="w-[190px] shrink-0 border-r border-line bg-bg p-3" aria-label={t.settings.sectionsLabel}>
          <h2 className="px-2.5 pt-1.5 pb-3 font-display text-lg font-semibold tracking-tight text-ink">{t.settings.title}</h2>
          {TAB_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'mb-0.5 flex h-9 w-full items-center rounded-lg px-2.5 text-left text-sm',
                tab === id ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              )}
            >
              {t.settings.tabs[id]}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1">
          <IconButton label={t.settings.closeLabel} onClick={onClose} className="absolute top-3 right-3">
            <X size={17} aria-hidden />
          </IconButton>
          <div className="h-full overflow-y-auto px-7 py-6 pr-14">
            {tab === 'genel' && <GeneralTab />}
            {tab === 'masaustu' && <DesktopTab />}
            {tab === 'kisilikler' && <PersonasTab onClose={onClose} />}
            {tab === 'hafiza' && <MemoryTab />}
            {tab === 'klasorler' && <FoldersTab />}
            {tab === 'modeller' && <ModelsTab />}
            {tab === 'hakkinda' && <AboutTab onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>
  )
}
