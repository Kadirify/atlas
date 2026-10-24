import { describe, expect, it } from 'vitest'
import { toDelimited } from '../src/shared/delimited'

describe('sorgu sonucunu dışa aktarma', () => {
  it('CSV: ayraç, tırnak ve satır sonu içeren hücreler tırnağa alınır', () => {
    const text = toDelimited(['ad', 'not'], [['Kalem', 'mavi, kırmızı'], ['Defter "A4"', 'iki\nsatır'], ['Silgi', null]], ',')
    expect(text).toBe('ad,not\r\nKalem,"mavi, kırmızı"\r\n"Defter ""A4""","iki\nsatır"\r\nSilgi,')
  })

  it('Türkçe Excel için: noktalı virgül ve ondalık virgül', () => {
    expect(toDelimited(['ad', 'fiyat'], [['Kalem', 12.5], ['Defter', 28]], ';', true)).toBe('ad;fiyat\r\nKalem;12,5\r\nDefter;28')
    // Ondalık virgül ayraçla çakışırsa hücre tırnağa alınır.
    expect(toDelimited(['fiyat'], [[12.5]], ',', true)).toBe('fiyat\r\n"12,5"')
  })

  it('panoya: sekmeyle ayrılır', () => {
    expect(toDelimited(['a', 'b'], [[1, 'x']], '\t')).toBe('a\tb\r\n1\tx')
  })

  it("formül gibi başlayan metinlerin başına tek tırnak konur; sayılar ve eksi sayılar olduğu gibi kalır", () => {
    const text = toDelimited(['v'], [['=HYPERLINK("http://x")'], ['+90 555 111 22 33'], ['@komut'], ['-cmd'], ['-12,50'], [-7], ['normal']], ';')
    expect(text.split('\r\n')).toEqual(['v', '"\'=HYPERLINK(""http://x"")"', "'+90 555 111 22 33", "'@komut", "'-cmd", '-12,50', '-7', 'normal'])
  })
})
