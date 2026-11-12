import { Plus, Search, Star, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MiniApp } from '@shared/types'
import { AppIconTile, PageHeader } from '@/components/AppParts'
import { Button, Notice } from '@/components/ui'
import { cn, errorText } from '@/lib/format'
import { useLocale, useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

/** Arama kutusu ancak liste bu kadar uzayınca gösterilir. */
const SEARCH_FROM = 13

function AppCard({ app }: { app: MiniApp }) {
  const t = useT()
  const go = useApp((s) => s.go)
  const loadApps = useApp((s) => s.loadApps)

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => go({ name: 'run', appId: app.id })}
        className="flex h-full w-full items-center gap-3.5 rounded-xl border border-line bg-surface p-3.5 pr-10 text-left transition-colors hover:border-accent"
      >
        <AppIconTile icon={app.icon} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{app.name}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-2">{app.description}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={app.favorite ? t.apps.gallery.removeFavoriteFor(app.name) : t.apps.gallery.addFavoriteFor(app.name)}
        aria-pressed={app.favorite}
        title={app.favorite ? t.apps.removeFavorite : t.apps.addFavorite}
        onClick={() => void window.api.apps.setFavorite(app.id, !app.favorite).then(loadApps)}
        className={cn(
          'absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-2',
          app.favorite ? 'text-warn' : 'text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        )}
      >
        <Star size={15} fill={app.favorite ? 'currentColor' : 'none'} aria-hidden />
      </button>
    </li>
  )
}

function Section({ title, apps }: { title?: string; apps: MiniApp[] }) {
  if (apps.length === 0) return null
  return (
    <section className="mb-8">
      {title && <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </ul>
    </section>
  )
}

export default function AppsPage() {
  const t = useT()
  const locale = useLocale()
  const apps = useApp((s) => s.apps)
  const corporateMode = useApp((s) => s.settings?.corporateMode ?? false)
  const go = useApp((s) => s.go)
  const loadApps = useApp((s) => s.loadApps)
  const saveSettings = useApp((s) => s.saveSettings)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void loadApps()
  }, [loadApps])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale)
    if (!q) return apps
    return apps.filter((a) => `${a.name} ${a.description}`.toLocaleLowerCase(locale).includes(q))
  }, [apps, query, locale])

  // Sık kullanılanlar en üstte; geri kalanı kendi yerinde kalır.
  const favorites = filtered.filter((a) => a.favorite)
  const mine = filtered.filter((a) => !a.builtin && !a.favorite)
  const builtin = filtered.filter((a) => a.builtin && !a.favorite)
  // Tek grup varsa başlık gereksiz kalabalık yapar.
  const groups = [favorites, mine, builtin].filter((g) => g.length > 0).length

  async function importApp(): Promise<void> {
    setError('')
    try {
      const draft = await window.api.apps.importFile()
      // İçe aktarılan uygulama kaydedilmeden önce düzenleyicide incelenir.
      if (draft) go({ name: 'studio', draft })
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface">
      <PageHeader
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void importApp()}>
              <Upload size={15} aria-hidden />
              {t.apps.gallery.importApp}
            </Button>
            <Button size="sm" variant="primary" onClick={() => go({ name: 'studio' })}>
              <Plus size={16} aria-hidden />
              {t.apps.gallery.newApp}
            </Button>
          </>
        }
      >
        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">{t.apps.gallery.title}</h1>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-6 py-6">
          {apps.length >= SEARCH_FROM && (
            <div className="relative mb-6 max-w-[380px]">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.apps.gallery.search}
                aria-label={t.apps.gallery.search}
                className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="mb-6">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          {filtered.length === 0 && query.trim() ? (
            <p className="text-sm text-ink-3">{t.apps.gallery.noMatch(query.trim())}</p>
          ) : (
            <>
              <Section title={groups > 1 ? t.apps.gallery.favorites : undefined} apps={favorites} />
              <Section title={groups > 1 ? t.apps.gallery.mine : undefined} apps={mine} />
              <Section title={groups > 1 ? t.apps.gallery.builtin : undefined} apps={builtin} />
            </>
          )}

          {!corporateMode && !query.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-line px-5 py-4">
              <p className="max-w-[56ch] text-[13px] leading-relaxed text-ink-2">
                {t.apps.gallery.corporateNote}
              </p>
              <Button size="sm" onClick={() => void saveSettings({ corporateMode: true })}>
                {t.apps.gallery.enableCorporate}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
