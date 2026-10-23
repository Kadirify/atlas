import { extname } from 'node:path'
import { documentViewKind, type Attachment } from '@shared/types'
import type { Db } from '../db'
import { L } from '../i18n'
import { DocumentJobError, runDocument } from './documentRunner'
import type { DocumentJob, DocumentKind } from '../workers/document'

const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Veritabanında saklanan en fazla metin; modele bunun yalnızca baş kısmı verilir. */
const MAX_STORED_CHARS = 400_000

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg'])

/** Düz metin olarak okunan uzantılar */
export const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.xml', '.html', '.htm', '.css', '.log', '.ini',
  '.yml', '.yaml', '.toml', '.env', '.sql', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.java', '.cs',
  '.c', '.h', '.cpp', '.hpp', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.sh', '.bat', '.ps1', '.srt', '.vtt',
  '.tex', '.rtf', '.ejs', '.vue', '.svelte', '.csproj', '.sln', '.razor', '.cshtml', '.xaml', '.config', '.props', '.targets',
  '.gradle', '.kts', '.dart', '.lua', '.r', '.scala', '.scss', '.sass', '.less', '.prisma', '.graphql', '.proto', '.tf',
  '.mdx', '.astro', '.lock', '.cfg', '.conf', '.properties', '.gitignore', '.editorconfig', '.dockerfile', '.psm1', '.vb',
  '.fs', '.ex', '.exs', '.erl', '.hs', '.pl', '.m', '.mm', '.zig', '.nim', '.clj', '.groovy', '.cmake', '.mk', '.resx'
])

export class AttachmentError extends Error {}

export function decodeText(bytes: Buffer): string {
  // Windows'ta kaydedilmiş dosyalar UTF-16 olabilir.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  const text = new TextDecoder('utf-8').decode(bytes)
  // UTF-8 değilse (eski Türkçe Windows kodlaması) bozuk karakter çıkar; o zaman 1254 ile dene.
  return text.includes('�') ? new TextDecoder('windows-1254').decode(bytes) : text
}

function looksBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 4096)
  let zeros = 0
  for (const b of sample) if (b === 0) zeros++
  return zeros > sample.length * 0.01
}

/** Word ve Excel birer ZIP'tir; açıldığında bundan büyük olan belge okunmaz (sıkıştırma bombası). */
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024

/** PDF, Word ve Excel ayrı süreçte okunur: ağır ya da kötü niyetli bir belge uygulamayı dondurmasın. */
async function readDocument<T>(name: string, job: DocumentJob): Promise<T> {
  try {
    return await runDocument<T>(job)
  } catch (e) {
    const t = L().main.attachments
    if (e instanceof DocumentJobError && e.kind === 'unpacked') {
      const mb = (bytes: number): number => Math.round(bytes / (1024 * 1024))
      throw new AttachmentError(t.unpackedTooLarge(name, mb(e.size ?? 0), mb(MAX_UNPACKED_BYTES)))
    }
    if (e instanceof DocumentJobError && e.kind === 'timeout') throw new AttachmentError(t.tooSlow(name))
    throw new AttachmentError(t.unreadable(name))
  }
}

/** Dosyanın metnini çıkarır. Okunamayan türlerde anlaşılır bir hata verir. */
export async function extractText(name: string, bytes: Buffer): Promise<string> {
  const ext = extname(name).toLowerCase()
  if (ext === '.pdf' || ext === '.docx' || ext === '.xlsx') {
    return readDocument<string>(name, {
      op: 'extract',
      kind: ext as DocumentKind,
      bytes,
      sheetHeading: L().main.attachments.sheet('{name}'),
      maxUnpacked: MAX_UNPACKED_BYTES
    })
  }
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') {
    throw new AttachmentError(L().main.attachments.oldOffice(ext))
  }
  if (TEXT_EXTENSIONS.has(ext) || !looksBinary(bytes)) return decodeText(bytes)
  throw new AttachmentError(L().main.attachments.unsupported(name))
}

/** Dosyayı okur ve gönderilmeye hazır bir ek olarak saklar. */
export async function addAttachment(db: Db, name: string, mime: string, data: ArrayBuffer): Promise<Attachment> {
  const bytes = Buffer.from(data)
  if (bytes.length === 0) throw new AttachmentError(L().main.attachments.empty(name))
  if (bytes.length > MAX_FILE_BYTES) {
    throw new AttachmentError(L().main.attachments.tooLarge(name))
  }

  // Resimler arayüzde PNG ya da JPEG'e çevrilip küçültülerek gelir.
  if (IMAGE_MIMES.has(mime)) {
    return db.addAttachment({
      name,
      kind: 'image',
      mime,
      size: bytes.length,
      text: '',
      data: bytes.toString('base64')
    })
  }

  const text = (await extractText(name, bytes)).replace(/\u0000/g, '').trim()
  if (!text) {
    throw new AttachmentError(L().main.attachments.noText(name))
  }
  return db.addAttachment({
    name,
    kind: 'text',
    mime: mime || 'text/plain',
    size: bytes.length,
    text: text.slice(0, MAX_STORED_CHARS),
    data: null,
    // PDF, Word ve Excel'in kendisi de saklanır; belge paneli dosyayı özgün görünümüyle gösterir.
    original: documentViewKind(name) ? bytes : undefined
  })
}

export interface SheetPreview {
  name: string
  /** Sütun genişlikleri (karakter); bilinmiyorsa 0 */
  widths: number[]
  rows: { text: string; bold: boolean; align: 'left' | 'center' | 'right' }[][]
}

const MAX_PREVIEW_ROWS = 2000
const MAX_PREVIEW_COLS = 60

/** Excel dosyasını belge panelinde tablo olarak göstermek için sayfa sayfa okur (ayrı süreçte). */
export function sheetPreview(bytes: Buffer, name = 'Excel'): Promise<SheetPreview[]> {
  return readDocument<SheetPreview[]>(name, { op: 'sheets', bytes, maxUnpacked: MAX_UNPACKED_BYTES, maxRows: MAX_PREVIEW_ROWS, maxCols: MAX_PREVIEW_COLS })
}

/**
 * Eklerin metnini, modele verilecek tek bir blok haline getirir.
 * Bütçe dosyalar arasında sırayla harcanır; sığmayan kısım atılır ve bu modele söylenir.
 */
export function attachmentsBlock(files: { name: string; kind: string; text: string }[], budget: number): string {
  const t = L().main.attachments
  const parts: string[] = []
  let left = budget
  for (const file of files) {
    if (file.kind !== 'text') continue
    if (left <= 0) {
      parts.push(`${t.fileStart(file.name)} ${t.omittedNote}`)
      continue
    }
    const piece = file.text.slice(0, left)
    left -= piece.length
    const note = piece.length < file.text.length ? `\n${t.truncatedNote}` : ''
    parts.push(`${t.fileStart(file.name)}\n${piece}${note}\n${t.fileEnd(file.name)}`)
  }
  return parts.join('\n\n')
}
