/** Metin üzerinde çalışan, arayüz ve ana süreç tarafından ortak kullanılan küçük yardımcılar. */

export interface DiffPart {
  type: 'same' | 'add' | 'del'
  text: string
}

/** Karşılaştırma tablosu bu kadar hücreyi aşarsa fark hesaplanmaz (bellek ve süre için). */
const MAX_DIFF_CELLS = 6_000_000

/**
 * İki metin arasındaki farkı kelime kelime verir: aynı kalan, eklenen ve silinen parçalar.
 * Boşluklar ayrı parça sayılır, böylece satır sonları ve girintiler korunur. Metinler çok uzunsa null döner.
 */
export function wordDiff(before: string, after: string): DiffPart[] | null {
  const a = before.split(/(\s+)/).filter((x) => x !== '')
  const b = after.split(/(\s+)/).filter((x) => x !== '')
  // Baştaki ve sondaki ortak kısım tabloya girmez; uzun belgelerde küçük değişiklikler böyle hızlı çıkar.
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const x = a.slice(head, a.length - tail)
  const y = b.slice(head, b.length - tail)
  if (x.length * y.length > MAX_DIFF_CELLS) return null

  const width = y.length + 1
  const table = new Uint32Array((x.length + 1) * width)
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      table[i * width + j] = x[i] === y[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string): void => {
    const last = parts[parts.length - 1]
    if (last && last.type === type) last.text += text
    else parts.push({ type, text })
  }
  for (const word of a.slice(0, head)) push('same', word)
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push('same', x[i])
      i++
      j++
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push('del', x[i++])
    } else {
      push('add', y[j++])
    }
  }
  while (i < x.length) push('del', x[i++])
  while (j < y.length) push('add', y[j++])
  for (const word of a.slice(a.length - tail)) push('same', word)
  return parts
}

export interface TextChunk {
  /** İşlenecek metin */
  body: string
  /** Parçadan sonra gelen ve aynen korunacak ayraç (boş satırlar) */
  separator: string
}

/**
 * Uzun bir metni paragraf sınırlarından, her biri en çok `limit` karakter olan parçalara böler.
 * Parçalar ve ayraçlar sırayla birleştirilince özgün metin birebir geri gelir.
 * Tek başına sınırı aşan bir paragraf satır sonlarından, o da yetmezse sınırdan bölünür.
 */
export function chunkText(text: string, limit = 2500): TextChunk[] {
  const pieces = text.split(/(\n[ \t]*\n\s*)/)
  const units: TextChunk[] = []
  for (let i = 0; i < pieces.length; i += 2) {
    const paragraph = pieces[i]
    const separator = pieces[i + 1] ?? ''
    if (paragraph.length <= limit) {
      units.push({ body: paragraph, separator })
      continue
    }
    // Uzun paragraf: önce satırlara, gerekirse sabit uzunlukta dilimlere.
    const lines = paragraph.split(/(\n)/)
    const parts: TextChunk[] = []
    for (let k = 0; k < lines.length; k += 2) {
      let line = lines[k]
      const lineBreak = lines[k + 1] ?? ''
      while (line.length > limit) {
        parts.push({ body: line.slice(0, limit), separator: '' })
        line = line.slice(limit)
      }
      parts.push({ body: line, separator: lineBreak })
    }
    parts[parts.length - 1].separator += separator
    units.push(...parts)
  }

  // Küçük paragraflar aynı parçada toplanır; model her parçada yeterli bağlam görür.
  const chunks: TextChunk[] = []
  for (const unit of units) {
    const last = chunks[chunks.length - 1]
    if (last && last.body.length + last.separator.length + unit.body.length <= limit) {
      last.body += last.separator + unit.body
      last.separator = unit.separator
    } else {
      chunks.push({ ...unit })
    }
  }
  return chunks
}
