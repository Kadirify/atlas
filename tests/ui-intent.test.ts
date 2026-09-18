import { describe, expect, it } from 'vitest'
import { asksShowOnSide } from '../src/renderer/src/lib/intent'

describe('belgeyi yanda açma isteği', () => {
  it('kısa ve açık istekleri tanır', () => {
    for (const text of [
      'yanda göster',
      "CV'yi yanda göster",
      'Bu belgeyi sağda aç',
      'yanda gösterir misin?',
      'sağda açar mısın',
      'Yanda göster lütfen.',
      'show it on the side',
      'Open the document on the right',
      'please open this in the side panel'
    ]) {
      expect(asksShowOnSide(text), text).toBe(true)
    }
  })

  it('içinde "yanda" ya da "side" geçen sıradan mesajları modele bırakır', () => {
    for (const text of [
      'Show the two versions side by side',
      'How do I open the side panel in VS Code?',
      "Word'de sağda açılan paneli nasıl kapatırım?",
      'yanda acil bir iş var',
      'Sağda gösterilen tabloyu özetler misin, özellikle ikinci sütunu?',
      'yanda',
      ''
    ]) {
      expect(asksShowOnSide(text), text).toBe(false)
    }
  })
})
