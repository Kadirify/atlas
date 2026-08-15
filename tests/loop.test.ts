import { describe, expect, it } from 'vitest'
import { findLoopStart } from '../src/main/services/loop'

const intro = [
  '# Ekip Toplantısı Gündemi',
  '',
  '2.9. Duyarlılık ve İletişim',
  '',
  '* İletişim stratejileri ve iletişim kanallarını tartışalım.',
  '',
  '2.10. İlgili Önemli Değişiklikler',
  '',
  '* Gelecek ayın projelerinde beklenen değişiklikleri ele alın.',
  ''
].join('\n')

function loopingAgenda(sections: number): string {
  let text = intro
  for (let i = 11; i < 11 + sections; i++) {
    text += `\n2.${i}. Toplantının Sonuçları\n\n* Toplantının sonuçlarını ve hedeflerini açıklayın.\n* Toplantının sonuçlarını ve hedeflerini açıklayın.\n`
  }
  return text
}

describe('findLoopStart', () => {
  it('numarası değişen ama aynı satırları tekrar eden cevabı yakalar', () => {
    const text = loopingAgenda(8)
    const cut = findLoopStart(text)
    expect(cut).not.toBeNull()
    const kept = text.slice(0, cut!)
    expect(kept).toContain('2.10. İlgili Önemli Değişiklikler')
    expect(kept.split('Toplantının sonuçlarını ve hedeflerini açıklayın.').length - 1).toBeLessThanOrEqual(2)
    expect(kept.length).toBeLessThan(text.length / 2)
  })

  it('birkaç kez tekrar normaldir', () => {
    expect(findLoopStart(loopingAgenda(2))).toBeNull()
  })

  it('satır sonu olmadan dönen cümleyi yakalar', () => {
    const sentence = 'Toplantının sonuçlarını ve hedeflerini açıklayın. '
    const text = 'Gündem şu şekilde olabilir. ' + sentence.repeat(5)
    const cut = findLoopStart(text)
    expect(cut).not.toBeNull()
    expect(text.slice(0, cut!)).toContain('Gündem şu şekilde olabilir.')
  })

  it('normal uzun metne dokunmaz', () => {
    const text = Array.from(
      { length: 60 },
      (_, i) => `${i + 1}. Madde ${i + 1}: ${'farklı bir içerik '.repeat((i % 3) + 1)}${i * 7919}`
    ).join('\n')
    expect(findLoopStart(text)).toBeNull()
  })

  it('sadece sayıları farklı gerçek listeleri döngü saymaz', () => {
    const years = Array.from({ length: 12 }, (_, i) => `- ${2015 + i} yılında satış: ${100 + i * 15} adet`).join('\n')
    const table = Array.from({ length: 10 }, (_, i) => `7 x ${i + 1} = ${7 * (i + 1)} eder, bunu unutma`).join('\n')
    expect(findLoopStart(years)).toBeNull()
    expect(findLoopStart(table)).toBeNull()
  })

  it('kod, tablo ve ayraç tekrarlarını döngü saymaz', () => {
    const code = '```js\n' + 'if (a) {\n  x()\n}\n'.repeat(10) + '```\n'
    const table = '| Ad | Değer |\n| --- | --- |\n' + Array.from({ length: 12 }, (_, i) => `| satır ${i} | ${i * 3} |`).join('\n')
    const rule = '\n' + '='.repeat(300) + '\n' + '-'.repeat(300)
    expect(findLoopStart(code)).toBeNull()
    expect(findLoopStart(table)).toBeNull()
    expect(findLoopStart('Başlık' + rule)).toBeNull()
  })
})
