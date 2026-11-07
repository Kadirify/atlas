import { spawn } from 'node:child_process'
import { join } from 'node:path'

/** Windows'un bir dosya için bildirdiği Authenticode imzası */
export interface FileSignature {
  /** "Valid", "NotSigned", "HashMismatch", "NotTrusted", "UnknownError"... */
  status: string
  /** İmzalayan sertifikanın sahibi ("CN=..., O=..., ..."); imza yoksa boş */
  subject: string
}

const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
/** Büyük bir dosyanın özetini çıkarmak birkaç saniye sürer; takılırsa beklenmez. */
const TIMEOUT_MS = 60_000
const MAX_OUTPUT = 16_000

// Dosya yolu komutun içine yazılmaz, ortam değişkeniyle verilir: yoldaki tırnak ya da özel işaretler komutu bozamaz.
// Yalnızca kısıtlı PowerShell kiplerinde de (kurumsal bilgisayarlar) çalışan yalın komutlar kullanılır.
const COMMAND = [
  "$ErrorActionPreference = 'Stop'",
  '$s = Get-AuthenticodeSignature -LiteralPath $env:ATLAS_SIGNATURE_FILE',
  "@{ status = [string]$s.Status; subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' } } | ConvertTo-Json -Compress"
].join('; ')

/**
 * Dosyanın Windows imzasını okur (PowerShell'in Get-AuthenticodeSignature komutu: imzayı ve sertifika zincirini
 * Windows doğrular). Windows dışında ya da okunamazsa null döner; çağıran bunu "doğrulanamadı" saymalıdır.
 */
export function readSignature(file: string): Promise<FileSignature | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  return new Promise((resolve) => {
    const child = spawn(join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', COMMAND], {
      env: { ...process.env, ATLAS_SIGNATURE_FILE: file },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let out = ''
    let settled = false
    const finish = (signature: FileSignature | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(signature)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(null)
    }, TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      if (out.length < MAX_OUTPUT) out += chunk.toString('utf8')
    })
    child.on('error', () => finish(null))
    child.on('close', (code) => {
      if (code !== 0) return finish(null)
      try {
        const parsed = JSON.parse(out.trim()) as { status?: unknown; subject?: unknown }
        finish(typeof parsed.status === 'string' ? { status: parsed.status, subject: typeof parsed.subject === 'string' ? parsed.subject : '' } : null)
      } catch {
        finish(null)
      }
    })
  })
}

/**
 * Sertifika sahibini ("CN=Ollama Inc., O=Ollama Inc., L=...") alanlarına ayırır. Tırnak içindeki virgüller alanı bölmez:
 * adının içine ", O=..." yazılmış bir sertifika başka bir kuruluş gibi görünemez. Aynı alan iki kez geçerse ilki alınır.
 */
export function subjectFields(subject: string): Map<string, string> {
  const fields = new Map<string, string>()
  let current = ''
  let quoted = false
  const push = (): void => {
    const eq = current.indexOf('=')
    if (eq > 0) {
      const key = current.slice(0, eq).trim().toUpperCase()
      const value = current
        .slice(eq + 1)
        .trim()
        .replace(/^"([\s\S]*)"$/, '$1')
        .replace(/""/g, '"')
      if (!fields.has(key)) fields.set(key, value)
    }
    current = ''
  }
  for (const ch of subject) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) push()
    else current += ch
  }
  push()
  return fields
}

/** İmza Windows'a göre geçerli mi ve imzalayan kuruluş Ollama mı. */
export function isOllamaSignature(signature: FileSignature | null): boolean {
  if (!signature || signature.status !== 'Valid') return false
  return /^Ollama,? Inc\.?$/i.test(subjectFields(signature.subject).get('O') ?? '')
}
