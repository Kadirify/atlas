import {
  Check,
  CircleAlert,
  Cpu,
  DatabaseZap,
  EyeOff,
  HardDrive,
  MemoryStick,
  Monitor,
  Pause,
  Play,
  Trash2,
  WifiOff
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  BenchmarkResult,
  DownloadProgress,
  HardwareInfo,
  OllamaStatus,
  PullProgress,
  RatedModel,
  Recommendation
} from '@shared/types'
import { OpenSourceNote, Wordmark } from '@/components/Logo'
import { Button, CheckCard, Field, Input, Notice, ProgressBar, Textarea } from '@/components/ui'
import {
  cn,
  errorText,
  FIT_LABEL,
  formatBytes,
  formatDuration,
  formatGb,
  speedLabel,
  TIER_LABEL,
  TIER_ORDER,
  TIER_SUMMARY,
  wordsPerSec
} from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

function Shell({
  step,
  title,
  lead,
  beforeTitle,
  children,
  footer
}: {
  step: number
  title: string
  lead?: string
  /** Başlığın üstünde gösterilen isteğe bağlı içerik (ilk adımdaki dil seçimi) */
  beforeTitle?: ReactNode
  children?: ReactNode
  footer: ReactNode
}) {
  const t = useT()
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="drag flex h-10 shrink-0 items-center px-4">
        <Wordmark size={21} />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-8 pb-8">
        <ol className="mb-10 flex gap-1.5" aria-label={t.setup.stepsLabel}>
          {t.setup.steps.map((name, i) => (
            <li key={name} className="flex-1" aria-current={i === step ? 'step' : undefined}>
              <div
                className={cn(
                  'h-1 rounded-full transition-colors',
                  i < step ? 'bg-accent' : i === step ? 'bg-accent' : 'bg-line'
                )}
              />
              <span
                className={cn('mt-2 block text-xs', i === step ? 'font-medium text-ink' : 'text-ink-3', i > step && 'opacity-70')}
              >
                {name}
              </span>
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {beforeTitle && <div className="mb-5">{beforeTitle}</div>}
          <h1 className="font-display text-[34px] leading-[1.1] font-semibold tracking-tight text-ink">{title}</h1>
          {lead && <p className="mt-3 max-w-[58ch] text-[15px] text-ink-2">{lead}</p>}
          <div className="mt-8">{children}</div>
        </div>

        <div className="mt-6 flex shrink-0 items-center justify-between gap-3 border-t border-line pt-5">{footer}</div>
        <OpenSourceNote className="mt-5 text-center" />
      </div>
    </div>
  )
}

// --- Bilgisayar taraması ---

function SpecRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-3 last:border-b-0">
      <span className="translate-y-0.5 text-ink-3">{icon}</span>
      <span className="w-28 shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className="min-w-0 text-sm font-medium break-words text-ink">{value}</span>
    </div>
  )
}

function HardwareSheet({ hw }: { hw: HardwareInfo }) {
  const t = useT()
  const tierIndex = TIER_ORDER.indexOf(hw.tier)
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-[1fr_auto] items-end gap-6 bg-accent px-6 py-6 text-accent-ink">
        <div>
          <p className="text-[13px] opacity-80">{t.setup.hardware.tierHeading}</p>
          <p className="font-display text-[56px] leading-none font-semibold tracking-tight">{TIER_LABEL[hw.tier]}</p>
        </div>
        <div className="flex items-end gap-1.5 pb-1.5" aria-hidden>
          {TIER_ORDER.map((tier, i) => (
            <div
              key={tier}
              className={cn('w-3.5 rounded-sm bg-accent-ink', i <= tierIndex ? 'opacity-100' : 'opacity-25')}
              style={{ height: 14 + i * 11 }}
            />
          ))}
        </div>
      </div>
      <p className="border-b border-line px-6 py-3.5 text-sm text-ink-2">{TIER_SUMMARY[hw.tier]}</p>
      <div className="px-6">
        <SpecRow icon={<Cpu size={15} />} label={t.setup.hardware.cpu} value={t.setup.hardware.cpuValue(hw.cpu, hw.cores)} />
        <SpecRow icon={<MemoryStick size={15} />} label={t.setup.hardware.memory} value={t.setup.hardware.memoryValue(hw.ramGb)} />
        <SpecRow
          icon={<Monitor size={15} />}
          label={t.setup.hardware.gpu}
          value={
            hw.gpus.length > 0
              ? hw.gpus.map((g) => `${g.name}, ${formatGb(g.vramGb)}`).join(' · ')
              : t.setup.hardware.noGpu
          }
        />
        <SpecRow icon={<HardDrive size={15} />} label={t.setup.hardware.freeDisk} value={formatGb(hw.diskFreeGb)} />
      </div>
    </div>
  )
}

