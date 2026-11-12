export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

/** Bundan büyük dosyalarda satır satır karşılaştırma yapılmaz. */
const MAX_CELLS = 400_000

/**
 * İki metni satır satır karşılaştırır (en uzun ortak alt dizi).
 * Çok büyük metinlerde null döner; o zaman yalnızca yeni içerik gösterilir.
 */
export function lineDiff(before: string, after: string): DiffLine[] | null {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > MAX_CELLS) return null

  // lcs[i][j]: a'nın i'den, b'nin j'den sonrasının ortak satır sayısı
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ type: 'del', text: a[i++] })
    } else {
      lines.push({ type: 'add', text: b[j++] })
    }
  }
  while (i < a.length) lines.push({ type: 'del', text: a[i++] })
  while (j < b.length) lines.push({ type: 'add', text: b[j++] })
  return lines
}

/** Değişmeyen uzun bölümleri kısaltır: her değişikliğin çevresinde birkaç satır bırakır. */
export function collapse(lines: DiffLine[], context = 3): (DiffLine | { type: 'skip'; count: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.type === 'same') return
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true
  })
  const out: (DiffLine | { type: 'skip'; count: number })[] = []
  let skipped = 0
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped > 0) out.push({ type: 'skip', count: skipped })
      skipped = 0
      out.push(line)
    } else skipped++
  })
  if (skipped > 0) out.push({ type: 'skip', count: skipped })
  return out
}
