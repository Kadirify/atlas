import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Sürüm kapısı: yeni tam tur bir önceki üç tekrarlı tam turla karşılaştırılır. Mutlak bir başarı sınırı yerine
 * "belirgin düşüş var mı" denetlenir; set büyüdükçe ve zorlaştıkça sabit bir sınır anlamını yitirir. Ölçüm gürültülü
 * olduğu için düşüş istatistiksel olarak tanımlanır ve yalnızca iki turda da olan görevlere bakılır:
 *
 * 1. Toplamda ya da herhangi bir türde başarı oranı, bir önceki turun %95 Wilson aralığının alt sınırının altına inmiş.
 * 2. Bir önceki turda bütün denemelerini (en az üç) geçen bir görev bu turda bütün denemelerini (en az üç) kaybetmiş.
 */

/** Karşılaştırma için bir denemenin gereken kısmı (sonuç dosyasındaki RunResult'un alt kümesi) */
export interface Attempt {
  task: string
  category: string
  model: string
  ok: boolean
  skipped: string | null
}

/** Wilson aralığı: az sayıda denemede başarı oranının ne kadar güvenilir olduğunu gösterir */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0]
  const z = 1.96
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)]
}

export interface Comparison {
  /** İki turda da denenmiş görev sayısı; 0 ise karşılaştırma yapılamadı */
  tasks: number
  /** Belirgin düşüşler; boşsa kapı geçildi */
  problems: string[]
}

const pct = (x: number): string => `%${Math.round(x * 100)}`

/** Aynı modelin iki turunu karşılaştırır. Atlanan denemeler ve başka modellerin sonuçları sayılmaz. */
export function compareRuns(previous: Attempt[], current: Attempt[], model: string): Comparison {
  const pick = (list: Attempt[]): Attempt[] => list.filter((r) => r.model === model && !r.skipped)
  const prev = pick(previous)
  const cur = pick(current)
  const before = new Set(prev.map((r) => r.task))
  const common = new Set(cur.map((r) => r.task).filter((task) => before.has(task)))
  if (common.size === 0) return { tasks: 0, problems: [] }
  const p = prev.filter((r) => common.has(r.task))
  const c = cur.filter((r) => common.has(r.task))
  const problems: string[] = []

  const categories = [...new Set(c.map((r) => r.category))].sort()
  const groups: [string, (r: Attempt) => boolean][] = [['toplam', () => true], ...categories.map((name): [string, (r: Attempt) => boolean] => [name, (r) => r.category === name])]
  for (const [label, match] of groups) {
    const old = p.filter(match)
    const now = c.filter(match)
    if (old.length === 0 || now.length === 0) continue
    const okOld = old.filter((r) => r.ok).length
    const okNow = now.filter((r) => r.ok).length
    const [low] = wilson(okOld, old.length)
    if (okNow / now.length < low - 1e-9) {
      problems.push(
        `${label}: ${okNow}/${now.length} (${pct(okNow / now.length)}); önceki tur ${okOld}/${old.length} (${pct(okOld / old.length)}), %95 aralığının alt sınırı ${pct(low)}`
      )
    }
  }

  for (const task of [...common].sort()) {
    const old = p.filter((r) => r.task === task)
    const now = c.filter((r) => r.task === task)
    if (old.length >= 3 && now.length >= 3 && old.every((r) => r.ok) && now.every((r) => !r.ok)) {
      problems.push(`${task}: önceki turda ${old.length}/${old.length}, bu turda 0/${now.length}`)
    }
  }
  return { tasks: common.size, problems }
}

/** Kapı açıkken şimdiki turun karşılaştırılabilir olup olmadığı: değilse nedenleri */
export function gatePreconditions(options: { repeat: number; tasks: string[] | null }, results: Attempt[], model: string): string[] {
  const reasons: string[] = []
  if (options.repeat < 3) reasons.push(`tekrar sayısı ${options.repeat}; kapı için en az 3 gerekir (AJAN_REPEAT=3)`)
  if (options.tasks) reasons.push('yalnızca bazı görevler çalıştırıldı (AJAN_TASKS); kapı bütün setle çalışır')
  const skipped = [...new Set(results.filter((r) => r.model === model && r.skipped).map((r) => `${r.task} (${r.skipped})`))]
  if (skipped.length > 0) reasons.push(`atlanan görevler var: ${skipped.join(', ')}`)
  return reasons
}

/** Kapının sonucunu sonuç dosyasına yazar; düşen tur sonraki turların çizgisi olmaz. */
export function recordGate(file: string, gate: 'gecti' | 'dustu'): void {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { meta?: Record<string, unknown> }
  data.meta = { ...data.meta, gate }
  writeFileSync(file, JSON.stringify(data, null, 2))
}

/** Bir sonuç dosyasını okur; okunamazsa ya da biçimi bozuksa null. */
export function loadRun(file: string): { repeat: number; full: boolean; gate: string | null; results: Attempt[] } | null {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { meta?: { repeat?: unknown; full?: unknown; gate?: unknown }; results?: unknown }
    if (!Array.isArray(data.results)) return null
    return {
      repeat: typeof data.meta?.repeat === 'number' ? data.meta.repeat : 0,
      // Eski dosyalarda bu alanlar yok: tam tur ve kapıdan geçmiş sayılır.
      full: data.meta?.full !== false,
      gate: typeof data.meta?.gate === 'string' ? data.meta.gate : null,
      results: data.results as Attempt[]
    }
  } catch {
    return null
  }
}

/** Sonuç dosyalarının adı tarihtir ("2026-11-15-07-33.json"); ada göre sıralamak zamana göre sıralamaktır. */
const RESULT_FILE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/

/**
 * Karşılaştırılacak önceki tur: sonuç klasöründe şimdiki turdan önce yazılmış, en az üç tekrarlı, bütün görevlerle
 * yapılmış, kapıdan düşmemiş ve bu modelin sonuçlarını içeren en yeni dosya. Bulunamazsa null. Kapıdan düşen tur çizgi
 * sayılmaz: yoksa aynı tur yeniden çalıştırılınca düşüş görünmez olurdu.
 */
export function findBaseline(dir: string, currentFile: string, model: string): string | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const current = basename(currentFile)
  const candidates = names.filter((name) => RESULT_FILE.test(name) && name < current).sort().reverse()
  for (const name of candidates) {
    const run = loadRun(join(dir, name))
    if (run && run.repeat >= 3 && run.full && run.gate !== 'dustu' && run.results.some((r) => r.model === model && !r.skipped)) return join(dir, name)
  }
  return null
}
