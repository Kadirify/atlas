import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { ensureRunning, listLoaded, unloadModel } from './services/ollama'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, powerMonitor, screen, session, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { langFromLocale } from '@shared/i18n'
import { attachmentBudgetFor, Db, setAttachmentBudget } from './db'
import { restoreBounds, type WindowState } from './windowState'
import { toolContextSize } from './services/hardware'
import { getLanguage, setLanguage } from './i18n'
import { BUNDLED_RECIPES_VERSION } from './services/catalog'
import { loadSavedRecipes } from './services/updates'
import { broadcast, registerIpc } from './ipc'
import { builtinApps } from './services/builtinApps'
import { ChatService } from './services/chat'
import { FilesService } from './services/files'
import { JobService } from './services/jobs'
import { LockService } from './services/lock'
import { applyLaunchAtLogin, AtlasTray } from './tray'
import { AtlasPanel } from './panel'
import { L } from './i18n'
import { MemoryService } from './services/memory'
import { WhatsAppService } from './services/whatsapp'
import { initSql } from './services/sql'
import { flushLog, initLog, log, watchEventLoop } from './log'
import { SnapshotStore } from './services/snapshot'
import { isSecretFile } from './services/code'

const TITLE_BAR_HEIGHT = 40
const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

const DB_FILE = 'atlas.db'

// Otomatik testler ayrı bir veri klasörüyle çalışabilsin diye.
const testUserData = process.env.ATLAS_USER_DATA
// "Atlas" adını başka programlar da kullandığı için veri klasörü ayrı adlandırılır.
app.setPath('userData', testUserData || join(app.getPath('appData'), 'Atlas Asistan'))

// Windows görev çubuğunda doğru ad ve ikonla gruplansın.
app.setAppUserModelId('com.atlasasistan.app')

// Kayıt dosyası: hata bildirimine eklenebilsin diye yakalanmamış hatalar, çökmeler ve donmalar yazılır.
initLog(join(app.getPath('userData'), 'logs'), { echo: !app.isPackaged })
process.on('uncaughtException', (err) => log('error', 'Uncaught exception', err))
process.on('unhandledRejection', (reason) => log('error', 'Unhandled rejection', reason))
app.on('child-process-gone', (_event, d) => {
  if (d.reason !== 'clean-exit') log('error', `Child process gone: ${d.type}${d.name ? ` (${d.name})` : ''}, ${d.reason}, exit code ${d.exitCode}`)
})

/** Uygulamanın adı "Chat System" iken oluşmuş veriyi yeni klasöre bir kez kopyalar. */
function migrateOldData(dbPath: string): void {
  if (testUserData || existsSync(dbPath)) return
  const old = join(app.getPath('appData'), 'Chat System', 'chat-system.db')
  if (!existsSync(old)) return
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(old + suffix)) copyFileSync(old + suffix, dbPath + suffix)
  }
}

let mainWindow: BrowserWindow | null = null
/** Çöken sayfanın en son yeniden yüklendiği an */
let lastReload = 0
/** Kaydedilmiş pencere yeri ve yazı boyutu; veritabanı açılınca bağlanır. */
let loadWindowState: () => WindowState | null = () => null
let saveWindowState: (state: WindowState) => void = () => {}
let zoomFactor: () => number = () => 1
/** Pencere gizli başladıysa (tepside) ekranı kaplama ilk gösterimde yapılır. */
let maximizeOnShow = false
/** Taşıma ve boyutlandırma bitince yeri saklamak için bekleyen zamanlayıcı */
let persistTimer: NodeJS.Timeout | undefined