// --- Model seçimi ---

function FitBadge({ model }: { model: RatedModel }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        model.fit === 'rahat' && 'bg-teal-soft text-teal',
        model.fit === 'yavas' && 'bg-warn-soft text-warn',
        model.fit === 'sigmaz' && 'bg-surface-2 text-ink-3'
      )}
    >
      {FIT_LABEL[model.fit]}
    </span>
  )
}

function ModelOption({
  model,
  role,
  compact = false,
  selected,
  onSelect
}: {
  model: RatedModel
  role?: string
  /** Açıklama satırı olmadan, tek satırlık görünüm */
  compact?: boolean
  selected: boolean
  onSelect(): void
}) {
  const t = useT()
  const disabled = model.fit === 'sigmaz'
  const size = model.installed ? formatGb(model.sizeGb) : t.setup.model.toDownload(formatGb(model.sizeGb))
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full gap-3.5 rounded-xl border bg-surface px-4 text-left transition-colors',
        compact ? 'items-center py-2.5' : 'items-start py-3.5',
        selected ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-ink-3',
        disabled && 'cursor-not-allowed opacity-55 hover:border-line'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          !compact && 'mt-1',
          selected ? 'border-accent bg-accent' : 'border-ink-3'
        )}
        aria-hidden
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
      </span>
      {compact ? (
        <>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5">
            <span className="truncate text-sm font-semibold text-ink">{model.name}</span>
            {role && <span className="text-[13px] font-medium text-accent">{role}</span>}
          </span>
          <FitBadge model={model} />
          <span className="w-16 shrink-0 text-right text-xs text-ink-3 tabular-nums">{size}</span>
        </>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[15px] font-semibold text-ink">{model.name}</span>
            {role && <span className="text-[13px] font-medium text-accent">{role}</span>}
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{model.description}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2.5">
            <FitBadge model={model} />
            <span className="text-xs text-ink-3">{size}</span>
          </span>
        </span>
      )}
    </button>
  )
}

/** Kurulu modellerden ilk bakışta gösterilecek en fazla satır */
const INSTALLED_PREVIEW = 4

