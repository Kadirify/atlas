import { spawn } from 'node:child_process'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { CodeEntry, CodeFile } from '@shared/types'
import { L } from '../i18n'
import { decodeText } from './attachments'
import { resolveInside } from './files'

/** Dosya ağacında hiç gösterilmeyen, çok büyük ya da gereksiz klasörler */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.idea', '.vs', 'bin', 'obj', '.next', '.turbo'])
/** Gizli bilgi içerebilen dosyalar: ağaçta görünür ama içeriği arayüze ve modele verilmez */
const SECRET_FILE = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|pfx|p12|keystore)|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|secrets?\.(?:json|ya?ml)|credentials(?:\.json)?)$/i
const MAX_ENTRIES = 500
const MAX_VIEW_BYTES = 400 * 1024
const MAX_OUTPUT_CHARS = 12_000
/** Komut çıktısından en çok bu kadarı bellekte tutulur (sonu saklanır; hatalar genelde sondadır) */
const MAX_OUTPUT_BYTES = 256 * 1024
const COMMAND_TIMEOUT_MS = 120_000
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')

export class CodeError extends Error {}

export function isSecretFile(name: string): boolean {
  return SECRET_FILE.test(basename(name))
}

/** Proje klasörünün bir alt klasöründeki dosya ve klasörleri verir; klasörler önce, sonra ada göre. */
export async function listDir(root: string, rel: string): Promise<CodeEntry[]> {
  const full = await resolveInside(root, rel || '.')
  const entries = (await readdir(full, { withFileTypes: true })).filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name)))
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'tr'))
  const prefix = rel && rel !== '.' ? `${rel.replace(/\\/g, '/').replace(/\/$/, '')}/` : ''
  return entries.slice(0, MAX_ENTRIES).map((e) => ({ name: e.name, path: prefix + e.name, dir: e.isDirectory(), secret: !e.isDirectory() && isSecretFile(e.name) }))
}