/** Pencerenin yerini ve boyutunu saklar; bir sonraki açılışta aynı yerde açılır. */
function persistWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    saveWindowState({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() })
  } catch {
    // Kapanışta veritabanı çoktan kapanmış olabilir; yer o zaman daha önce saklanmıştır.
  }
}
/** Kullanıcı gerçekten çıkmak istedi (tepsi menüsü, sistem kapanışı); pencere tepsiye gizlenmez. */
let quitting = false
/** Pencere kapatılmak istendiğinde tepsiye gizlenecekse gizler ve true döner. */
let hideToTray: () => boolean = () => false
// Bilgisayar açılışında başlatıldıysa pencere gösterilmez, Atlas tepside bekler.
const startHidden = process.argv.includes('--hidden')

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(true)
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (maximizeOnShow) {
    maximizeOnShow = false
    mainWindow.maximize()
  }
  mainWindow.show()
  mainWindow.focus()
}

function overlayColors(dark: boolean): { color: string; symbolColor: string; height: number } {
  return dark
    ? { color: '#00000000', symbolColor: '#c9d1e3', height: TITLE_BAR_HEIGHT }
    : { color: '#00000000', symbolColor: '#3a4256', height: TITLE_BAR_HEIGHT }
}

function setTitleBarTheme(dark: boolean): void {
  if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitleBarOverlay(overlayColors(dark))
  mainWindow.setBackgroundColor(dark ? '#0e1320' : '#f4f6fa')
}

