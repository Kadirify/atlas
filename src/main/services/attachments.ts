import { extname } from 'node:path'
import { documentViewKind, type Attachment } from '@shared/types'
import type { Db } from '../db'
import { L } from '../i18n'

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

async function readPdf(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

async function readDocx(bytes: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: bytes })
  return value
}

async function readXlsx(bytes: Buffer): Promise<string> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer)
  const parts: string[] = []
  workbook.eachSheet((sheet) => {
    const rows: string[] = []
    sheet.eachRow((row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cell.text.replace(/\s+/g, ' ').trim()))
      rows.push(cells.join(' | '))
    })
    if (rows.length > 0) parts.push(`${L().main.attachments.sheet(sheet.name)}\n${rows.join('\n')}`)
  })
  return parts.join('\n\n')
}

/** Dosyanın metnini çıkarır. Okunamayan türlerde anlaşılır bir hata verir. */
export async function extractText(name: string, bytes: Buffer): Promise<string> {
  const ext = extname(name).toLowerCase()
  try {
    if (ext === '.pdf') return await readPdf(bytes)
    if (ext === '.docx') return await readDocx(bytes)
    if (ext === '.xlsx') return await readXlsx(bytes)
  } catch {
    throw new AttachmentError(L().main.attachments.unreadable(name))
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

/** Excel dosyasını belge panelinde tablo olarak göstermek için sayfa sayfa okur. */
export async function sheetPreview(bytes: Buffer): Promise<SheetPreview[]> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer)
  const sheets: SheetPreview[] = []
  workbook.eachSheet((sheet) => {
    const cols = Math.min(sheet.columnCount, MAX_PREVIEW_COLS)
    const rows: SheetPreview['rows'] = []
    const last = Math.min(sheet.rowCount, MAX_PREVIEW_ROWS)
    for (let r = 1; r <= last; r++) {
      const row = sheet.getRow(r)
      const cells: SheetPreview['rows'][number] = []
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c)
        const horizontal = cell.alignment?.horizontal
        cells.push({
          text: cell.text ?? '',
          bold: !!cell.font?.bold,
          align: horizontal === 'center' || horizontal === 'right' ? horizontal : typeof cell.value === 'number' ? 'right' : 'left'
        })
      }
      rows.push(cells)
    }
    const widths = Array.from({ length: cols }, (_, i) => sheet.getColumn(i + 1).width ?? 0)
    sheets.push({ name: sheet.name, widths, rows })
  })
  return sheets
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
