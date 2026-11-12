import type { WaStats } from '@shared/types'
import { getLanguage, L } from '../../i18n'
import type { WaMessage } from './parse'

/**
 * Aynı kişinin bu süre içinde art arda attığı mesajlar tek "söz" sayılır.
 * Süre kısa tutulur: aralıklı atılan mesajlar tek cevap gibi sayılırsa kişi olduğundan çok mesaj atıyor görünür.
 */
const BURST_GAP_MS = 3 * 60_000
/** Örneklerde ve kurallarda bir cevabın en fazla kaç mesajı gösterilir */
export const MAX_BURST = 4
/** Bundan uzun süre sonra gelen cevap, öncekine cevap sayılmaz. */
const REPLY_WINDOW_MS = 6 * 60 * 60_000

export interface Burst {
  sender: string
  texts: string[]
  start: number
  end: number
}

export interface Pair {
  /** Karşı tarafın yazdığı */
  context: string
  /** Kişinin verdiği cevap; birden çok mesajsa satır satır */
  reply: string
  ts: number
}

export function toBursts(messages: WaMessage[]): Burst[] {
  const bursts: Burst[] = []
  for (const m of messages) {
    const last = bursts.at(-1)
    if (last && last.sender === m.sender && m.ts - last.end <= BURST_GAP_MS) {
      last.texts.push(m.text)
      last.end = m.ts
    } else {
      bursts.push({ sender: m.sender, texts: [m.text], start: m.ts, end: m.ts })
    }
  }
  return bursts
}

/** "Karşı taraf şunu yazdı → kişi şunu cevapladı" çiftleri. En yeni \`limit\` tanesi tutulur. */
export function buildPairs(messages: WaMessage[], target: string, limit = 3000): Pair[] {
  const bursts = toBursts(messages)
  const pairs: Pair[] = []
  for (let i = 1; i < bursts.length; i++) {
    const reply = bursts[i]
    const previous = bursts[i - 1]
    if (reply.sender !== target || previous.sender === target) continue
    if (reply.start - previous.end > REPLY_WINDOW_MS) continue
    pairs.push({
      context: previous.texts.join('\n').slice(-400),
      reply: reply.texts.slice(0, MAX_BURST).join('\n').slice(0, 500),
      ts: reply.start
    })
  }
  return pairs.slice(-limit)
}

const STOP_WORDS = new Set(
  `ve ile bir bu şu o da de ki mi mı mu mü için gibi çok daha en ama fakat veya ya ne ben sen biz siz onlar bana sana
  beni seni bize size onu ona bunu şunu var yok evet hayır tamam olur değil her şey zaten sonra önce şimdi bugün yarın
  kadar ise ben de bende sende diye neden nasıl nerede zaman hiç hep bi bir daha böyle şöyle öyle oldu olsun olmuş
  the and for you that this with are not but have was
  cok icin simdi degil sey soyle oyle boyle once bugun yarin hic`.split(/\s+/)
)

/** Karşısındakine seslenirken kullanılan yaygın kelimeler. */
const ADDRESS_WORDS = new Set(
  `kanka kanki knk kanks abi abla aga reis hocam hoca kardeşim kardesim kardeş kardes moruk bro lan olum oğlum oglum
  kızım kizim canım canim aşkım askim tatlım tatlim bebeğim bebegim birtanem hayatım hayatim güzelim guzelim gülüm
  dostum usta başkan baskan kuzen hacı haci müdür mudur şef sef patron
  dude mate buddy babe honey sweetie darling`.split(/\s+/)
)

const EMOJI = /\p{Extended_Pictographic}/gu
const TURKISH_LETTERS = /[çğışöüÇĞİŞÖÜ]/
const ELONGATION = /(\p{L})\1{2,}/u
/** Soru olduğu kelimelerinden anlaşılan mesajlar: soru eki ya da soru kelimesi içerenler. */
const QUESTION_WORDS =
  /(?:^|\s)(?:m[iıuü]|m[iıuü]y[iıuü]m|m[iıuü]s[iıuü]n|m[iıuü]y[iıuü]z|ne|neden|niye|nasıl|nasil|kaç|kac|kim|nerede|nereye|hangi|hangisi|what|why|how|when|where|who|which|does|did|are)(?=\s|\?|$)/i

