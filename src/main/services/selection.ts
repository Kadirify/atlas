import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { clipboard, ClipboardItem } from 'electron'

/**
 * Başka programlardaki seçili metni almak ve sonucu geri yazmak için küçük bir Windows yardımcısı.
 *
 * Windows'ta "başka programın seçili metni" diye bir arayüz yoktur; her araç gibi Atlas da o programa
 * Ctrl+C gönderip panoyu okur, sonra panoyu eski haline getirir. Tuş göndermek için arka planda tek bir
 * PowerShell süreci açık tutulur (her seferinde yeniden başlatmak yarım saniye sürerdi).
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class AtlasKeys {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  static bool Down(int k) { return (GetAsyncKeyState(k) & 0x8000) != 0; }
  // Kısayolun tuşları hâlâ basılıyken Ctrl+C göndermek başka bir kısayola dönüşürdü.
  static void WaitRelease() {
    for (int i = 0; i < 75; i++) {
      if (!Down(0x10) && !Down(0x11) && !Down(0x12) && !Down(0x5B) && !Down(0x5C) && !Down(0x20)) return;
      Thread.Sleep(20);
    }
  }
  static void Chord(byte key) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(key, 0, 0, UIntPtr.Zero);
    keybd_event(key, 0, 2, UIntPtr.Zero);
    keybd_event(0x11, 0, 2, UIntPtr.Zero);
  }
  public static long Copy() {
    IntPtr h = GetForegroundWindow();
    WaitRelease();
    Chord(0x43);
    return h.ToInt64();
  }
  public static bool Paste(long target) {
    IntPtr h = new IntPtr(target);
    for (int i = 0; i < 10 && GetForegroundWindow() != h; i++) Thread.Sleep(30);
    if (GetForegroundWindow() != h) {
      // Windows, öne geçme isteğini ancak bir tuş olayından sonra kabul eder.
      keybd_event(0x12, 0, 0, UIntPtr.Zero);
      keybd_event(0x12, 0, 2, UIntPtr.Zero);
      SetForegroundWindow(h);
      Thread.Sleep(120);
    }
    if (GetForegroundWindow() != h) return false;
    Chord(0x56);
    return true;
  }
}
"@
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    if ($line -eq 'copy') { [Console]::Out.WriteLine('ok ' + [AtlasKeys]::Copy()) }
    elseif ($line.StartsWith('paste ')) { [Console]::Out.WriteLine('ok ' + [AtlasKeys]::Paste([long]$line.Substring(6))) }
    else { [Console]::Out.WriteLine('err') }
  } catch { [Console]::Out.WriteLine('err') }
}
`

/** Panonun o anki içeriği: her öğe için tür ve veri. Okunamayan türler atlanır. */
type ClipboardSnapshot = Record<string, Blob | string>[]

async function snapshot(): Promise<ClipboardSnapshot> {
  const out: ClipboardSnapshot = []
  try {
    for (const item of await clipboard.read()) {
      const entry: Record<string, Blob | string> = {}
      for (const type of item.types) {
        try {
          const data = await item.getType(type)
          if (data instanceof Blob) entry[type] = data
        } catch {
          // Bu tür okunamadı; diğerleri yine geri yüklenir.
        }
      }
      if (Object.keys(entry).length) out.push(entry)
    }
  } catch {
    // Pano okunamıyorsa geri yüklenecek bir şey de yoktur.
  }
  return out
}

async function restore(saved: ClipboardSnapshot): Promise<void> {
  try {
    if (saved.length === 0) clipboard.clear()
    else await clipboard.write(saved.map((entry) => new ClipboardItem(entry)))
  } catch {
    // Geri yükleme başarısız olursa pano boş kalır; kullanıcının işi bozulmaz.
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class SelectionHelper {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<boolean> | null = null
  private waiting: ((line: string) => void) | null = null
  private buffer = ''

  /** Seçili metin yalnızca Windows'ta alınabilir. */
  static supported(): boolean {
    return process.platform === 'win32'
  }

  /** Yardımcıyı önceden başlatır; ilk kısayolda bekleme olmasın diye. */
  warmUp(): void {
    if (SelectionHelper.supported()) void this.start()
  }

  private start(): Promise<boolean> {
    if (this.ready) return this.ready
    this.ready = new Promise<boolean>((resolve) => {
      let child: ChildProcessWithoutNullStreams
      try {
        // Tam yol: PATH ya da çalışma klasöründeki aynı adlı bir dosya araya giremesin.
        child = spawn(
          join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
          { windowsHide: true }
        )
      } catch {
        resolve(false)
        return
      }
      this.child = child
      const fail = (): void => {
        this.child = null
        this.ready = null
        this.waiting?.('err')
        this.waiting = null
        resolve(false)
      }
      child.on('error', fail)
      child.on('exit', fail)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        this.buffer += chunk
        let index: number
        while ((index = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, index).trim()
          this.buffer = this.buffer.slice(index + 1)
          if (line === 'ready') resolve(true)
          else if (this.waiting) {
            const done = this.waiting
            this.waiting = null
            done(line)
          }
        }
      })
    })
    return this.ready
  }

  private async send(command: string): Promise<string> {
    if (!(await this.start()) || !this.child) return 'err'
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.waiting = null
        resolve('err')
      }, 4000)
      this.waiting = (line) => {
        clearTimeout(timer)
        resolve(line)
      }
      this.child!.stdin.write(command + '\n')
    })
  }

  /**
   * Öndeki programda seçili metni alır. Pano geçici olarak kullanılır ve eski haline getirilir.
   * @returns seçili metin (yoksa boş) ve metnin alındığı pencere; yardımcı çalışmıyorsa null
   */
  async capture(): Promise<{ text: string; window: string } | null> {
    if (!SelectionHelper.supported()) return null
    const before = await snapshot()
    clipboard.clear()
    const reply = await this.send('copy')
    if (!reply.startsWith('ok ')) {
      await restore(before)
      return null
    }
    // Program panoyu doldurana kadar kısa bir süre beklenir.
    let text = ''
    for (let i = 0; i < 30 && !text; i++) {
      await sleep(25)
      text = await clipboard.readText().catch(() => '')
    }
    await restore(before)
    return { text: text.replace(/\r\n/g, '\n').trim(), window: reply.slice(3).trim() }
  }

  /**
   * Metni, seçimin alındığı pencereye yapıştırır (seçili metnin yerine geçer).
   * @returns yapıştırılamadıysa false; o durumda metin panoda bırakılır
   */
  async paste(text: string, window: string): Promise<boolean> {
    if (!SelectionHelper.supported() || !/^\d+$/.test(window)) return false
    const before = await snapshot()
    await clipboard.writeText(text)
    const reply = await this.send(`paste ${window}`)
    if (reply !== 'ok True') return false
    // Program yapıştırmayı bitirdikten sonra kullanıcının eski panosu geri gelir.
    await sleep(400)
    await restore(before)
    return true
  }

  stop(): void {
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
    this.ready = null
  }
}
