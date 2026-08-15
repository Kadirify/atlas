/**
 * WhatsApp'ın "Sohbeti dışa aktar" dosyasını okur.
 * Android ve iPhone biçimlerini, Türkçe ve İngilizce tarih yazımlarını tanır.
 */

export interface WaMessage {
  sender: string
  text: string
  /** Mesajın zamanı (milisaniye) */
  ts: number
}

export interface ParsedChat {
  messages: WaMessage[]
  /** Mesaj sayısına göre çoktan aza */
  participants: { name: string; count: number }[]
}

interface RawLine {
  a: number
  b: number
  year: number
  hour: number
  minute: number
  second: number
  rest: string
}

// Android: "11.11.2026 21:34 - Ali: mesaj"   iPhone: "[11.11.2026 21:34:05] Ali: mesaj"
const HEADER =
  /^[‎‏﻿]*\[?(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?|ÖÖ|ÖS)?\]?\s*(?:[-–]\s+)?(.*)$/u

/** Yazı olmayan içerikler: medya yer tutucuları, silinen mesajlar, aramalar. */
const NOT_TEXT =
  /dahil edilmedi|omitted>?$|bu mesaj silindi|bu mesajı sildiniz|this message was deleted|you deleted this message|<attached:|\(dosya ekli\)|\(file attached\)|sesli arama|görüntülü arama|voice call|video call|^konum: https|^location: https|\.vcf\b|^null$/i

const EDITED = /\s*<(?:bu mesaj düzenlendi|this message was edited)>\s*$/i
const INVISIBLE = /[‎‏‪-‮﻿]/g

function parseHeader(line: string): RawLine | null {
  const m = HEADER.exec(line)
  if (!m) return null
  let hour = Number(m[4])
  const meridiem = (m[7] ?? '').toLowerCase().replace(/[.\s]/g, '')
  if ((meridiem === 'pm' || meridiem === 'ös') && hour < 12) hour += 12
  if ((meridiem === 'am' || meridiem === 'öö') && hour === 12) hour = 0
  const year = Number(m[3])
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    year: year < 100 ? 2000 + year : year,
    hour,
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
    rest: m[8]
  }
}

export function parseChat(raw: string): ParsedChat {
  const entries: { head: RawLine; sender: string; text: string }[] = []

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const head = parseHeader(line)
    if (!head) {
      // Tarihle başlamayan satır, bir önceki mesajın devamıdır.
      const last = entries.at(-1)
      if (last && line.trim()) last.text += '\n' + line
      continue
    }
    const split = /^([^:]{1,50}):\s?([\s\S]*)$/.exec(head.rest)
    // Gönderen adı olmayan satırlar sistem mesajıdır ("Ali grubu oluşturdu").
    if (!split) {
      entries.push({ head, sender: '', text: '' })
      continue
    }
    entries.push({ head, sender: split[1].replace(INVISIBLE, '').trim(), text: split[2] })
  }

  // Gün/ay sırası ülkeye göre değişir: 12'den büyük sayı hangi sıradaysa gün odur.
  const firstOver12 = entries.some((e) => e.head.a > 12)
  const secondOver12 = entries.some((e) => e.head.b > 12)
  const monthFirst = secondOver12 && !firstOver12

  const messages: WaMessage[] = []
  const counts = new Map<string, number>()
  for (const { head, sender, text } of entries) {
    const clean = text.replace(INVISIBLE, '').replace(EDITED, '').trim()
    if (!sender || !clean || NOT_TEXT.test(clean)) continue
    const day = monthFirst ? head.b : head.a
    const month = monthFirst ? head.a : head.b
    messages.push({
      sender,
      text: clean,
      ts: new Date(head.year, month - 1, day, head.hour, head.minute, head.second).getTime()
    })
    counts.set(sender, (counts.get(sender) ?? 0) + 1)
  }

  return {
    messages,
    participants: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count)
  }
}
