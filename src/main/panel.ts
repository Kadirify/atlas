import { join } from 'node:path'
import { BrowserWindow, globalShortcut, nativeTheme, screen, shell } from 'electron'
import { SHORTCUT_CHOICES, type PanelRequest, type Settings, type ShortcutStatus } from '@shared/types'
import { SelectionHelper } from './services/selection'

const WIDTH = 440
const MARGIN = 12
const MAX_HEIGHT = 760
const isDev = !!process.env.ELECTRON_RENDERER_URL

/**
 * Atlas paneli: ekranın sağ kenarında açılan, her programın üstünde duran küçük pencere.
 * İki kısayolla açılır: biri boş bir soru kutusu getirir, diğeri öndeki programda seçili metni
 * alıp panelde gösterir (düzelt, çevir, özetle...).
 */
export class AtlasPanel {
  private window: BrowserWindow | null = null
  private loaded = false
  private current: PanelRequest = { id: 0, mode: 'ask', text: '', canReplace: false }
  /** Seçimin alındığı pencere; "yerine yaz" buraya yapıştırır. */
  private sourceWindow = ''
  private status: ShortcutStatus = { quick: true, selection: true }
  readonly selection = new SelectionHelper()

  constructor(
    private icon: string,
    private getSettings: () => Settings
  ) {}

  private create(): BrowserWindow {
    const dark = nativeTheme.shouldUseDarkColors
    const win = new BrowserWindow({
      width: WIDTH,
      height: 600,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      icon: this.icon,
      backgroundColor: dark ? '#0e1320' : '#f4f6fa',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.setAlwaysOnTop(true, 'floating')
    win.on('closed', () => {
      this.window = null
      this.loaded = false
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.once('did-finish-load', () => {
      this.loaded = true
    })
    if (isDev) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#panel`)
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'panel' })
    this.window = win
    return win
  }

  /** Paneli imlecin bulunduğu ekranın sağ kenarına yerleştirip gösterir. */
  private show(request: Omit<PanelRequest, 'id'>): void {
    const win = this.window && !this.window.isDestroyed() ? this.window : this.create()
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    win.setBounds({
      x: area.x + area.width - WIDTH - MARGIN,
      y: area.y + MARGIN,
      width: WIDTH,
      // Çok uzun ekranlarda panel bütün yüksekliği kaplamaz; okunabilir bir boyda kalır.
      height: Math.min(MAX_HEIGHT, Math.max(360, area.height - MARGIN * 2))
    })
    this.current = { ...request, id: this.current.id + 1 }
    if (this.loaded) win.webContents.send('panel:open', this.current)
    win.show()
    win.focus()
  }

  /** Panel açılırken istenen içerik; pencere yeni yüklendiyse olayı kaçırmış olabilir. */
  request(): PanelRequest {
    return this.current
  }

  openAsk(): void {
    this.sourceWindow = ''
    this.show({ mode: 'ask', text: '', canReplace: false })
  }

  async openSelection(): Promise<void> {
    const captured = await this.selection.capture()
    this.sourceWindow = captured?.window ?? ''
    // Seçili metin yoksa panel yine açılır; kullanıcı metni kendisi yapıştırabilir.
    this.show({ mode: 'selection', text: captured?.text ?? '', canReplace: !!captured?.text && !!this.sourceWindow })
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) this.window.hide()
  }

  /** Sonucu, seçimin alındığı programa yapıştırır. Başaramazsa metin panoda kalır ve false döner. */
  async replace(text: string): Promise<boolean> {
    this.hide()
    return this.selection.paste(text, this.sourceWindow)
  }

  /** Kısayolları ayarlara göre yeniden kaydeder. Başka bir program aldıysa durumda false görünür. */
  registerShortcuts(): ShortcutStatus {
    globalShortcut.unregisterAll()
    const settings = this.getSettings()
    const valid = (key: string): boolean => !!key && SHORTCUT_CHOICES.includes(key)
    const register = (key: string, run: () => void): boolean => {
      if (!valid(key)) return true
      try {
        return globalShortcut.register(key, run)
      } catch {
        return false
      }
    }
    // Kurulum bitmeden kısayollar çalışmaz: henüz model yoktur.
    if (!settings.setupDone) return (this.status = { quick: true, selection: true })
    const quick = register(settings.quickShortcut, () => this.openAsk())
    const selection =
      !SelectionHelper.supported() || settings.selectionShortcut === settings.quickShortcut
        ? true
        : register(settings.selectionShortcut, () => void this.openSelection())
    if (valid(settings.selectionShortcut)) this.selection.warmUp()
    return (this.status = { quick, selection })
  }

  shortcutStatus(): ShortcutStatus {
    return this.status
  }

  destroy(): void {
    globalShortcut.unregisterAll()
    this.selection.stop()
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }
}
