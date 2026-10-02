import { describe, expect, it } from 'vitest'
import { numberedLines, relaxedReplace, stripLineNumbers } from '../src/main/services/patch'

describe('numberedLines', () => {
  it('satırları numaralar, verilen satırdan başlar, sınırda durur', () => {
    const text = 'a\nb\nc\nd\n'
    expect(numberedLines(text, 1, 10_000, 400)).toEqual({ body: '1| a\n2| b\n3| c\n4| d', first: 1, last: 4, total: 4 })
    expect(numberedLines(text, 3, 10_000, 400).body).toBe('3| c\n4| d')
    expect(numberedLines(text, 1, 10_000, 2)).toMatchObject({ body: '1| a\n2| b', last: 2, total: 4 })
    expect(numberedLines('x\r\ny', 1, 10_000, 400).body).toBe('1| x\n2| y')
  })
})

describe('stripLineNumbers', () => {
  it('modelin kopyaladığı satır numaralarını atar', () => {
    expect(stripLineNumbers('12| const a = 1\n13|   return a', '12| const a = 2\n   return a')).toEqual({
      oldText: 'const a = 1\n  return a',
      newText: 'const a = 2\n   return a'
    })
  })

  it('numarasız metne dokunmaz', () => {
    expect(stripLineNumbers('const a = 1', '| tablo | 2 |')).toEqual({ oldText: 'const a = 1', newText: '| tablo | 2 |' })
  })
})

describe('relaxedReplace', () => {
  const file = 'function f() {\n    if (x) {\n        y()\n    }\n}\n'

  it('girintisi yanlış kopyalanmış metni tek yerde bulur, girintiyi dosyaya uydurur', () => {
    const out = relaxedReplace(file, 'if (x) {\n    y()\n}', 'if (x) {\n    z()\n}')
    expect(out).toMatchObject({ after: 'function f() {\n    if (x) {\n        z()\n    }\n}\n' })
  })

  it('model girintiyi tamamen atlasa da iç satır doğru girintiyi alır', () => {
    const out = relaxedReplace(file, 'if (x) {\ny()\n}', 'if (x) {\nz()\n}')
    expect(out).toMatchObject({ after: 'function f() {\n    if (x) {\n        z()\n    }\n}\n' })
  })

  it('araya eklenen satır, önüne eklendiği satırın girintisini alır', () => {
    const out = relaxedReplace(file, 'if (x) {\ny()\n}', 'if (x) {\nlog()\ny()\n}')
    expect(out).toMatchObject({ after: 'function f() {\n    if (x) {\n        log()\n        y()\n    }\n}\n' })
  })

  it('Python: yeni iç blok, modelin verdiği göreli girintiyle eklenir', () => {
    const py = 'def ortalama(sayilar):\n    return sum(sayilar) / len(sayilar)\n'
    const out = relaxedReplace(
      py,
      'return sum(sayilar) / len(sayilar)',
      'if not sayilar:\n    return 0\nreturn sum(sayilar) / len(sayilar)'
    )
    expect(out).toMatchObject({ after: 'def ortalama(sayilar):\n    if not sayilar:\n        return 0\n    return sum(sayilar) / len(sayilar)\n' })
  })

  it('sondaki boşlukları ve boş satırları yok sayar', () => {
    const out = relaxedReplace('a = 1  \nb = 2\n', '\na = 1\n', 'a = 3')
    expect(out).toMatchObject({ after: 'a = 3\nb = 2\n' })
  })

  it('Windows satır sonlarını korur', () => {
    const out = relaxedReplace('port=3000\r\nhost=x\r\n', '  port=3000', 'port=8080')
    expect(out).toMatchObject({ after: 'port=8080\r\nhost=x\r\n' })
  })

  it('bulamazsa ya da birden çok yerde bulursa değiştirmez', () => {
    expect(relaxedReplace(file, 'yok()', 'z()')).toEqual({ error: 'none' })
    expect(relaxedReplace('}\n}\n', '}', ')')).toEqual({ error: 'many', count: 2 })
  })
})

import { closestLines } from '../src/main/services/patch'

describe('closestLines', () => {
  it('bulunamayan metne en çok benzeyen satırı çevresiyle verir', () => {
    const content = 'const A = 1\nconst VARSAYILAN_KDV = 0.18 // eski\nconst B = 2\n'
    expect(closestLines(content, 'const VARSAYILAN_KDV = 0.18')).toBe('1| const A = 1\n2| const VARSAYILAN_KDV = 0.18 // eski\n3| const B = 2')
    expect(closestLines(content, 'tamamen alakasız bir şey')).toBeNull()
  })
})
