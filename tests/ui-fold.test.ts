import { describe, expect, it } from 'vitest'
import { fold } from '../src/renderer/src/lib/fold'

describe('arama için harf katlama', () => {
  it('İngilizce büyük I harfli sözler küçük harfle bulunur', () => {
    expect(fold('Bu API çok yavaş').includes(fold('api'))).toBe(true)
    expect(fold('dbo.Invoices').includes(fold('invoice'))).toBe(true)
  })

  it('Türkçe büyük-küçük harfler eşleşir', () => {
    expect(fold('IŞIK')).toBe(fold('ışık'))
    expect(fold('İSTANBUL')).toBe('istanbul')
    expect(fold('Iğdır').includes(fold('IĞDIR'))).toBe(true)
  })

  it('uzunluk hiç değişmez (vurgulama konumları kaymasın)', () => {
    for (const text of ['API', 'İstanbul', 'Iğdır', 'STRASSE', 'ΣΑΣ', 'ǅemal', '']) expect(fold(text)).toHaveLength(text.length)
  })
})