/** Dosyayı görüntülemek için okur. Gizli bilgi dosyaları ve ikili dosyalar içerik vermez; büyük dosyanın yalnızca başı okunur. */
export async function readForView(root: string, rel: string): Promise<CodeFile> {
  const t = L().tools.code
  const full = await resolveInside(root, rel)
  if (isSecretFile(rel) || isSecretFile(full)) return { path: rel, text: '', note: t.secretFile, truncated: false }
  const info = await stat(full)
  if (!info.isFile()) throw new CodeError(t.notAFile)
  const handle = await open(full, 'r')
  let bytes: Buffer
  try {
    const buffer = Buffer.alloc(Math.min(info.size, MAX_VIEW_BYTES))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    bytes = buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  const head = bytes.subarray(0, 4096)
  let zeros = 0
  for (const b of head) if (b === 0) zeros++
  if (zeros > head.length * 0.01) return { path: rel, text: '', note: t.binaryFile, truncated: false }
  return { path: rel, text: decodeText(bytes), note: '', truncated: info.size > MAX_VIEW_BYTES }
}

export interface CommandResult {
  code: number | null
  output: string
  timedOut: boolean
}

function cleanOutput(text: string): string {
  return text.replace(ANSI, '').replace(/\r(?!\n)/g, '\n')
}

/**
 * Komutu proje klasöründe çalıştırır ve çıktısını toplar. Etkileşimli girdi verilmez; süre dolarsa süreç sonlandırılır.
 * Bu işlev güvenlik denetimi yapmaz: çağıran önce classifyCommand ile bakmalı ve kullanıcıdan onay almalıdır.
 */
export function runCommand(cwd: string, command: string, signal: AbortSignal, onChunk?: (chunk: string) => void): Promise<CommandResult> {
  return new Promise((resolve) => {
    // Cevap durdurulmuşsa komut hiç başlatılmaz.
    if (signal.aborted) return resolve({ code: null, output: '', timedOut: false })
    const windows = process.platform === 'win32'
    // cmd tam yoldan çağrılır ve komut tırnağa alınır: /s ilk ve son tırnağı atar, komutun kendi tırnakları bozulmaz.
    const child = spawn(windows ? join(SYSTEM32, 'cmd.exe') : 'sh', windows ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command], {
      cwd,
      windowsHide: true,
      windowsVerbatimArguments: windows,
      stdio: ['ignore', 'pipe', 'pipe'],
      // NoDefaultCurrentDirectoryInExePath: proje klasöründeki "git.bat" gibi bir dosya PATH'teki programın yerine çalışmasın.
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', NoDefaultCurrentDirectoryInExePath: '1' }
    })
    const chunks: Buffer[] = []
    let bytes = 0
    // Canlı terminal için: iki parçaya bölünen çok baytlı harfler bozulmasın.
    const live = new StringDecoder('utf8')
    let timedOut = false
    let settled = false
    let exitTimer: NodeJS.Timeout | undefined
    let killTimer: NodeJS.Timeout | undefined

    const add = (chunk: Buffer): void => {
      chunks.push(chunk)
      bytes += chunk.length
      while (bytes > MAX_OUTPUT_BYTES && chunks.length > 1) bytes -= chunks.shift()!.length
      onChunk?.(cleanOutput(live.write(chunk)))
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)

    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(exitTimer)
      clearTimeout(killTimer)
      signal.removeEventListener('abort', onAbort)
      child.stdout.destroy()
      child.stderr.destroy()
      // Çıktı bütün olarak çözülür: UTF-8 değilse (Türkçe Windows'ta 1254) doğru kodlama seçilsin.
      const clean = cleanOutput(decodeText(Buffer.concat(chunks))).trim()
      resolve({ code, output: clean.length > MAX_OUTPUT_CHARS ? `…\n${clean.slice(-MAX_OUTPUT_CHARS)}` : clean, timedOut })
    }
    const kill = (): void => {
      // Windows'ta alt süreçler de sonlansın diye süreç ağacı kapatılır.
      if (windows && child.pid) spawn(join(SYSTEM32, 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).on('error', () => {})
      else child.kill('SIGKILL')
      // cmd çoktan kapanmış ama arka plandaki bir süreç çıktıyı açık tutuyorsa beklemeden bitirilir.
      killTimer = setTimeout(() => finish(null), 2000)
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, COMMAND_TIMEOUT_MS)
    const onAbort = (): void => kill()
    signal.addEventListener('abort', onAbort)
    child.on('error', (e) => {
      chunks.push(Buffer.from(String(e.message)))
      finish(null)
    })
    // "start /b" ile arka planda başlatılan bir süreç çıktı borusunu açık tutabilir: cmd kapandıktan kısa süre sonra bitirilir.
    child.on('exit', (code) => {
      exitTimer = setTimeout(() => finish(code), 500)
    })
    child.on('close', (code) => finish(code))
  })
}

/** Varsayılan programla açılınca kod çalıştırabilecek ya da başka bir yere bağlanabilecek dosya türleri: bunlar açılmaz, Gezgin'de gösterilir. */
const RUNNABLE =
  /\.(?:exe|com|bat|cmd|ps1|psm1|psd1|ps1xml|psc1|vbs|vbe|js|jse|mjs|cjs|wsf|wsh|ws|wsc|msi|msp|msix|msixbundle|appx|appxbundle|appinstaller|application|scr|pif|lnk|hta|reg|cpl|msc|chm|hlp|jar|jnlp|appref-ms|py|pyw|sh|url|website|scf|inf|rdp|library-ms|searchconnector-ms|settingcontent-ms|theme|themepack|diagcab|gadget|xll|xbap|docm|dotm|xlsm|xltm|xlam|pptm|potm|ppam|sldm|iso|img|vhd|vhdx|sct|shb|shs|mde|ade|adp|accde)$/i

export function isRunnable(path: string): boolean {
  return RUNNABLE.test(path)
}

export { join }