/**
 * Sohbetin küçük harfe çevirme kuralı. Türkçede "I" küçülünce "ı" olur; İngilizce bir sohbette
 * aynı kural "I" zamirini ve "It", "In" gibi kelimeleri bozar. Türkçeye özgü harf içeren mesaj
 * oranı çok düşükse sohbet Türkçe sayılmaz.
 */
export function caseLocale(messages: string[]): 'tr' | 'en' {
  if (messages.length === 0) return 'tr'
  const turkish = messages.filter((m) => TURKISH_LETTERS.test(m)).length
  return turkish / messages.length >= 0.03 ? 'tr' : 'en'
}

function words(text: string, locale: 'tr' | 'en' = 'tr'): string[] {
  return text
    .toLocaleLowerCase(locale)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Gülme ifadesi mi: "ahahah", "hahaha" ya da "sjsjsj" gibi rastgele tuşlama. */
export function laughKind(word: string): 'haha' | 'random' | null {
  if (word.length < 4) return null
  if (/^[ah]{4,}$/.test(word) && word.includes('a') && word.includes('h')) return 'haha'
  if (/^(?:he){2,}h?$|^(?:hi){2,}h?$|^(?:ki){2,}k?$/.test(word)) return 'haha'
  // Rastgele tuşlama: klavyenin orta sırasındaki harfler, neredeyse hiç sesli yok.
  if (word.length >= 5 && /^[asdfghjklşi]+$/.test(word)) {
    const vowels = (word.match(/[aeıioöuü]/g) ?? []).length
    if (vowels / word.length <= 0.34 && new Set(word).size <= 6) return 'random'
  }
  return null
}

function top<T>(counts: Map<T, number>, n: number, min = 1): T[] {
  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

function bump<T>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/** Cevapların orta yarısının kaç mesajdan oluştuğu (25. ve 75. yüzdelik), en fazla MAX_BURST. */
function typicalRange(sizes: number[]): [number, number] {
  if (sizes.length === 0) return [1, 1]
  const sorted = [...sizes].sort((a, b) => a - b)
  const at = (q: number): number => Math.min(MAX_BURST, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))])
  return [at(0.25), at(0.75)]
}

const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits

/**
 * Kişinin mesajlarından yazım alışkanlıklarını sayar.
 * @param messages kişinin tek tek mesajları
 * @param burstSizes art arda attığı mesaj sayıları
 */
export function analyze(messages: string[], burstSizes: number[]): WaStats {
  const n = messages.length || 1
  let wordTotal = 0
  let startsWithLetter = 0
  let lowercase = 0
  let endPunct = 0
  let questions = 0
  let questionsMarked = 0
  let longEnough = 0
  let turkish = 0
  let withEmoji = 0
  let elongated = 0
  const emojis = new Map<string, number>()
  const wordCounts = new Map<string, number>()
  const phraseCounts = new Map<string, number>()
  const address = new Map<string, number>()
  const laughs = new Map<string, number>()
  const laughKinds = new Map<string, number>()

  const locale = caseLocale(messages)

  for (const message of messages) {
    const tokens = words(message, locale)
    wordTotal += tokens.length

    const first = message.trimStart()[0] ?? ''
    if (/\p{L}/u.test(first)) {
      startsWithLetter++
      if (first === first.toLocaleLowerCase('tr') && first !== first.toLocaleUpperCase('tr')) lowercase++
    }
    if (/[.!…]$/.test(message.trimEnd())) endPunct++
    if (QUESTION_WORDS.test(message)) {
      questions++
      if (message.includes('?')) questionsMarked++
    }
    if (tokens.length >= 4) {
      longEnough++
      if (TURKISH_LETTERS.test(message)) turkish++
    }
    const found = message.match(EMOJI)
    if (found) {
      withEmoji++
      for (const e of found) bump(emojis, e)
    }
    if (tokens.some((t) => ELONGATION.test(t) && !laughKind(t))) elongated++

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const kind = laughKind(token)
      if (kind) {
        bump(laughKinds, kind)
        // Rastgele tuşlamalar her seferinde farklıdır; örnek olarak kısa bir hali saklanır.
        bump(laughs, kind === 'random' ? token.slice(0, 6) : token.slice(0, 7))
        continue
      }
      if (ADDRESS_WORDS.has(token)) bump(address, token)
      if (token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)) bump(wordCounts, token)
      const next = tokens[i + 1]
      if (next && !laughKind(next) && !(STOP_WORDS.has(token) && STOP_WORDS.has(next))) {
        bump(phraseCounts, `${token} ${next}`)
      }
    }
  }

  const mainLaugh = top(laughKinds, 1, 3)[0]
  const laughExamples = [...laughs.entries()].filter(([w]) => laughKind(w) === mainLaugh).sort((a, b) => b[1] - a[1])

  // Örnekler: ne çok kısa ne çok uzun mesajlardan, konuşmanın her yerinden eşit aralıkla.
  const candidates = messages.filter((m) => {
    const count = words(m, locale).length
    return count >= 3 && count <= 25 && !/https?:\/\//.test(m)
  })
  const step = Math.max(1, Math.floor(candidates.length / 14))
  const samples = candidates.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, 14)

  return {
    messages: messages.length,
    avgWords: round(wordTotal / n, 1),
    avgBurst: round(burstSizes.reduce((a, b) => a + b, 0) / (burstSizes.length || 1), 1),
    burstTypical: typicalRange(burstSizes),
    lowercaseStart: round(lowercase / (startsWithLetter || 1)),
    endPunctuation: round(endPunct / n),
    // Yeterince soru yoksa bu konuda kural çıkarılmaz.
    questionMark: questions >= 8 ? round(questionsMarked / questions) : undefined,
    turkishChars: round(turkish / (longEnough || 1)),
    emojiRate: round(withEmoji / n),
    topEmojis: top(emojis, 5, 2),
    elongation: round(elongated / n),
    laughter: mainLaugh ? (laughExamples[0]?.[0] ?? '') : '',
    topWords: top(wordCounts, 14, Math.max(3, Math.round(n * 0.004))),
    topPhrases: top(phraseCounts, 6, Math.max(4, Math.round(n * 0.004))),
    address: top(address, 3, 3),
    samples
  }
}

