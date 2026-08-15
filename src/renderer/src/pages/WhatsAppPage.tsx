import { ArrowLeft, FileUp, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Dict } from '@shared/i18n'
import type { Level, Persona, WaPreview, WaProfile, WaProgress, WaStats } from '@shared/types'
import { PageHeader, Select } from '@/components/AppParts'
import { PersonaAvatar } from '@/components/PersonaParts'
import { Button, CheckCard, Field, IconButton, Notice, ProgressBar } from '@/components/ui'
import { filesFrom } from '@/lib/files'
import { cn, errorText } from '@/lib/format'
import { useLocale, useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

function monthYear(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/** Sayıları okunur cümlelere çevirir. */
function describe(stats: WaStats, t: Dict, locale: string): [string, string][] {
  const s = t.whatsapp.stats
  const decimal = (x: number): string => x.toLocaleString(locale, { maximumFractionDigits: 1 })
  return [
    [s.length.label, s.length.average(decimal(stats.avgWords))],
    [
      s.burst.label,
      stats.burstTypical
        ? stats.burstTypical[0] === stats.burstTypical[1]
          ? s.burst.mostly(stats.burstTypical[1])
          : s.burst.mostlyRange(stats.burstTypical[0], stats.burstTypical[1])
        : s.burst.average(decimal(stats.avgBurst))
    ],
    [s.capitals.label, stats.lowercaseStart >= 0.7 ? s.capitals.no : stats.lowercaseStart <= 0.25 ? s.capitals.yes : s.sometimes],
    [s.period.label, stats.endPunctuation <= 0.15 ? s.period.no : stats.endPunctuation >= 0.5 ? s.period.yes : s.sometimes],
    [
      s.question.label,
      stats.questionMark === undefined
        ? s.unclear
        : stats.questionMark <= 0.2
          ? s.question.no
          : stats.questionMark >= 0.7
            ? s.question.yes
            : s.sometimes
    ],
    [s.turkishChars.label, stats.turkishChars <= 0.25 ? s.turkishChars.no : s.turkishChars.yes],
    [s.emoji.label, stats.emojiRate <= 0.03 ? s.emoji.rare : s.emoji.rate(Math.round(stats.emojiRate * 100), stats.topEmojis.join(' '))],
    [s.laughter.label, stats.laughter || s.unclear],
    [s.address.label, stats.address.join(', ') || s.unclear]
  ]
}

function StyleSheet({ persona, profile, onChanged }: { persona: Persona; profile: WaProfile; onChanged(): void }) {
  const select = useApp((s) => s.select)
  const setDraft = useApp((s) => s.setDraft)
  const go = useApp((s) => s.go)
  const t = useT()
  const locale = useLocale()
  const { stats } = profile
  const similarity = t.whatsapp.sheet.similarity

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-4 bg-accent px-6 py-6 text-accent-ink">
          <PersonaAvatar icon={persona.icon} letter={persona.name} size={56} />
          <div className="min-w-0">
            <p className="text-[13px] opacity-80">{t.whatsapp.sheet.learned}</p>
            <h2 className="truncate font-display text-[40px] leading-none font-semibold tracking-tight">{persona.name}</h2>
          </div>
        </div>
        <p className="border-b border-line px-6 py-3.5 text-sm text-ink-2">
          {t.whatsapp.sheet.summary(
            stats.messages.toLocaleString(locale),
            profile.examples.toLocaleString(locale),
            monthYear(profile.from, locale),
            monthYear(profile.to, locale),
            persona.name
          )}
        </p>

        <dl className="grid grid-cols-2 gap-x-8 px-6 py-2">
          {describe(stats, t, locale).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-3 border-b border-line py-2.5">
              <dt className="w-36 shrink-0 text-[13px] text-ink-3">{label}</dt>
              <dd className="min-w-0 text-sm font-medium break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {stats.topWords.length > 0 && (
          <div className="px-6 pt-4">
            <h3 className="mb-2 text-[13px] text-ink-3">{t.whatsapp.sheet.topWords}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {[...stats.topPhrases, ...stats.topWords].slice(0, 16).map((word) => (
                <li key={word} className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-ink">
                  {word}
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.summary && (
          <div className="px-6 pt-5">
            <h3 className="mb-1.5 text-[13px] text-ink-3">{t.whatsapp.sheet.style}</h3>
            <p className="max-w-[64ch] text-sm leading-relaxed text-ink-2">{profile.summary}</p>
          </div>
        )}

        <div className="px-6 pt-5 pb-6">
          <h3 className="mb-2 text-[13px] text-ink-3">{t.whatsapp.sheet.samples}</h3>
          <div className="flex flex-col items-start gap-1.5">
            {stats.samples.slice(0, 5).map((sample, i) => (
              <div
                key={i}
                className="max-w-[80%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-ink"
              >
                {sample}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-7">
        <h3 className="text-sm font-semibold text-ink">{t.whatsapp.sheet.similarityTitle}</h3>
        <div role="radiogroup" aria-label={t.whatsapp.sheet.similarityLabel} className="mt-2 inline-flex rounded-lg border border-line bg-bg p-1">
          {similarity.map((option, level) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={profile.similarity === level}
              onClick={() => void window.api.whatsapp.setSimilarity(persona.id, level as Level).then(onChanged)}
              className={cn(
                'h-8 rounded-md px-3.5 text-[13px] font-medium transition-colors',
                profile.similarity === level ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">{similarity[profile.similarity]?.hint}</p>
      </section>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            setDraft({ personaId: persona.id, private: false })
            void select(null)
          }}
        >
          {t.whatsapp.sheet.startChat(persona.name)}
        </Button>
        <Button variant="ghost" onClick={() => go({ name: 'whatsapp' })}>
          {t.whatsapp.sheet.addConversation}
        </Button>
      </div>
    </div>
  )
}

export default function WhatsAppPage({ personaId }: { personaId?: string }) {
  const t = useT()
  const locale = useLocale()
  const personas = useApp((s) => s.personas)
  const loadPersonas = useApp((s) => s.loadPersonas)
  const userName = useApp((s) => s.settings?.userName ?? '')
  const select = useApp((s) => s.select)
  const go = useApp((s) => s.go)

  const [preview, setPreview] = useState<WaPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [target, setTarget] = useState('')
  const [self, setSelf] = useState('')
  const [merge, setMerge] = useState(true)
  const [progress, setProgress] = useState<WaProgress | null>(null)
  const [building, setBuilding] = useState(false)
  const [profile, setProfile] = useState<WaProfile | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const persona = personas.find((p) => p.id === (profile?.personaId ?? personaId))
  /** Aynı adla daha önce öğrenilmiş bir kişi varsa yeni konuşma ona eklenebilir. */
  const existing = personas.find((p) => p.whatsapp && p.name === target.slice(0, 40))

  useEffect(() => window.api.whatsapp.onProgress(setProgress), [])

  // Var olan bir kişinin tarzını göstermek için açıldıysa.
  useEffect(() => {
    setPreview(null)
    setError('')
    if (!personaId) {
      setProfile(null)
      return
    }
    void window.api.whatsapp.profile(personaId).then(setProfile, (e) => setError(errorText(e)))
  }, [personaId])

  async function read(file: File | undefined): Promise<void> {
    if (!file) return
    setError('')
    setReading(true)
    try {
      const result = await window.api.whatsapp.parse(file.name, await file.arrayBuffer())
      setPreview(result)
      const names = result.participants.map((p) => p.name)
      // Kullanıcının adı sohbette geçiyorsa o kendisidir; diğeri taklit edilecek kişidir.
      const me = names.find((n) => userName && n.toLocaleLowerCase('tr').includes(userName.toLocaleLowerCase('tr')))
      const other = names.find((n) => n !== me) ?? names[0]
      setTarget(other)
      setSelf(me ?? names.find((n) => n !== other) ?? '')
    } catch (e) {
      setError(errorText(e))
    }
    setReading(false)
  }

  async function build(): Promise<void> {
    if (!preview) return
    setError('')
    setBuilding(true)
    setProgress({ stage: 'analiz', percent: 0 })
    try {
      const built = await window.api.whatsapp.build({
        importId: preview.importId,
        target,
        self,
        mergeInto: existing && merge ? existing.id : undefined
      })
      await loadPersonas()
      setProfile(await window.api.whatsapp.profile(built.id))
      setPreview(null)
    } catch (e) {
      setError(errorText(e))
    }
    setBuilding(false)
  }

  const refreshProfile = (): void => {
    if (profile) void window.api.whatsapp.profile(profile.personaId).then(setProfile)
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      <PageHeader>
        <IconButton label={t.whatsapp.backToChat} onClick={() => void select(null)}>
          <ArrowLeft size={17} aria-hidden />
        </IconButton>
        <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink">
          {persona && profile ? t.whatsapp.styleTitle(persona.name) : t.whatsapp.pageTitle}
        </h1>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {persona && profile && !preview ? (
          <StyleSheet persona={persona} profile={profile} onChanged={refreshProfile} />
        ) : building ? (
          <div className="mx-auto w-full max-w-[560px] px-6 py-16">
            <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">
              {t.whatsapp.building.title(target)}
            </h2>
            <p className="mt-2 text-sm text-ink-2">{t.whatsapp.building.lead}</p>
            <div className="mt-8 space-y-2">
              <ProgressBar percent={progress?.percent ?? 0} />
              <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
                <LoaderCircle size={14} className="spin" aria-hidden />
                {progress
                  ? t.whatsapp.building.progress(t.whatsapp.building.stage[progress.stage], Math.round(progress.percent))
                  : t.whatsapp.building.starting}
              </p>
            </div>
          </div>
        ) : preview ? (
          <div className="mx-auto w-full max-w-[640px] px-6 py-8">
            <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">{t.whatsapp.pick.title}</h2>
            <p className="mt-2 text-sm text-ink-2">
              {t.whatsapp.pick.summary(
                preview.fileName,
                preview.total.toLocaleString(locale),
                monthYear(preview.from, locale),
                monthYear(preview.to, locale)
              )}
            </p>

            <div role="radiogroup" aria-label={t.whatsapp.pick.targetLabel} className="mt-6 space-y-2">
              {preview.participants.slice(0, 12).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  role="radio"
                  aria-checked={target === p.name}
                  onClick={() => {
                    setTarget(p.name)
                    if (self === p.name) setSelf(preview.participants.find((x) => x.name !== p.name)?.name ?? '')
                  }}
                  className={cn(
                    'flex w-full items-center gap-3.5 rounded-xl border bg-surface px-4 py-3 text-left transition-colors',
                    target === p.name ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-ink-3'
                  )}
                >
                  <PersonaAvatar icon="heart" letter={p.name} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  <span className="shrink-0 text-[13px] text-ink-3 tabular-nums">{t.whatsapp.pick.messageCount(p.count, p.count.toLocaleString(locale))}</span>
                </button>
              ))}
            </div>

            {preview.participants.length > 1 && (
              <div className="mt-5 max-w-[320px]">
                <Field label={t.whatsapp.pick.selfLabel}>
                  <Select value={self} onChange={(e) => setSelf(e.target.value)}>
                    {preview.participants
                      .filter((p) => p.name !== target)
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            )}

            {existing && (
              <div className="mt-5">
                <CheckCard
                  checked={merge}
                  onChange={setMerge}
                  title={t.whatsapp.pick.mergeTitle(existing.name)}
                  description={t.whatsapp.pick.mergeDescription}
                />
              </div>
            )}

            {error && (
              <div className="mt-5">
                <Notice tone="danger">{error}</Notice>
              </div>
            )}

            <div className="mt-7 flex items-center gap-3">
              <Button variant="primary" size="lg" disabled={!target} onClick={() => void build()}>
                {t.whatsapp.pick.learn}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                {t.whatsapp.pick.otherFile}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[640px] px-6 py-8">
            <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">
              {t.whatsapp.intro.title}
            </h2>
            <p className="mt-2 max-w-[58ch] text-sm text-ink-2">
              {t.whatsapp.intro.lead}
            </p>

            <ol className="mt-6 space-y-2.5 text-sm text-ink-2">
              {t.whatsapp.intro.steps.map((line, i) => (
                <li key={line} className="flex gap-3.5">
                  <span className="font-display text-base leading-5 font-semibold text-accent">{i + 1}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>

            <input
              ref={input}
              type="file"
              accept=".txt,.zip"
              className="hidden"
              onChange={(e) => {
                void read(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={reading}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void read(filesFrom(e.dataTransfer)[0])
              }}
              className={cn(
                'mt-7 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors',
                dragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'
              )}
            >
              {reading ? (
                <LoaderCircle size={26} className="spin text-accent" aria-hidden />
              ) : (
                <FileUp size={26} className="text-accent" aria-hidden />
              )}
              <span className="text-[15px] font-semibold text-ink">{reading ? t.whatsapp.intro.reading : t.whatsapp.intro.drop}</span>
              <span className="text-[13px] text-ink-3">{t.whatsapp.intro.fileTypes}</span>
            </button>

            {error && (
              <div className="mt-5">
                <Notice tone="danger">{error}</Notice>
              </div>
            )}

            {personas.some((p) => p.whatsapp) && (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="mb-2 text-[13px] font-semibold text-ink">{t.whatsapp.intro.learnedBefore}</h3>
                <ul className="space-y-1">
                  {personas
                    .filter((p) => p.whatsapp)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => go({ name: 'whatsapp', personaId: p.id })}
                          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                        >
                          <PersonaAvatar icon={p.icon} letter={p.name} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                            <span className="block truncate text-xs text-ink-3">{p.tagline}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
