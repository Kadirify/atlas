import { extname } from 'node:path'
import { Script } from 'node:vm'

/**
 * Kod alanında okuma ve düzenlemeyi küçük modeller için kolaylaştıran saf yardımcılar.
 *
 * - read_file metin dosyalarını satır numaralı verir ("12| kod"); model hatanın yerini, search_files'ın gösterdiği
 *   satırla aynı numarayla görür, uzun dosyada "line" ile devam eder.
 * - edit_file'da model bu numaraları da kopyalarsa atılır.
 * - Birebir eşleşme yoksa satırlar baştaki/sondaki boşluklar ve girinti yok sayılarak aranır; tek bir yer bulunursa
 *   orası değiştirilir ve yeni metnin girintisi dosyadakine uydurulur. Küçük modeller girintiyi sık yanlış kopyalıyor.
 */

/** "12| " biçimindeki satır numarası öneki */
const LINE_PREFIX = /^\s*\d+\| ?/

/** Metin dosyasının verilen satırdan başlayan, numaralı bir parçası */
export function numberedLines(
  text: string,
  fromLine: number,
  maxChars: number,
  maxLines: number
): { body: string; first: number; last: number; total: number } {
  const lines = text.split(/\r?\n/)
  // Dosya satır sonuyla bitiyorsa son boş "satır" sayılmaz.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const total = lines.length
  const first = Math.min(Math.max(1, Math.floor(fromLine) || 1), Math.max(1, total))
  const out: string[] = []
  let size = 0
  let last = first - 1
  for (let i = first - 1; i < total && out.length < maxLines; i++) {
    const raw = lines[i]
    const line = `${i + 1}| ${raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw}`
    if (out.length > 0 && size + line.length + 1 > maxChars) break
    out.push(line)
    size += line.length + 1
    last = i + 1
  }
  return { body: out.join('\n'), first, last, total }
}

function isNumbered(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return lines.length > 0 && lines.every((l) => LINE_PREFIX.test(l))
}

/**
 * Model read_file çıktısındaki satır numaralarını ("12| ") eski ve yeni metne de kopyaladıysa atılır. Eski metin
 * numaralıysa yeni metindeki numaralı satırlar da temizlenir (model yeni eklediği satırlara numara koymayabilir).
 */
export function stripLineNumbers(oldText: string, newText: string): { oldText: string; newText: string } {
  const strip = (text: string): string =>
    text
      .split('\n')
      .map((l) => l.replace(LINE_PREFIX, ''))
      .join('\n')
  if (isNumbered(oldText)) return { oldText: strip(oldText), newText: strip(newText) }
  if (isNumbered(newText)) return { oldText, newText: strip(newText) }
  return { oldText, newText }
}

const normalize = (line: string): string => line.trim().replace(/\s+/g, ' ')
const indentOf = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? ''

export type RelaxedResult = { after: string; at: number; length: number } | { error: 'none' } | { error: 'many'; count: number }

/**
 * Eski metni satır satır, boşluk ve girinti farkını yok sayarak arar. Tek bir yer bulunursa o satırlar yeni metinle
 * değiştirilir; yeni metnin girintisi, eşleşen ilk satırın dosyadaki girintisine göre kaydırılır. Satır sonu biçimi
 * (CRLF ya da LF) korunur.
 */
export function relaxedReplace(content: string, oldText: string, newText: string): RelaxedResult {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const fileLines = content.split('\n').map((l) => l.replace(/\r$/, ''))
  const oldLines = oldText.split(/\r?\n/)
  while (oldLines.length > 0 && !oldLines[0].trim()) oldLines.shift()
  while (oldLines.length > 0 && !oldLines[oldLines.length - 1].trim()) oldLines.pop()
  if (oldLines.length === 0) return { error: 'none' }
  const wanted = oldLines.map(normalize)

  const hits: number[] = []
  for (let i = 0; i + wanted.length <= fileLines.length; i++) {
    if (wanted.every((w, k) => normalize(fileLines[i + k]) === w)) hits.push(i)
  }
  if (hits.length === 0) return { error: 'none' }
  if (hits.length > 1) return { error: 'many', count: hits.length }

  const i = hits[0]
  // Satırların dosyadaki konumu (CRLF dosyada her satırın sonunda \r de vardır).
  const original = content.split('\n')
  let at = 0
  for (let j = 0; j < i; j++) at += original[j].length + 1
  let end = at
  for (let j = i; j < i + oldLines.length; j++) end += original[j].length + 1
  end -= 1 // son eşleşen satırın arkasındaki \n kalır
  if (original[i + oldLines.length - 1].endsWith('\r')) end -= 1 // \r de kalır

  const replacement = reindent(fileLines.slice(i, i + oldLines.length), wanted, newText.split(/\r?\n/)).join(eol)
  return { after: content.slice(0, at) + replacement + content.slice(end), at, length: replacement.length }
}

/**
 * Yeni metnin satırlarına dosyadaki girintiyi verir. Yeni satırlar eski satırlarla sırayla hizalanır:
 * - eski satırlardan biriyle aynıysa onun dosyadaki girintisini alır,
 * - sıradaki eski satırın önüne eklenmişse (o eski satır biraz aşağıda geliyorsa) onun girintisini,
 * - değiştirilmiş bir satırsa yerine geçtiği eski satırın girintisini alır.
 * Model kendi metninde bir satırı öncekinden daha içeri ya da dışarı yazdıysa bu fark korunur (yeni blok gibi).
 */