/** Sayılardan, modelin uyacağı açık yazım kuralları çıkarır. Kurallar geçerli dilde yazılır. */
export function styleRules(stats: WaStats): string[] {
  const t = L().tools.whatsapp.style
  const rules: string[] = []
  const pct = (x: number): number => Math.round(x * 100)

  rules.push(stats.avgWords <= 4 ? t.veryShort(stats.avgWords) : stats.avgWords <= 9 ? t.short(stats.avgWords) : t.long(stats.avgWords))
  // Sabit bir sayı verilirse model her cevapta tam o kadar mesaj atar; gerçek insan öyle yazmaz.
  // Bu yüzden kural bir aralık söyler ve sayıyı değiştirmesini ister.
  const [low, high] = stats.burstTypical ?? [1, stats.avgBurst >= 1.6 ? 3 : 1]
  rules.push(high <= 1 ? t.singleMessage : t.burst(low, high))

  if (stats.lowercaseStart >= 0.7) rules.push(t.lowercaseStart)
  else if (stats.lowercaseStart <= 0.25) rules.push(t.uppercaseStart)

  if (stats.endPunctuation <= 0.15) rules.push(t.noEndPunctuation)
  else if (stats.endPunctuation >= 0.5) rules.push(t.endPunctuation)

  if (stats.questionMark !== undefined) {
    if (stats.questionMark <= 0.2) rules.push(t.noQuestionMark)
    else if (stats.questionMark >= 0.7) rules.push(t.questionMark)
  }

  // Türkçe harf kuralı yalnızca Türkçe bir sohbette anlamlıdır. Türkçe arayüzde sohbet Türkçe sayılır;
  // başka dilde, kişinin Türkçe harfleri en azından ara sıra kullandığı görülmüşse (yani sohbet
  // Türkçeyse) yazılır. Yoksa İngilizce yazan herkese bu kural çıkardı.
  if (stats.turkishChars <= 0.25 && (getLanguage() === 'tr' || stats.turkishChars > 0)) {
    rules.push(t.noTurkishLetters)
  }

  if (stats.emojiRate <= 0.03) rules.push(t.noEmoji)
  else rules.push(t.emoji(pct(stats.emojiRate), stats.topEmojis))

  if (stats.elongation >= 0.05) rules.push(t.elongation)
  if (stats.laughter) rules.push(t.laughter(stats.laughter))
  if (stats.address.length > 0) rules.push(t.address(stats.address))
  if (stats.topWords.length > 0) rules.push(t.topWords(stats.topWords.slice(0, 10)))
  if (stats.topPhrases.length > 0) rules.push(t.topPhrases(stats.topPhrases))
  return rules
}
