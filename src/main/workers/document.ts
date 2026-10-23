/**
 * PDF, Word ve Excel dosyalarını ana süreçten ayrı bir süreçte okur. Ayrıştırma eşzamanlı ve ağırdır: büyük ya da
 * kötü niyetli bir belge (150 KB'lık bir docx açılınca yüzlerce MB olabilir) ana süreçte uygulamayı dondururdu.
 * Ayrı süreç bellek sınırıyla açılır; takılırsa kapatılır.
 *
 * Paketli uygulamada Electron'un utilityProcess'i, testlerde Node çalıştırır; bu yüzden yalnızca Node'un kendi
 * modüllerini ve belge kütüphanelerini kullanır, uygulamanın başka dosyalarını içe aktarmaz.
 */

export type DocumentKind = '.pdf' | '.docx' | '.xlsx'

export type DocumentJob =
  /** sheetHeading: Excel sayfa başlığı ("Sayfa: {name}"), maxUnpacked: zip içeriğinin açılmış en çok boyutu (bayt) */
  | { op: 'extract'; kind: DocumentKind; bytes: Uint8Array; sheetHeading: string; maxUnpacked: number }
  | { op: 'sheets'; bytes: Uint8Array; maxUnpacked: number; maxRows: number; maxCols: number }

export type DocumentFailure = 'unpacked' | 'unreadable' | 'timeout' | 'crashed'

export type DocumentReply = { ok: true; result: unknown } | { ok: false; error: DocumentFailure; size?: number; detail?: string }

/**
 * ZIP dosyasındaki her şeyin açılınca kaplayacağı toplam boyut (merkez dizinde bildirilen boyutlar, ZIP64 dahil).
 * ZIP değilse ya da dizin okunamıyorsa null.
 */
export function zipUnpackedSize(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = bytes.byteLength
  // Dizin sonu kaydı (EOCD) dosyanın son 22 + 65535 baytı içindedir.
  let eocd = -1
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  let entries = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  // ZIP64: sayılar sığmıyorsa asıl değerler ZIP64 dizin sonu kaydındadır.
  if ((entries === 0xffff || offset === 0xffffffff) && eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
    const record = Number(view.getBigUint64(eocd - 12, true))
    if (record + 56 > n || view.getUint32(record, true) !== 0x06064b50) return null
    entries = Number(view.getBigUint64(record + 32, true))
    offset = Number(view.getBigUint64(record + 48, true))
  }
  let total = 0
  let at = offset
  for (let e = 0; e < entries; e++) {
    if (at + 46 > n || view.getUint32(at, true) !== 0x02014b50) return null
    let size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    if (size === 0xffffffff) {
      // ZIP64 ek alanı (0x0001): ilk 8 bayt açılmış boyuttur.
      for (let x = at + 46 + nameLength; x + 4 <= at + 46 + nameLength + extraLength; ) {
        const id = view.getUint16(x, true)
        const length = view.getUint16(x + 2, true)
        if (id === 0x0001 && length >= 8) {
          size = Number(view.getBigUint64(x + 4, true))
          break
        }
        x += 4 + length
      }
    }
    total += size
    at += 46 + nameLength + extraLength + commentLength
  }
  return total
}

async function readPdf(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

async function readDocx(bytes: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')) as unknown as { extractRawText?: Function; default?: { extractRawText: Function } }
  const extractRawText = (mammoth.extractRawText ?? mammoth.default!.extractRawText) as (o: { buffer: Buffer }) => Promise<{ value: string }>
  const { value } = await extractRawText({ buffer: bytes })
  return value
}

async function workbook(bytes: Buffer): Promise<import('exceljs').Workbook> {
  const module = (await import('exceljs')) as unknown as { default?: typeof import('exceljs'); Workbook?: typeof import('exceljs').Workbook }
  const ExcelJS = (module.default ?? module) as typeof import('exceljs')
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes as unknown as ArrayBuffer)
  return book
}

async function readXlsx(bytes: Buffer, heading: string): Promise<string> {
  const book = await workbook(bytes)
  const parts: string[] = []
  book.eachSheet((sheet) => {
    const rows: string[] = []
    sheet.eachRow((row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cell.text.replace(/\s+/g, ' ').trim()))
      rows.push(cells.join(' | '))
    })
    if (rows.length > 0) parts.push(`${heading.replace('{name}', sheet.name)}\n${rows.join('\n')}`)
  })
  return parts.join('\n\n')
}

interface SheetPreview {
  name: string
  widths: number[]
  rows: { text: string; bold: boolean; align: 'left' | 'center' | 'right' }[][]
}

async function sheets(bytes: Buffer, maxRows: number, maxCols: number): Promise<SheetPreview[]> {
  const book = await workbook(bytes)
  const out: SheetPreview[] = []
  book.eachSheet((sheet) => {
    const cols = Math.min(sheet.columnCount, maxCols)
    const rows: SheetPreview['rows'] = []
    const last = Math.min(sheet.rowCount, maxRows)
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
    out.push({ name: sheet.name, widths: Array.from({ length: cols }, (_, i) => sheet.getColumn(i + 1).width ?? 0), rows })
  })
  return out
}

export async function runJob(job: DocumentJob): Promise<DocumentReply> {
  const bytes = Buffer.from(job.bytes.buffer, job.bytes.byteOffset, job.bytes.byteLength)
  // Word ve Excel birer ZIP'tir: açılınca sınırı aşacaksa hiç açılmaz (sıkıştırma bombası).
  if (job.op === 'sheets' || job.kind !== '.pdf') {
    const size = zipUnpackedSize(bytes)
    if (size !== null && size > job.maxUnpacked) return { ok: false, error: 'unpacked', size }
  }
  try {
    if (job.op === 'sheets') return { ok: true, result: await sheets(bytes, job.maxRows, job.maxCols) }
    const text = job.kind === '.pdf' ? await readPdf(bytes) : job.kind === '.docx' ? await readDocx(bytes) : await readXlsx(bytes, job.sheetHeading)
    return { ok: true, result: text }
  } catch (e) {
    return { ok: false, error: 'unreadable', detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }
  }
}

// Electron utilityProcess'te process.parentPort, Node'un fork'unda process.send ile konuşulur. İşler sırayla gelir.
const parentPort = (process as unknown as { parentPort?: { on(e: 'message', cb: (m: { data: unknown }) => void): void; postMessage(m: unknown): void } }).parentPort
if (parentPort) {
  parentPort.on('message', (m) => void runJob(m.data as DocumentJob).then((reply) => parentPort.postMessage(reply)))
} else if (process.send && process.env.ATLAS_WORKER === 'document') {
  // Yalnızca işçi olarak başlatıldıysa: dosyayı içe aktaran başka bir süreç (test) kendi kanalını dinletmesin.
  process.on('message', (m) => void runJob(m as DocumentJob).then((reply) => process.send?.(reply)))
}