function reindent(fileOld: string[], wanted: string[], newLines: string[]): string[] {
  const n = wanted.length
  let p = 0
  let prevOut: string | null = null
  let prevModel = ''
  return newLines.map((line, k) => {
    if (!line.trim()) return ''
    const key = normalize(line)
    const model = indentOf(line)
    // Modelin bu satırı bir önceki yeni satıra göre içeri ya da dışarı yazdığı miktar
    const shift = (base: string): string => {
      if (prevOut === null) return base
      const delta = model.length - prevModel.length
      if (delta > 0) return prevOut + model.slice(prevModel.length)
      if (delta < 0) return prevOut.slice(0, Math.max(0, prevOut.length + delta))
      return base
    }
    let indent: string
    const same = wanted.slice(p, p + 4).indexOf(key)
    if (same !== -1) {
      indent = indentOf(fileOld[p + same])
      p += same + 1
    } else if (p < n && newLines.slice(k + 1, k + 5).some((l) => normalize(l) === wanted[p])) {
      indent = shift(indentOf(fileOld[p]))
    } else if (p < n) {
      indent = indentOf(fileOld[p])
      p++
    } else {
      indent = shift(prevOut ?? indentOf(fileOld[n - 1]))
    }
    prevOut = indent
    prevModel = model
    return indent + line.trimStart()
  })
}

/**
 * Eski metin dosyada bulunamadığında, ilk satırına en çok benzeyen yeri (çevresiyle, numaralı) verir: model ikinci
 * denemede doğru satırları kopyalayabilsin. Yeterince benzeyen bir satır yoksa null.
 */
export function closestLines(content: string, oldText: string): string | null {
  const firstOld = oldText.split(/\r?\n/).find((l) => l.trim())
  if (!firstOld) return null
  const words = (s: string): Set<string> => new Set(s.toLocaleLowerCase('tr').match(/[\p{L}\p{N}_]+/gu) ?? [])
  const target = words(firstOld)
  if (target.size === 0) return null
  const lines = content.split(/\r?\n/)
  let best = -1
  let bestScore = 0
  lines.forEach((line, i) => {
    const have = words(line)
    let score = 0
    for (const w of target) if (have.has(w)) score++
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  if (best < 0 || bestScore < Math.max(1, Math.ceil(target.size / 2))) return null
  const from = Math.max(0, best - 1)
  const to = Math.min(lines.length - 1, best + 1)
  return lines
    .slice(from, to + 1)
    .map((line, k) => `${from + k + 1}| ${line}`)
    .join('\n')
}

/**
 * Düzenlemeden sonra dosya bozulduysa hatanın kısa açıklaması: JSON için JSON.parse, CommonJS JavaScript için
 * derleme (çalıştırmadan). Model düzenlemenin dosyayı bozduğunu hemen görsün. Başka türlerde ya da sorun yoksa null.
 */
export function syntaxError(path: string, text: string): string | null {
  const ext = extname(path).toLowerCase()
  try {
    if (ext === '.json') JSON.parse(text.replace(/^\uFEFF/, ''))
    else if (ext === '.cjs' || (ext === '.js' && !/^\s*(?:import|export)\s/m.test(text))) new Script(text.replace(/^#!.*/, ''), { filename: path })
    return null
  } catch (err) {
    return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 200)
  }
}

/** "// ...", "# ... (diğer sabitler)", "/* geri kalanı aynı *\/" gibi, kodun atlandığını gösteren yer tutucu satırlar */
const PLACEHOLDER_DOTS = /^\s*(?:\/\/|#|--|\/\*+|<!--|\*)?\s*(?:\.{3}|…)/
const PLACEHOLDER_WORDS =
  /^\s*(?:\/\/|#|--|\/\*+|<!--|\*)\s*\(?\s*(?:diğer|geri kalan|kalan[ıi]|önceki|mevcut kod|ayn[ıi] kal|değişmeden|kısalt[ıi]ld[ıi]|rest of|remaining|existing code|other (?:lines|code)|unchanged|omitted)/i

function isPlaceholder(line: string): boolean {
  const text = line.trim()
  return (PLACEHOLDER_DOTS.test(text) && !/^\.{3}\w/.test(text)) || PLACEHOLDER_WORDS.test(text)
}

/**
 * Var olan bir dosyanın üstüne yazılacak içerik dosyayı kesip kısaltıyor mu: model dosyanın tamamını görmeden
 * write_file ile baştan yazınca satırların yerine "..." koyabiliyor ya da yarısını atabiliyor; dosyanın geri kalanı
 * silinir. Kısa dosyalarda sorun aranmaz.
 */
export function looksTruncated(before: string, after: string): boolean {
  const oldLines = before.split(/\r?\n/)
  if (oldLines.length < 20) return false
  const newLines = after.split(/\r?\n/)
  if (newLines.some((line) => isPlaceholder(line) && !oldLines.some((old) => old.trim() === line.trim()))) return true
  return oldLines.length > 100 && newLines.length < oldLines.length * 0.5
}