function ModelPicker({
  rec,
  selectedId,
  onSelect
}: {
  rec: Recommendation
  selectedId: string
  onSelect(id: string): void
}) {
  const [showAllInstalled, setShowAllInstalled] = useState(false)
  const [showAllDownloads, setShowAllDownloads] = useState(false)

  const t = useT()

  const roles = new Map<string, string>([[rec.recommended.id, t.setup.model.roleRecommended]])
  if (rec.stronger) roles.set(rec.stronger.id, t.setup.model.roleStronger)
  if (rec.faster) roles.set(rec.faster.id, t.setup.model.roleFaster)

  // Kurulu olanlar, en kaliteliden başlayarak.
  const installed = rec.all.filter((m) => m.installed).sort((a, b) => b.rank - a.rank)
  const downloads = rec.all.filter((m) => !m.installed)
  const featured = downloads.filter((m) => roles.has(m.id)).sort((a, b) => order(a.id) - order(b.id))
  const others = downloads.filter((m) => !roles.has(m.id))

  function order(id: string): number {
    return [rec.recommended.id, rec.stronger?.id, rec.faster?.id].indexOf(id)
  }

  // Seçili model gizli satırlardaysa kullanıcı onu görebilsin.
  const hiddenInstalled = installed.slice(INSTALLED_PREVIEW)
  const installedVisible =
    showAllInstalled || hiddenInstalled.some((m) => m.id === selectedId) ? installed : installed.slice(0, INSTALLED_PREVIEW)

  const toggle = 'pt-1 text-[13px] font-medium text-accent hover:underline'

  return (
    <div role="radiogroup" aria-label={t.setup.model.pickerLabel} className="space-y-7">
      {installed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink">{t.setup.model.installedHeading}</h2>
          <p className="mt-0.5 mb-3 text-[13px] text-ink-3">{t.setup.model.installedHint}</p>
          <div className="space-y-2">
            {installedVisible.map((model) => (
              <ModelOption
                key={model.id}
                compact
                model={model}
                role={roles.get(model.id)}
                selected={selectedId === model.id}
                onSelect={() => onSelect(model.id)}
              />
            ))}
          </div>
          {hiddenInstalled.length > 0 && installedVisible.length < installed.length && (
            <button type="button" onClick={() => setShowAllInstalled(true)} className={cn(toggle, 'mt-2')}>
              {t.setup.model.showMoreInstalled(hiddenInstalled.length)}
            </button>
          )}
        </section>
      )}

      {downloads.length > 0 && (
        <section>
          {installed.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-ink">{t.setup.model.downloadableHeading}</h2>
              <p className="mt-0.5 mb-3 text-[13px] text-ink-3">{t.setup.model.downloadableHint}</p>
            </>
          )}
          <div className="space-y-2.5">
            {featured.map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                role={roles.get(model.id)}
                selected={selectedId === model.id}
                onSelect={() => onSelect(model.id)}
              />
            ))}
            {others.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAllDownloads((v) => !v)}
                  aria-expanded={showAllDownloads}
                  className={toggle}
                >
                  {showAllDownloads ? t.setup.model.hideOthers : t.setup.model.showOthers(others.length)}
                </button>
                {showAllDownloads &&
                  others.map((model) => (
                    <ModelOption
                      key={model.id}
                      model={model}
                      selected={selectedId === model.id}
                      onSelect={() => onSelect(model.id)}
                    />
                  ))}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// --- Sihirbaz ---

