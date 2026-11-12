import { useEffect, useRef, useState } from 'react'
import ChatView from '@/components/ChatView'
import LockScreen from '@/components/LockScreen'
import SettingsDialog from '@/components/SettingsDialog'
import Sidebar from '@/components/Sidebar'
import AppRunPage from '@/pages/AppRunPage'
import AppsPage from '@/pages/AppsPage'
import CodeHome from '@/components/CodeParts'
import Setup from '@/pages/Setup'
import StudioPage from '@/pages/StudioPage'
import WhatsAppPage from '@/pages/WhatsAppPage'
import { setActiveLanguage } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import Markdown from '@/components/Markdown'
import { Button } from '@/components/ui'
import { useT } from '@/lib/useT'
import type { WhatsNew } from '@shared/types'

function useTheme(): void {
  // Kilit ekranında ayarlar henüz yüklenmemiştir; tema kilit durumundan gelir.
  const theme = useApp((s) => s.settings?.theme ?? s.lock?.theme ?? 'system')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      void window.api.app.setTitleBarTheme(dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const ready = useApp((s) => s.ready)
  const setupDone = useApp((s) => s.settings?.setupDone ?? false)
  const init = useApp((s) => s.init)
  const select = useApp((s) => s.select)
  const view = useApp((s) => s.view)
  const refreshInstalled = useApp((s) => s.refreshInstalled)
  const lock = useApp((s) => s.lock)
  const language = useApp((s) => s.settings?.language ?? s.lock?.language ?? 'tr')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null)
  const t = useT()

  // Bileşen dışındaki yardımcılar (biçimlendirme gibi) çizimden önce doğru dili görsün.
  setActiveLanguage(language)
  const searchRef = useRef<HTMLInputElement>(null)

  useTheme()

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // Önce kilit durumu okunur; sohbetler ve ayarlar ancak kilit açıkken yüklenir.
  const locked = lock?.locked
  useEffect(() => {
    void window.api.lock.state().then((state) => useApp.setState({ lock: state }))
    return window.api.lock.onChanged((state) => useApp.setState({ lock: state }))
  }, [])

  useEffect(() => {
    if (locked === false) void init()
    // Kilitlenince açık ayar penceresi de kapanır.
    if (locked) setSettingsOpen(false)
  }, [locked, init])

  // Bildirime tıklanınca ya da panelden "sohbette devam et" denince o sohbet açılır.
  useEffect(
    () =>
      window.api.app.onOpenConversation((id) => {
        const state = useApp.getState()
        void state.refreshConversations().then(() => state.select(id))
      }),
    []
  )

  // Güncellemeden sonraki ilk açılışta sürüm notları bir kez gösterilir.
  useEffect(() => {
    if (ready && setupDone) void window.api.app.whatsNew().then(setWhatsNew, () => {})
  }, [ready, setupDone])

  // Sistem tepsisindeki "Yeni sohbet"
  useEffect(
    () =>
      window.api.app.onNewChat(() => {
        useApp.getState().go({ name: 'chat' })
        void select(null)
      }),
    [select]
  )

  // Sihirbaz bitince ya da uygulama açılınca Ollama çalışmıyorsa başlat.
  useEffect(() => {
    if (!ready || !setupDone) return
    void window.api.ollama
      .start()
      .catch(() => null)
      .then(() => refreshInstalled())
  }, [ready, setupDone, refreshInstalled])

  useEffect(() => {
    if (!setupDone) return
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        void select(null)
      } else if (key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (key === 'l' && useApp.getState().lock?.enabled) {
        e.preventDefault()
        void window.api.lock.lock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setupDone, select])

  if (lock?.locked) return <LockScreen lock={lock} />
  if (!lock || !ready) return <div className="drag h-full bg-bg" />
  if (!setupDone) return <Setup key={language} />

  // Dil değişince bütün ekran yeniden kurulur; her metin yeni dilde çizilir.
  return (
    <div key={language} className="flex h-full">
      <Sidebar ref={searchRef} onOpenSettings={() => setSettingsOpen(true)} />
      {view.name === 'chat' && <ChatView />}
      {view.name === 'apps' && <AppsPage />}
      {view.name === 'code' && <CodeHome />}
      {view.name === 'run' && <AppRunPage appId={view.appId} />}
      {view.name === 'studio' && <StudioPage editId={view.editId} draft={view.draft} />}
      {view.name === 'whatsapp' && <WhatsAppPage personaId={view.personaId} />}
      {whatsNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.settings.about.whatsNewTitle(whatsNew.version)}
            className="flex max-h-[min(560px,100%)] w-full max-w-[560px] flex-col rounded-2xl border border-line bg-surface shadow-pop"
          >
            <div className="border-b border-line px-6 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{t.settings.about.whatsNewTitle(whatsNew.version)}</h2>
              <p className="text-[13px] text-ink-3">{t.settings.about.notesTitle}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <Markdown text={whatsNew.notes} />
            </div>
            <div className="flex justify-end border-t border-line px-6 py-3">
              <Button
                variant="primary"
                autoFocus
                onClick={() => {
                  setWhatsNew(null)
                  void window.api.app.dismissWhatsNew()
                }}
              >
                {t.settings.about.whatsNewClose}
              </Button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false)
            void refreshInstalled()
          }}
        />
      )}
    </div>
  )
}
