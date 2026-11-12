import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { L } from './i18n'

export interface TrayActions {
  show(): void
  newChat(): void
  quickAsk(): void
  lock(): void
  unloadModels(): void
  quit(): void
  setLaunchAtLogin(on: boolean): void
}

export interface TrayStatus {
  lockEnabled: boolean
  locked: boolean
  launchAtLogin: boolean
  /** Atlas şu an bir cevap yazıyor mu */
  writing: boolean
}

/**
 * Sistem tepsisindeki Atlas simgesi. Pencere kapatılınca Atlas burada çalışmaya devam eder;
 * simgeye tıklamak pencereyi geri getirir, sağ tık menüsünden tamamen çıkılır.
 */
export class AtlasTray {
  private tray: Tray | null = null

  constructor(
    private iconPath: string,
    private actions: TrayActions,
    private status: () => TrayStatus
  ) {}

  create(): void {
    if (this.tray) return
    try {
      const image = nativeImage.createFromPath(this.iconPath)
      // Windows tepsisi küçük simge bekler; büyük resim bulanık küçültülmesin diye önceden boyutlanır.
      this.tray = new Tray(image.isEmpty() ? image : image.resize({ width: 32, height: 32, quality: 'best' }))
    } catch (err) {
      // Tepsi desteklenmiyorsa (bazı Linux masaüstleri) uygulama tepsisiz çalışır.
      console.error('tepsi simgesi oluşturulamadı:', err)
      this.tray = null
      return
    }
    this.tray.on('click', () => this.actions.show())
    this.refresh()
  }

  /** Tepsi kullanılabiliyor mu. Kullanılamıyorsa pencere kapatılınca uygulama da kapanmalıdır. */
  available(): boolean {
    return this.tray !== null && !this.tray.isDestroyed()
  }

  /** Dil, kilit durumu ya da açılış ayarı değişince menüyü yeniden kurar. */
  refresh(): void {
    if (!this.available()) return
    const t = L().main.tray
    const s = this.status()
    this.tray!.setToolTip(s.locked ? t.tooltipLocked : s.writing ? t.tooltipWriting : t.tooltip)
    this.tray!.setContextMenu(
      Menu.buildFromTemplate([
        { label: t.open, click: () => this.actions.show() },
        { label: t.newChat, enabled: !s.locked, click: () => this.actions.newChat() },
        { label: t.quickAsk, enabled: !s.locked, click: () => this.actions.quickAsk() },
        { type: 'separator' },
        { label: t.unloadModels, click: () => this.actions.unloadModels() },
        { label: t.lockNow, visible: s.lockEnabled, enabled: !s.locked, click: () => this.actions.lock() },
        {
          label: t.launchAtLogin,
          type: 'checkbox',
          checked: s.launchAtLogin,
          click: (item) => this.actions.setLaunchAtLogin(item.checked)
        },
        { type: 'separator' },
        { label: t.quit, click: () => this.actions.quit() }
      ])
    )
  }

  /** Pencere ilk kez tepsiye gizlendiğinde kullanıcıya nerede olduğunu söyler. */
  notifyHidden(): void {
    if (!Notification.isSupported()) return
    const t = L().main.tray
    const note = new Notification({ title: t.hiddenTitle, body: t.hiddenBody, icon: this.iconPath, silent: true })
    note.on('click', () => this.actions.show())
    note.show()
  }

  /** Atlas penceresi önde değilken biten cevabı bildirir; tıklanınca o sohbet açılır. */
  notify(title: string, body: string, onClick: () => void): void {
    if (!Notification.isSupported()) return
    const note = new Notification({ title, body, icon: this.iconPath })
    note.on('click', onClick)
    note.show()
  }

  destroy(): void {
    if (this.available()) this.tray!.destroy()
    this.tray = null
  }
}

/**
 * Bilgisayar açılınca Atlas'ı başlatma ayarını işletim sistemine yazar.
 * Geliştirme modunda yazılmaz: o zaman kayıt Atlas'ı değil Electron'un kendisini gösterirdi.
 */
export function applyLaunchAtLogin(on: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}