export default function Setup() {
  const t = useT()
  const language = useApp((s) => s.settings?.language)
  const settings = useApp((s) => s.settings)!
  const saveSettings = useApp((s) => s.saveSettings)
  const refreshInstalled = useApp((s) => s.refreshInstalled)

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')

  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [ollamaBusy, setOllamaBusy] = useState<'' | 'checking' | 'starting' | 'installing'>('')
  const [installProgress, setInstallProgress] = useState<DownloadProgress | null>(null)
  const [ollamaAttempt, setOllamaAttempt] = useState(0)

  const [rec, setRec] = useState<Recommendation | null>(null)
  const [modelId, setModelId] = useState('')
  const [pull, setPull] = useState<PullProgress | null>(null)
  const [pullState, setPullState] = useState<'idle' | 'running' | 'paused' | 'done'>('idle')
  const [bench, setBench] = useState<BenchmarkResult | null>(null)

  const [profile, setProfile] = useState({
    userName: settings.userName,
    company: settings.company,
    jobTitle: settings.jobTitle,
    signature: settings.signature,
    corporateMode: settings.corporateMode
  })
  const [dataPath, setDataPath] = useState('')

  const model = (rec && rec.all.find((m) => m.id === modelId)) ?? null
  const go = (next: number): void => {
    setError('')
    setStep(next)
  }

  // Adım 1: bilgisayar taraması
  useEffect(() => {
    if (step !== 1 || hw) return
    window.api.hardware.scan().then(setHw, (e) => setError(errorText(e)))
  }, [step, hw])

  // Adım 2: Ollama kurulu mu, çalışıyor mu
  useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    void (async () => {
      setOllamaBusy('checking')
      try {
        let status = await window.api.ollama.status()
        if (status.installed && !status.running) {
          if (cancelled) return
          setOllamaBusy('starting')
          status = await window.api.ollama.start()
        }
        if (!cancelled) setOllama(status)
      } catch (e) {
        if (!cancelled) setError(errorText(e))
      } finally {
        if (!cancelled) setOllamaBusy('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, ollamaAttempt])

  useEffect(() => window.api.ollama.onInstallProgress(setInstallProgress), [])
  useEffect(
    () =>
      window.api.models.onPullProgress((p) => {
        if (p.model === modelRef.current) setPull(p)
      }),
    []
  )
  const modelRef = useRef(modelId)
  modelRef.current = modelId
  const pausedByUser = useRef(false)

  // Adım 3: model önerisi
  useEffect(() => {
    if (step !== 3) return
    window.api.models.recommend().then(
      (r) => {
        setRec(r)
        setModelId((current) => current || r.recommended.id)
      },
      (e) => setError(errorText(e))
    )
  }, [step])

  useEffect(() => {
    void window.api.app.dataPath().then(setDataPath, () => setDataPath(''))
  }, [])

  // Adım 5: hız testi
  useEffect(() => {
    if (step !== 5 || !modelId || bench?.model === modelId) return
    setBench(null)
    window.api.models.benchmark(modelId).then(setBench, (e) => setError(errorText(e)))
  }, [step, modelId, bench])

  async function installOllama(): Promise<void> {
    setError('')
    setOllamaBusy('installing')
    setInstallProgress(null)
    try {
      setOllama(await window.api.ollama.install())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setOllamaBusy('')
    }
  }

  async function startDownload(): Promise<void> {
    if (!model) return
    setError('')
    if (model.installed) {
      setPullState('done')
      go(5)
      return
    }
    go(4)
    setPullState('running')
    pausedByUser.current = false
    try {
      await window.api.models.pull(model.id)
      setPullState('done')
      await refreshInstalled()
      setStep(5)
    } catch (e) {
      // Kullanıcı duraklattıysa istek iptal hatasıyla biter; bu bir hata değildir.
      if (!pausedByUser.current) setError(errorText(e))
      setPullState('paused')
    }
  }

  async function pauseDownload(): Promise<void> {
    pausedByUser.current = true
    setPullState('paused')
    await window.api.models.cancelPull(modelId)
  }

  async function finish(): Promise<void> {
    await saveSettings({ ...profile, defaultModel: modelId, setupDone: true })
  }

  const errorBox = error && (
    <div className="mt-5">
      <Notice tone="danger">{error}</Notice>
    </div>
  )

  if (step === 0) {
    return (
      <Shell
        step={0}
        title={t.setup.welcome.title}
        lead={t.setup.welcome.lead}
        beforeTitle={
          <div
            role="radiogroup"
            aria-label={t.setup.welcome.languageLabel}
            className="inline-flex rounded-lg border border-line bg-bg p-1"
          >
            {(['tr', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                role="radio"
                aria-checked={(language ?? 'tr') === lang}
                onClick={() => {
                  if ((language ?? 'tr') !== lang) void saveSettings({ language: lang })
                }}
                className={cn(
                  'h-8 rounded-md px-3.5 text-[13px] font-medium transition-colors',
                  (language ?? 'tr') === lang ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                )}
              >
                {t.common.languageName[lang]}
              </button>
            ))}
          </div>
        }
        footer={
          <>
            <span className="text-[13px] text-ink-3">{t.setup.welcome.duration}</span>
            <Button variant="primary" size="lg" onClick={() => go(1)}>
              {t.setup.welcome.start}
            </Button>
          </>
        }
      >
        <ul className="space-y-3.5 text-[15px] text-ink-2">
          {t.setup.welcome.points.map((line, i) => (
            <li key={line} className="flex gap-3.5">
              <span className="font-display text-lg leading-6 font-semibold text-accent">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Shell>
    )
  }

  if (step === 1) {
    return (
      <Shell
        step={1}
        title={hw ? t.setup.hardware.titleDone : t.setup.hardware.titleScanning}
        lead={t.setup.hardware.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(0)}>
              {t.common.actions.back}
            </Button>
            <Button variant="primary" size="lg" disabled={!hw} onClick={() => go(2)}>
              {t.common.actions.continue}
            </Button>
          </>
        }
      >
        {hw ? <HardwareSheet hw={hw} /> : !error && <p className="text-sm text-ink-3">{t.setup.hardware.scanning}</p>}
        {errorBox}
      </Shell>
    )
  }

  if (step === 2) {
    const running = ollama?.running === true
    return (
      <Shell
        step={2}
        title={t.setup.ollama.title}
        lead={t.setup.ollama.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(1)}>
              {t.common.actions.back}
            </Button>
            <Button variant="primary" size="lg" disabled={!running} onClick={() => go(3)}>
              {t.common.actions.continue}
            </Button>
          </>
        }
      >
        <div className="rounded-2xl border border-line bg-surface p-5">
          {ollamaBusy === 'checking' && <p className="text-sm text-ink-2">{t.setup.ollama.checking}</p>}
          {ollamaBusy === 'starting' && <p className="text-sm text-ink-2">{t.setup.ollama.starting}</p>}
          {ollamaBusy === 'installing' && (
            <div className="space-y-3">
              <p className="text-sm text-ink-2">
                {installProgress && installProgress.percent < 100
                  ? t.setup.ollama.downloading(
                      formatBytes(installProgress.completedBytes),
                      formatBytes(installProgress.totalBytes)
                    )
                  : installProgress
                    ? t.setup.ollama.installing
                    : t.setup.ollama.downloadStarting}
              </p>
              <ProgressBar percent={installProgress?.percent ?? 0} />
            </div>
          )}
          {!ollamaBusy && running && (
            <p className="flex items-center gap-2.5 text-sm font-medium text-teal">
              <Check size={17} aria-hidden />
              {t.setup.ollama.running(ollama?.version)}
            </p>
          )}
          {!ollamaBusy && ollama && !ollama.installed && (
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 text-sm text-ink-2">
                <CircleAlert size={17} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                {t.setup.ollama.notInstalled}
              </p>
              <Button variant="primary" onClick={() => void installOllama()}>
                {t.setup.ollama.install}
              </Button>
            </div>
          )}
          {!ollamaBusy && ollama?.installed && !running && (
            <div className="space-y-4">
              <p className="flex items-start gap-2.5 text-sm text-ink-2">
                <CircleAlert size={17} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                {t.setup.ollama.startFailed}
              </p>
              <Button onClick={() => setOllamaAttempt((n) => n + 1)}>{t.common.actions.retry}</Button>
            </div>
          )}
        </div>
        {errorBox}
      </Shell>
    )
  }

  if (step === 3) {
    return (
      <Shell
        step={3}
        title={t.setup.model.title}
        lead={t.setup.model.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(2)}>
              {t.common.actions.back}
            </Button>
            <Button variant="primary" size="lg" disabled={!model || model.fit === 'sigmaz'} onClick={() => void startDownload()}>
              {model?.installed
                ? t.setup.model.continueWithModel
                : model
                  ? t.setup.model.downloadWithSize(formatGb(model.sizeGb))
                  : t.setup.model.download}
            </Button>
          </>
        }
      >
        {rec ? (
          <ModelPicker rec={rec} selectedId={modelId} onSelect={setModelId} />
        ) : (
          !error && <p className="text-sm text-ink-3">{t.setup.model.preparing}</p>
        )}
        {hw && model && !model.installed && hw.diskFreeGb < model.sizeGb + 2 && (
          <div className="mt-4">
            <Notice tone="warn">{t.setup.model.lowDisk(formatGb(hw.diskFreeGb), formatGb(model.sizeGb))}</Notice>
          </div>
        )}
        {errorBox}
      </Shell>
    )
  }

  if (step === 4) {
    const remaining = pull && pull.bytesPerSec > 0 ? (pull.totalBytes - pull.completedBytes) / pull.bytesPerSec : 0
    const paused = pullState === 'paused'
    return (
      <Shell
        step={4}
        title={
          paused
            ? t.setup.download.titlePaused
            : t.setup.download.titleDownloading(model?.name ?? t.setup.download.modelFallback)
        }
        lead={t.setup.download.lead}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (!paused) void pauseDownload()
                go(3)
              }}
            >
              {t.setup.download.chooseAnother}
            </Button>
            {paused ? (
              <Button variant="primary" size="lg" onClick={() => void startDownload()}>
                <Play size={16} aria-hidden />
                {t.setup.download.resume}
              </Button>
            ) : (
              <Button size="lg" onClick={() => void pauseDownload()}>
                <Pause size={16} aria-hidden />
                {t.setup.download.pause}
              </Button>
            )}
          </>
        }
      >
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <span className="font-display text-[44px] leading-none font-semibold tracking-tight text-ink tabular-nums">
              {t.setup.download.percent(Math.floor(pull?.percent ?? 0))}
            </span>
            <span className="pb-1 text-right text-[13px] text-ink-3 tabular-nums">
              {pull && pull.totalBytes > 0
                ? `${formatBytes(pull.completedBytes)} / ${formatBytes(pull.totalBytes)}`
                : t.setup.download.connecting}
              {!paused && pull && pull.bytesPerSec > 0 && (
                <>
                  <br />
                  {t.setup.download.rate(formatBytes(pull.bytesPerSec), formatDuration(remaining))}
                </>
              )}
            </span>
          </div>
          <ProgressBar percent={pull?.percent ?? 0} />
        </div>
        {errorBox}
      </Shell>
    )
  }

  if (step === 5) {
    const speed = bench ? speedLabel(bench.tokensPerSec) : null
    return (
      <Shell
        step={5}
        title={bench ? t.setup.benchmark.titleDone : t.setup.benchmark.titleMeasuring}
        lead={bench ? undefined : t.setup.benchmark.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(3)}>
              {t.setup.download.chooseAnother}
            </Button>
            <Button variant="primary" size="lg" disabled={!bench && !error} onClick={() => go(6)}>
              {t.common.actions.continue}
            </Button>
          </>
        }
      >
        {bench && speed && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-end gap-4">
                <span className="font-display text-[44px] leading-none font-semibold tracking-tight text-ink tabular-nums">
                  ~{wordsPerSec(bench.tokensPerSec)}
                </span>
                <span className="pb-1 text-sm text-ink-2">{t.setup.benchmark.wordsPerSecond}</span>
                <span
                  className={cn(
                    'mb-1 ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-medium',
                    speed.tone === 'good' && 'bg-teal-soft text-teal',
                    speed.tone === 'ok' && 'bg-accent-soft text-accent',
                    speed.tone === 'slow' && 'bg-warn-soft text-warn'
                  )}
                >
                  {speed.label}
                </span>
              </div>
              {bench.sample && (
                <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-ink-2">{bench.sample}</p>
              )}
            </div>
            {speed.tone === 'slow' && (
              <Notice tone="warn">{t.setup.benchmark.slowNotice}</Notice>
            )}
          </div>
        )}
        {errorBox}
      </Shell>
    )
  }

  if (step === 6) {
    const update =
      (key: 'userName' | 'jobTitle' | 'company' | 'signature') =>
      (e: { target: { value: string } }): void =>
        setProfile((p) => ({ ...p, [key]: e.target.value }))
    return (
      <Shell
        step={6}
        title={t.setup.profile.title}
        lead={t.setup.profile.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(5)}>
              {t.common.actions.back}
            </Button>
            <Button variant="primary" size="lg" onClick={() => go(7)}>
              {t.common.actions.continue}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="max-w-[320px]">
            <Field label={t.setup.profile.name}>
              <Input
                value={profile.userName}
                onChange={update('userName')}
                placeholder={t.setup.profile.namePlaceholder}
                autoFocus
              />
            </Field>
          </div>

          <CheckCard
            checked={profile.corporateMode}
            onChange={(corporateMode) => setProfile((p) => ({ ...p, corporateMode }))}
            title={t.setup.profile.corporateTitle}
            description={t.setup.profile.corporateDescription}
          />

          {profile.corporateMode && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={t.setup.profile.jobTitle}>
                <Input
                  value={profile.jobTitle}
                  onChange={update('jobTitle')}
                  placeholder={t.setup.profile.jobTitlePlaceholder}
                  autoFocus
                />
              </Field>
              <Field label={t.setup.profile.company}>
                <Input value={profile.company} onChange={update('company')} placeholder={t.setup.profile.companyPlaceholder} />
              </Field>
              <div className="col-span-2">
                <Field label={t.setup.profile.signature} hint={t.setup.profile.signatureHint}>
                  <Textarea
                    rows={3}
                    value={profile.signature}
                    onChange={update('signature')}
                    placeholder={t.setup.profile.signaturePlaceholder}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  if (step === 7) {
    const points: { icon: ReactNode; title: string; text: string; extra?: string }[] = [
      {
        icon: <DatabaseZap size={18} aria-hidden />,
        ...t.setup.privacy.stored,
        extra: dataPath
      },
      {
        icon: <WifiOff size={18} aria-hidden />,
        ...t.setup.privacy.local
      },
      {
        icon: <EyeOff size={18} aria-hidden />,
        ...t.setup.privacy.noTelemetry
      },
      {
        icon: <Trash2 size={18} aria-hidden />,
        ...t.setup.privacy.deletion
      }
    ]
    return (
      <Shell
        step={7}
        title={t.setup.privacy.title}
        lead={t.setup.privacy.lead}
        footer={
          <>
            <Button variant="ghost" onClick={() => go(6)}>
              {t.common.actions.back}
            </Button>
            <Button variant="primary" size="lg" onClick={() => go(8)}>
              {t.setup.privacy.confirm}
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-5">
          {points.map((point) => (
            <li key={point.title} className="flex gap-4 py-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal">
                {point.icon}
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink">{point.title}</h2>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{point.text}</p>
                {point.extra && (
                  <p className="mt-1.5 font-mono text-xs break-all text-ink-3 select-text">{point.extra}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Shell>
    )
  }

  return (
    <Shell
      step={8}
      title={profile.userName ? t.setup.done.titleWithName(profile.userName) : t.setup.done.title}
      lead={t.setup.done.lead}
      footer={
        <>
          <Button variant="ghost" onClick={() => go(7)}>
            {t.common.actions.back}
          </Button>
          <Button variant="primary" size="lg" onClick={() => void finish()}>
            {t.setup.done.openFirstChat}
          </Button>
        </>
      }
    >
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-6">
        {[
          [t.setup.done.model, model?.name ?? modelId],
          [t.setup.done.speed, bench ? t.setup.done.speedValue(wordsPerSec(bench.tokensPerSec)) : t.setup.done.notMeasured],
          [t.setup.done.tier, hw ? TIER_LABEL[hw.tier] : ''],
          [t.setup.done.corporate, profile.corporateMode ? t.setup.done.on : t.setup.done.off],
          [t.setup.done.data, t.setup.done.dataValue]
        ].map(([label, value]) => (
          <div key={label} className="flex gap-4 py-3.5 text-sm">
            <dt className="w-40 shrink-0 text-ink-3">{label}</dt>
            <dd className="font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {errorBox}
    </Shell>
  )
}