function createWindow(show: boolean): void {
  const dark = nativeTheme.shouldUseDarkColors
  const state = loadWindowState()
  mainWindow = new BrowserWindow({
    width: state?.width ?? 1240,
    height: state?.height ?? 820,
    ...(state ? { x: state.x, y: state.y } : {}),
    minWidth: 760,
    minHeight: 560,
    show: false,
    icon,
    backgroundColor: dark ? '#0e1320' : '#f4f6fa',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : overlayColors(dark),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!show) {
      maximizeOnShow = state?.maximized === true
      return
    }
    if (state?.maximized) mainWindow?.maximize()
    mainWindow?.show()
  })
  // Yazı boyutu (yakınlaştırma) her yüklemede yeniden uygulanır.
  mainWindow.webContents.on('did-finish-load', () => mainWindow?.webContents.setZoomFactor(zoomFactor()))
  mainWindow.on('unresponsive', () => log('warn', 'Main window is not responding'))
  mainWindow.on('responsive', () => log('info', 'Main window is responding again'))
  // Sayfa çökerse boş pencere kalmasın: yeniden yüklenir (art arda çöküyorsa dakikada bir kez).
  mainWindow.webContents.on('render-process-gone', (_event, d) => {
    log('error', `Main window renderer gone: ${d.reason}, exit code ${d.exitCode}`)
    if (d.reason === 'clean-exit' || Date.now() - lastReload < 60_000) return
    lastReload = Date.now()
    const win = mainWindow
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.reload()
    }, 500)
  })
  mainWindow.on('close', (event) => {
    persistWindow()
    if (!quitting && hideToTray()) event.preventDefault()
  })
  // Yer yalnızca kapanışta değil, pencere taşındıkça ve boyutu değiştikçe de saklanır: uygulama çökerse ya da görev
  // yöneticisinden kapatılırsa son yer kaybolmasın. Art arda gelen olaylar tek kayıtta toplanır.
  const schedulePersist = (): void => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persistWindow, 500)
  }
  for (const event of ['move', 'resize', 'maximize', 'unmaximize'] as const) mainWindow.on(event as 'move', schedulePersist)
  mainWindow.on('closed', () => {
    clearTimeout(persistTimer)
    mainWindow = null
    // Panel penceresi açık kalsa da ana pencere kapandıysa (tepsiye gizlenmediyse) uygulama kapanır.
    if (process.platform !== 'darwin') app.quit()
  })

  // Sohbetteki bağlantılar uygulamanın içinde değil, tarayıcıda açılır.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL!)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (isDev) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Atlas tepsideyken yeniden çalıştırılırsa pencere geri gelir.
  app.on('second-instance', () => {
    if (app.isReady()) showWindow()
  })

  /** Hitap ve kapanış hâlâ öbür dilin varsayılanındaysa geçerli dilin varsayılanına çevirir; kullanıcının kendi yazdığına dokunmaz. */
  const CORRESPONDENCE = { tr: { salutation: 'Sayın', closing: 'Saygılarımla' }, en: { salutation: 'Dear', closing: 'Best regards' } }
  function alignCorrespondence(db: Db): void {
    const lang = getLanguage()
    const other = CORRESPONDENCE[lang === 'tr' ? 'en' : 'tr']
    const s = db.getSettings()
    if (s.salutation === other.salutation) db.setSettings({ salutation: CORRESPONDENCE[lang].salutation })
    if (s.closing === other.closing) db.setSettings({ closing: CORRESPONDENCE[lang].closing })
  }

  void app.whenReady().then(() => {
    log('info', `Atlas ${app.getVersion()} started (Electron ${process.versions.electron}, ${process.platform} ${process.getSystemVersion()}, ${app.isPackaged ? 'installed' : 'development'})`)
    // Paketli sürümde Electron'un varsayılan menüsü (yeniden yükleme, geliştirici araçları kısayolları) kaldırılır.
    if (app.isPackaged) Menu.setApplicationMenu(null)
    // Sayfalar hiçbir izin (kamera, mikrofon, konum...) istemez; yalnızca panoya kopyalama açıktır.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')
    const userData = app.getPath('userData')
    mkdirSync(userData, { recursive: true })
    const dbPath = join(userData, DB_FILE)
    migrateOldData(dbPath)
    // Şema güncellenecekse önce veritabanının kopyası "backups" klasörüne alınır.
    const db = new Db(dbPath, { backupDir: join(userData, 'backups') })
    loadWindowState = () => {
      try {
        return restoreBounds(
          JSON.parse(db.getInternal('windowState') ?? 'null'),
          screen.getAllDisplays().map((d) => d.workArea),
          { width: 760, height: 560 }
        )
      } catch {
        return null
      }
    }
    saveWindowState = (state) => db.setInternal('windowState', JSON.stringify(state))
    zoomFactor = () => db.getSettings().zoom
    // Belge payı ekran kartına göre belirlenir: ek etiketindeki "baş kısmı okunur" uyarısı gerçek sınırı göstersin.
    void toolContextSize().then(
      (ctx) => setAttachmentBudget(attachmentBudgetFor(ctx)),
      () => undefined
    )
    // İlk açılışta dil, işletim sisteminin diline göre seçilir; sonrasında kullanıcının seçimi geçerlidir.
    if (!db.hasSetting('language')) db.setSettings({ language: langFromLocale(app.getLocale()) })
    setLanguage(db.getSettings().language)
    alignCorrespondence(db)
    loadSavedRecipes(userData, BUNDLED_RECIPES_VERSION)
    db.purgePendingAttachments()
    db.purgePrivateConversations()
    db.syncBuiltinApps(builtinApps(getLanguage()))
    const memory = new MemoryService(db)
    const whatsapp = new WhatsAppService(db, memory)
    // Komutlar için güvenli kip: komuttan önceki dosyalar burada saklanır. Dolaşan profille (Roaming) sunuculara
    // taşınmasın diye yerel uygulama verisinde durur.
    const snapshots = new SnapshotStore(
      testUserData || !process.env.LOCALAPPDATA ? join(userData, 'snapshots') : join(process.env.LOCALAPPDATA, 'Atlas Asistan', 'snapshots'),
      isSecretFile
    )
    const files = new FilesService(
      db,
      {
        approval: (a) => {
          broadcast('folders:approval', a)
          notifyApproval(a.conversationId)
        },
        commandOutput: (e) => broadcast('folders:commandOutput', e),
        indexProgress: (p) => broadcast('folders:indexProgress', p)
      },
      memory,
      snapshots
    )
    // Artık hiçbir geri alma kaydının kullanmadığı eski dosya kopyaları silinir.
    void files.pruneSnapshots().then((n) => n > 0 && log('info', `Removed ${n} unused snapshot files`), (err) => log('warn', 'Snapshot cleanup failed', err))
    initSql(db, {
      approval: (a) => {
        broadcast('sql:approval', a)
        notifyApproval(a.conversationId)
      },
      result: (e) => broadcast('sql:result', e)
    })
    /** Cevabı yazılmakta olan sohbetler; tepsi simgesindeki "yazıyor" işareti için */
    const writing = new Set<string>()
    const setWriting = (conversationId: string, on: boolean): void => {
      if (on === writing.has(conversationId)) return
      if (on) writing.add(conversationId)
      else writing.delete(conversationId)
      tray.refresh()
    }
    /** Atlas penceresi önde değilken biten cevabı Windows bildirimiyle haber verir. */
    const notifyReply = (conversationId: string, text: string | null): void => {
      if (!db.getSettings().notifyWhenDone) return
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) return
      const t = L().main.notify
      const conversation = db.getConversation(conversationId)
      const title = text === null ? t.replyFailed : t.replyReady
      // Kilitliyken sohbetin adı ve cevabın içeriği bildirimde görünmez.
      const body = lock.isLocked()
        ? t.replyReadyLocked
        : [conversation?.title, text?.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)].filter(Boolean).join('\n')
      tray.notify(title, body, () => {
        showWindow()
        broadcast('app:openConversation', conversationId)
      })
    }
    /** Atlas penceresi önde değilken bir işlem onay bekliyorsa haber verir; yoksa cevap sessizce sonsuza kadar bekler. */
    function notifyApproval(conversationId: string): void {
      if (!db.getSettings().notifyWhenDone) return
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) return
      const t = L().main.notify
      const conversation = db.getConversation(conversationId)
      tray.notify(t.approvalNeeded, lock.isLocked() ? t.approvalNeededLocked : (conversation?.title ?? ''), () => {
        showWindow()
        broadcast('app:openConversation', conversationId)
      })
    }
    const chat = new ChatService(db, {
      chunk: (c) => {
        setWriting(c.conversationId, true)
        broadcast('chat:chunk', c)
      },
      done: (d) => {
        setWriting(d.conversationId, false)
        broadcast('chat:done', d)
        notifyReply(d.conversationId, d.message.content)
      },
      error: (e) => {
        setWriting(e.conversationId, false)
        log('warn', 'Reply failed', e.error)
        broadcast('chat:error', e)
        notifyReply(e.conversationId, null)
      },
      conversationUpdated: (c) => broadcast('conversations:updated', c),
      learned: (e) => broadcast('memory:learned', e),
      step: (e) => broadcast('chat:step', e),
      thinking: (c) => broadcast('chat:thinking', c)
    }, memory, whatsapp, files)
    const jobs = new JobService({
      chunk: (c) => broadcast('jobs:chunk', c),
      done: (d) => broadcast('jobs:done', d),
      error: (e) => broadcast('jobs:error', e)
    })
    const lock = new LockService(db, (state) => {
      broadcast('lock:changed', state)
      tray.refresh()
    })
    const tray = new AtlasTray(
      icon,
      {
        show: showWindow,
        newChat: () => {
          showWindow()
          broadcast('app:newChat', null)
        },
        quickAsk: () => panel.openAsk(),
        lock: () => void lock.lock(),
        unloadModels: () => void listLoaded().then((models) => Promise.all(models.map((m) => unloadModel(m.name)))),
        quit: () => {
          quitting = true
          app.quit()
        },
        setLaunchAtLogin: (on) => {
          db.setSettings({ launchAtLogin: on })
          applyLaunchAtLogin(on)
          tray.refresh()
        }
      },
      () => ({
        lockEnabled: lock.enabled(),
        locked: lock.isLocked(),
        launchAtLogin: db.getSettings().launchAtLogin,
        writing: writing.size > 0
      })
    )
    const panel = new AtlasPanel(icon, () => db.getSettings())
    tray.create()
    applyLaunchAtLogin(db.getSettings().launchAtLogin)

    hideToTray = () => {
      const settings = db.getSettings()
      // Kurulum bitmeden ya da tepsi yokken pencereyi kapatmak uygulamayı kapatır.
      if (!settings.closeToTray || !settings.setupDone || !tray.available()) return false
      mainWindow?.hide()
      // Pencere gözden kalkınca kilit de devreye girer: tepsiden açan kişi şifreyi yazmalıdır.
      lock.lock()
      if (!db.getInternal('trayNoticeShown')) {
        db.setInternal('trayNoticeShown', '1')
        tray.notifyHidden()
      }
      return true
    }

    // Bilgisayar boş kalınca ya da Windows oturumu kilitlenince Atlas da kilitlenir.
    powerMonitor.on('lock-screen', () => void lock.lock())
    // Ana süreç donarsa (uzun süren bir iş arayüzü bekletirse) kayda geçer; uykuda geçen süre sayılmaz.
    let lastSuspend = 0
    powerMonitor.on('suspend', () => (lastSuspend = Date.now()))
    const stopWatching = watchEventLoop(() => lastSuspend)
    const idleTimer = setInterval(() => {
      const minutes = db.getSettings().lockAfterMinutes
      if (minutes > 0 && lock.enabled() && !lock.isLocked() && powerMonitor.getSystemIdleTime() >= minutes * 60) lock.lock()
    }, 15_000)

    registerIpc(
      db,
      chat,
      jobs,
      memory,
      whatsapp,
      files,
      setTitleBarTheme,
      (lang) => {
        setLanguage(lang)
        alignCorrespondence(db)
        // Hazır uygulamaların adları ve talimatları dile göre değişir.
        db.syncBuiltinApps(builtinApps(getLanguage()))
      },
      {
        lock,
        panel,
        settingsChanged: (patch) => {
          if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(patch.launchAtLogin)
          if (patch.zoom !== undefined && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setZoomFactor(patch.zoom)
          if ('quickShortcut' in patch || 'selectionShortcut' in patch || 'setupDone' in patch) panel.registerShortcuts()
          tray.refresh()
        },
        showMain: showWindow,
        openConversation: (id) => {
          showWindow()
          broadcast('app:openConversation', id)
        },
        quit: () => {
          quitting = true
          app.quit()
        }
      }
    )
    panel.registerShortcuts()
    const settings = db.getSettings()
    createWindow(!(startHidden && settings.closeToTray && settings.setupDone && tray.available()))
    // Kurulum bittiyse Ollama arka planda başlatılır (kapalıysa): ilk soruda beklenmesin, "çalışmıyor" hatası çıkmasın.
    if (settings.setupDone) void ensureRunning()

    app.on('activate', () => showWindow())
    let closing = false
    app.on('before-quit', (event) => {
      quitting = true
      if (closing) return
      closing = true
      event.preventDefault()
      // Veritabanı kapanmadan önce pencerenin yeri saklanır.
      persistWindow()
      clearInterval(idleTimer)
      stopWatching()
      panel.destroy()
      tray.destroy()
      chat.stopAll()
      jobs.stopAll()
      // Durdurulan cevapların yazılan kısmı ve dosya değişikliklerinin geri alma kaydı kaydedilsin diye kısa süre beklenir.
      void chat.settle(2000).finally(() => {
        db.close()
        log('info', 'Atlas closed')
        flushLog()
        app.quit()
      })
    })
  }).catch((err: unknown) => {
    // Veritabanı açılamaz ya da güncellenemezse pencere hiç açılmadan beklemesin: ne olduğu söylenir ve uygulama kapanır.
    log('error', 'Startup failed', err)
    const t = L().main.notify
    dialog.showErrorBox(t.startupTitle, t.startupFailed(err instanceof Error ? err.message : String(err), app.getPath('userData')))
    app.exit(1)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
