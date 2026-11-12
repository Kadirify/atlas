import { spawn } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
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
const COMMAND_TIMEOUT_MS = 120_000

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

/** Dosyayı görüntülemek için okur. Gizli bilgi dosyaları ve ikili dosyalar içerik vermez. */
export async function readForView(root: string, rel: string): Promise<CodeFile> {
  const t = L().tools.code
  if (isSecretFile(rel)) return { path: rel, text: '', note: t.secretFile, truncated: false }
  const full = await resolveInside(root, rel)
  const info = await stat(full)
  if (!info.isFile()) throw new CodeError(t.notAFile)
  const bytes = await readFile(full)
  const head = bytes.subarray(0, 4096)
  let zeros = 0
  for (const b of head) if (b === 0) zeros++
  if (zeros > head.length * 0.01) return { path: rel, text: '', note: t.binaryFile, truncated: false }
  const truncated = bytes.length > MAX_VIEW_BYTES
  return { path: rel, text: decodeText(truncated ? bytes.subarray(0, MAX_VIEW_BYTES) : bytes), note: '', truncated }
}

export interface CommandResult {
  code: number | null
  output: string
  timedOut: boolean
}

/**
 * Komutu proje klasöründe çalıştırır ve çıktısını toplar. Etkileşimli girdi verilmez; süre dolarsa süreç sonlandırılır.
 * Bu işlev güvenlik denetimi yapmaz: çağıran önce classifyCommand ile bakmalı ve kullanıcıdan onay almalıdır.
 */
export function runCommand(cwd: string, command: string, signal: AbortSignal, onChunk?: (chunk: string) => void): Promise<CommandResult> {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32'
    const child = spawn(windows ? 'cmd.exe' : 'sh', windows ? ['/d', '/s', '/c', command] : ['-c', command], {
      cwd,
      windowsHide: true,
      windowsVerbatimArguments: windows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' }
    })
    let output = ''
    let timedOut = false
    const add = (chunk: Buffer): void => {
      const text = decodeText(chunk)
      if (output.length < MAX_OUTPUT_CHARS * 2) output += text
      // Canlı terminal için renk kodları temizlenmiş parça.
      onChunk?.(text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n'))
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    const kill = (): void => {
      // Windows'ta alt süreçler de sonlansın diye süreç ağacı kapatılır.
      if (windows && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      else child.kill('SIGKILL')
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, COMMAND_TIMEOUT_MS)
    const onAbort = (): void => kill()
    signal.addEventListener('abort', onAbort)
    const finish = (code: number | null): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      // Renk kodları ve satır başı karakterleri temizlenir; çıktı uzunsa sonu korunur (hatalar genelde sondadır).
      const clean = output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r(?!\n)/g, '\n').trim()
      resolve({ code, output: clean.length > MAX_OUTPUT_CHARS ? `…\n${clean.slice(-MAX_OUTPUT_CHARS)}` : clean, timedOut })
    }
    child.on('error', (e) => {
      output += String(e.message)
      finish(null)
    })
    child.on('close', (code) => finish(code))
  })
}

/** Varsayılan programla açılınca kod çalıştırabilecek dosya türleri: bunlar açılmaz, Gezgin'de gösterilir. */
const RUNNABLE = /\.(?:exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|mjs|cjs|wsf|wsh|msi|msp|scr|lnk|hta|reg|cpl|jar|appref-ms|py|pyw|sh|url|scf|inf)$/i

export function isRunnable(path: string): boolean {
  return RUNNABLE.test(path)
}

export { join }
