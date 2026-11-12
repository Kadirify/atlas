// Ölçüm setinin otomatik puanlama kuralları. Her kural bir cevabı alır ve geçti/kaldı döndürür.
// Hakem model kullanılmaz: sonuçlar her çalıştırmada aynı çıkar ve herkes yeniden üretebilir.

const TR_WORDS = new Set(
  've bir bu şu için ile de da mi mı mu mü ne çok değil olarak gibi ama daha en her var yok ben sen biz siz o ki ya veya ise kadar sonra önce nasıl neden evet hayır merhaba teşekkür lütfen olan olur oldu'.split(
    ' '
  )
)
const EN_WORDS = new Set(
  'the and is are of to in that it for with you this was be on as have at by not or from but an will can your we they what how why yes no hello thanks please'.split(
    ' '
  )
)

export function words(text) {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Metnin ağırlıklı dili: 'tr', 'en' ya da belirsizse null. */
export function languageOf(text) {
  const list = words(text)
  let tr = 0
  let en = 0
  for (const w of list) {
    if (TR_WORDS.has(w)) tr++
    if (EN_WORDS.has(w)) en++
  }
  // Türkçeye özgü harfler güçlü bir işarettir.
  tr += (text.match(/[çğışöüÇĞİŞÖÜ]/g) ?? []).length * 0.5
  if (tr === 0 && en === 0) return null
  return tr >= en ? 'tr' : 'en'
}

export function sentenceCount(text) {
  return text
    .replace(/\d+[.,]\d+/g, '0')
    .split(/[.!?…]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s)).length
}

export function lineCount(text) {
  return text
    .replace(/```[\w-]*\n?|```/g, '')
    .split('\n')
    .filter((l) => l.trim()).length
}

/** Aynı satırın ya da cümlenin art arda dönmesi (tekrar döngüsü). */
export function hasLoop(text) {
  const key = (line) =>
    line
      .toLowerCase()
      .replace(/^[\s*#>\-+\d.)]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
  const counts = new Map()
  for (const line of text.split('\n')) {
    const k = key(line)
    if (k.length < 12) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
    if (counts.get(k) >= 4) return true
  }
  for (let period = 24; period <= Math.min(240, Math.floor(text.length / 3)); period++) {
    const tail = text.slice(-3 * period)
    if (tail.slice(0, 2 * period) === tail.slice(period) && new Set(tail.slice(0, period)).size >= 8) return true
  }
  return false
}

function extractJson(text) {
  const cleaned = text.replace(/```[\w-]*\n?|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Tek bir kuralı uygular. */
export function runCheck(check, output) {
  const text = output.trim()
  switch (check.type) {
    case 'regex':
      return check.pattern.test(text)
    case 'notRegex':
      return !check.pattern.test(text)
    case 'maxWords':
      return words(text).length <= check.n
    case 'minWords':
      return words(text).length >= check.n
    case 'lang':
      return languageOf(text) === check.value
    case 'sentences':
      return sentenceCount(text) >= check.min && sentenceCount(text) <= check.max
    case 'lines':
      return lineCount(text) >= check.min && lineCount(text) <= check.max
    case 'noLoop':
      return !hasLoop(text)
    case 'json': {
      const parsed = extractJson(text)
      return !!parsed && check.keys.every((k) => k in parsed)
    }
    case 'onlyJson':
      // Başında ya da sonunda açıklama olmadan yalnızca JSON
      return /^\s*(```[\w-]*\s*)?\{[\s\S]*\}\s*(```)?\s*$/.test(text)
    default:
      throw new Error(`Bilinmeyen kural: ${check.type}`)
  }
}

/** Bir sorunun puanı: geçen kuralların oranı (0 ile 1 arası). Boş cevap sıfırdır. */
export function scoreItem(item, output) {
  if (!output.trim()) return { score: 0, passed: item.checks.map(() => false) }
  const passed = item.checks.map((c) => {
    try {
      return runCheck(c, output)
    } catch {
      return false
    }
  })
  return { score: passed.filter(Boolean).length / passed.length, passed }
}
