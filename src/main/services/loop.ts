/**
 * Küçük modeller uzun cevaplarda aynı satırı ya da cümleyi sonsuza kadar
 * tekrar edebilir. Buradaki kontroller bunu fark eder ve cevabın nereden
 * kesilmesi gerektiğini söyler.
 */

/** Aynı satır son satırlarda bu kadar kez geçerse döngü sayılır. */
const LINE_REPEAT_LIMIT = 6
/** Kaç satır geriye bakılacağı */
const LINE_WINDOW = 40
/** Bundan kısa satırlar (`}`, `---`, tablo çizgisi gibi) sayılmaz. */
const MIN_LINE_KEY = 12

/**
 * Baştaki madde işareti ve numara atılır ki "2.14. Sonuçlar" ile "2.15. Sonuçlar"
 * aynı sayılsın. Satırın içindeki sayılar kalır: "2020: 150 adet" ile
 * "2021: 180 adet" gibi gerçek listeler döngü sanılmasın.
 */
function lineKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/^[\s*#>\-+\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Line {
  start: number
  key: string
}

function nonEmptyLines(text: string): Line[] {
  const lines: Line[] = []
  let offset = 0
  for (const raw of text.split('\n')) {
    const key = lineKey(raw)
    if (key) lines.push({ start: offset, key })
    offset += raw.length + 1
  }
  return lines
}

function findLineLoop(text: string): number | null {
  const lines = nonEmptyLines(text)
  const counts = new Map<string, number>()
  for (const line of lines.slice(-LINE_WINDOW)) {
    if (line.key.length < MIN_LINE_KEY) continue
    const count = (counts.get(line.key) ?? 0) + 1
    if (count < LINE_REPEAT_LIMIT) {
      counts.set(line.key, count)
      continue
    }
    // İlk iki geçişi bırak, üçüncüden itibaren kes.
    const third = lines.filter((l) => l.key === line.key)[2]
    // Yarım kalmış bir başlık bırakmamak için önceki paragraf sonuna çekil.
    const paragraphEnd = text.lastIndexOf('\n\n', third.start)
    return paragraphEnd > 0 && third.start - paragraphEnd < 400 ? paragraphEnd : third.start
  }
  return null
}

/** Satır sonu olmadan dönen tekrarlar: aynı parça art arda üç kez. */
function findInlineLoop(text: string): number | null {
  const maxPeriod = Math.min(240, Math.floor(text.length / 3))
  for (let period = 24; period <= maxPeriod; period++) {
    const tail = text.slice(-3 * period)
    if (tail.slice(0, 2 * period) !== tail.slice(period)) continue
    // "=====" ya da boşluk dizisi gibi tek tip dolgular döngü değildir.
    if (new Set(tail.slice(0, period)).size < 8) continue
    return text.length - 2 * period
  }
  return null
}

/**
 * Metin tekrar döngüsüne girdiyse kesilmesi gereken konumu,
 * girmediyse null döndürür.
 */
export function findLoopStart(text: string): number | null {
  return findLineLoop(text) ?? findInlineLoop(text)
}
