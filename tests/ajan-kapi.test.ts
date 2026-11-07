import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareRuns, findBaseline, gatePreconditions, loadRun, recordGate, wilson, type Attempt } from '../eval/ajan/compare'

const M = 'atlas-guclu:latest'

/** "görev:tür:sonuçlar" biçiminden denemeler; sonuçlarda 1 geçti, 0 kaldı demektir. */
function runs(spec: string[], model = M): Attempt[] {
  return spec.flatMap((line) => {
    const [task, category, marks] = line.split(':')
    return [...marks].map((mark) => ({ task, category, model, ok: mark === '1', skipped: null }))
  })
}

/** n görev, hepsi aynı türde ve aynı sonuçlarla */
const many = (prefix: string, category: string, n: number, marks: string): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}:${category}:${marks}`)

describe('wilson', () => {
  it('belgedeki örneği verir: 141/162 için %81-91', () => {
    const [low, high] = wilson(141, 162)
    expect(low).toBeCloseTo(0.81, 2)
    expect(high).toBeCloseTo(0.914, 2)
    expect(wilson(0, 0)).toEqual([0, 0])
  })
})

describe('compareRuns: bir önceki tura göre belirgin düşüş', () => {
  it('aynı sonuçta ve gürültü sınırındaki küçük oynamada kapı geçilir', () => {
    const before = runs([...many('kod', 'kod', 10, '111'), ...many('sql', 'sql', 10, '111')])
    expect(compareRuns(before, before, M)).toEqual({ tasks: 20, problems: [] })
    // Üç görev birer deneme kaybetti (27/30): önceki turun aralığı içinde kalır.
    const noisy = runs([...many('kod', 'kod', 3, '011'), ...many('kod', 'kod', 10, '111').slice(3), ...many('sql', 'sql', 10, '111')])
    expect(compareRuns(before, noisy, M).problems).toEqual([])
  })

  it('toplamda ya da bir türde aralığın altına inen düşüşü yakalar', () => {
    const before = runs([...many('kod', 'kod', 10, '111'), ...many('sql', 'sql', 10, '111')])
    // Dört kod görevi birer deneme kaybetti: kod 26/30, toplam 56/60.
    const worse = runs([...many('kod', 'kod', 4, '011'), ...many('kod', 'kod', 10, '111').slice(4), ...many('sql', 'sql', 10, '111')])
    const { problems } = compareRuns(before, worse, M)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^toplam: 56\/60 \(%93\); önceki tur 60\/60 \(%100\), %95 aralığının alt sınırı %94$/)
    expect(problems[1]).toMatch(/^kod: 26\/30 \(%87\)/)
  })

  it('önceki turda hep geçen görevin bu turda hep kalmasını yakalar', () => {
    const before = runs([...many('g', 'kod', 30, '111')])
    const broken = runs([...many('g', 'kod', 29, '111'), 'g29:kod:000'])
    // Toplam 87/90 aralığın içinde kalır ama bir görev tamamen bozuldu.
    expect(compareRuns(before, broken, M).problems).toEqual(['g29: önceki turda 3/3, bu turda 0/3'])
    // Önceden de oynak olan görev (2/3) ya da tek denemeli turlar bu kurala girmez.
    expect(compareRuns(runs(['a:kod:011', ...many('g', 'kod', 30, '111')]), runs(['a:kod:000', ...many('g', 'kod', 30, '111')]), M).problems).toEqual([])
    expect(compareRuns(runs(['a:kod:1', ...many('g', 'kod', 30, '1')]), runs(['a:kod:0', ...many('g', 'kod', 30, '1')]), M).problems).toEqual([])
  })

  it('yalnızca iki turda da olan görevlere ve aynı modele bakar; atlanan denemeleri saymaz', () => {
    const before = runs([...many('g', 'kod', 10, '111'), 'kaldirildi:kod:000'])
    const current = [
      ...runs([...many('g', 'kod', 10, '111'), 'yeni:kod:000']),
      ...runs([...many('g', 'kod', 10, '000')], 'baska-model'),
      { task: 'g0', category: 'kod', model: M, ok: false, skipped: 'git kurulu değil' }
    ]
    expect(compareRuns(before, current, M)).toEqual({ tasks: 10, problems: [] })
    expect(compareRuns(before, runs(['yeni:kod:111']), M)).toEqual({ tasks: 0, problems: [] })
  })
})

describe('findBaseline: karşılaştırılacak önceki tur', () => {
  it('şimdiki turdan önceki, en az üç tekrarlı ve bu modeli içeren en yeni dosyayı seçer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-kapi-'))
    try {
      const write = (name: string, repeat: number, model: string): void =>
        writeFileSync(join(dir, name), JSON.stringify({ meta: { repeat }, results: runs(['a:kod:111'], model) }))
      write('2026-11-13-06-17.json', 1, M)
      write('2026-11-15-07-33.json', 3, M)
      write('2026-11-16-10-00.json', 3, 'baska-model')
      writeFileSync(join(dir, '2026-11-17-08-00.json'), '{ bozuk')
      write('notlar.json', 3, M)
      write('2026-11-21-09-00.json', 3, M)

      expect(findBaseline(dir, join('herhangi', '2026-11-20-09-00.json'), M)).toBe(join(dir, '2026-11-15-07-33.json'))
      expect(findBaseline(dir, '2026-11-20-09-00.json', 'baska-model')).toBe(join(dir, '2026-11-16-10-00.json'))
      // İlk üç tekrarlı tur: öncesinde yalnızca tek tekrarlı tur var.
      expect(findBaseline(dir, '2026-11-15-07-33.json', M)).toBeNull()
      expect(findBaseline(join(dir, 'yok'), '2026-11-20-09-00.json', M)).toBeNull()

      expect(loadRun(join(dir, '2026-11-17-08-00.json'))).toBeNull()
      expect(loadRun(join(dir, '2026-11-15-07-33.json'))?.repeat).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("depodaki gerçek sonuçlarla: 15 Kasım turu bundan sonrakilerin çizgisi", () => {
    const dir = join('eval', 'ajan', 'results')
    expect(findBaseline(dir, '2026-12-01-00-00.json', M)).toBe(join(dir, '2026-11-15-07-33.json'))
    expect(findBaseline(dir, '2026-11-15-07-33.json', M)).toBeNull()
  })
})

describe('kapının güvenceleri', () => {
  it('eksik turu kapıdan geçirmez', () => {
    expect(gatePreconditions({ repeat: 3, tasks: null }, runs(['a:kod:111']), M)).toEqual([])
    expect(gatePreconditions({ repeat: 1, tasks: null }, runs(['a:kod:1']), M)[0]).toContain('en az 3')
    expect(gatePreconditions({ repeat: 3, tasks: ['a'] }, runs(['a:kod:111']), M)[0]).toContain('AJAN_TASKS')
    const skipped = [{ task: 'git-durum', category: 'komut', model: M, ok: false, skipped: 'git kurulu değil' }]
    expect(gatePreconditions({ repeat: 3, tasks: null }, skipped, M)[0]).toContain('git-durum (git kurulu değil)')
  })

  it('kapıdan düşen ya da filtreli tur çizgi sayılmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-kapi-'))
    try {
      const write = (name: string, meta: Record<string, unknown>): void =>
        writeFileSync(join(dir, name), JSON.stringify({ meta: { repeat: 3, ...meta }, results: runs(['a:kod:111']) }))
      write('2026-11-15-07-33.json', {})
      write('2026-11-16-00-00.json', { full: false })
      write('2026-11-17-00-00.json', {})
      recordGate(join(dir, '2026-11-17-00-00.json'), 'dustu')
      expect(loadRun(join(dir, '2026-11-17-00-00.json'))?.gate).toBe('dustu')
      expect(findBaseline(dir, '2026-11-20-00-00.json', M)).toBe(join(dir, '2026-11-15-07-33.json'))
      recordGate(join(dir, '2026-11-17-00-00.json'), 'gecti')
      expect(findBaseline(dir, '2026-11-20-00-00.json', M)).toBe(join(dir, '2026-11-17-00-00.json'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
