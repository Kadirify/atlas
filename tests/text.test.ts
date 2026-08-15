import { describe, expect, it } from 'vitest'
import { chunkText, wordDiff } from '@shared/text'

const join = (chunks: { body: string; separator: string }[]): string => chunks.map((c) => c.body + c.separator).join('')

describe('wordDiff', () => {
  it('değişen kelimeleri silinen ve eklenen olarak verir, gerisini korur', () => {
    expect(wordDiff('herkez memnun kaldi.', 'herkes memnun kaldı.')).toEqual([
      { type: 'del', text: 'herkez' },
      { type: 'add', text: 'herkes' },
      { type: 'same', text: ' memnun ' },
      { type: 'del', text: 'kaldi.' },
      { type: 'add', text: 'kaldı.' }
    ])
  })

  it('aynı metinde tek parça döner; parçalar birleşince iki metin de geri gelir', () => {
    expect(wordDiff('aynı metin\nikinci satır', 'aynı metin\nikinci satır')).toEqual([{ type: 'same', text: 'aynı metin\nikinci satır' }])
    const before = 'Bir  iki\n\nüç dört beş'
    const after = 'Bir iki\n\nüç altı beş yedi'
    const parts = wordDiff(before, after)!
    expect(parts.filter((p) => p.type !== 'add').map((p) => p.text).join('')).toBe(before)
    expect(parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')).toBe(after)
  })

  it('boş metinlerle çalışır', () => {
    expect(wordDiff('', 'yeni')).toEqual([{ type: 'add', text: 'yeni' }])
    expect(wordDiff('eski', '')).toEqual([{ type: 'del', text: 'eski' }])
  })
})

describe('chunkText', () => {
  it('kısa metni tek parça bırakır', () => {
    expect(chunkText('Merhaba dünya.')).toEqual([{ body: 'Merhaba dünya.', separator: '' }])
  })

  it('paragraf sınırlarından böler ve birleştirilince özgün metni verir', () => {
    const text = ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60), 'd'.repeat(30)].join('\n\n') + '\n'
    const chunks = chunkText(text, 130)
    expect(chunks.length).toBe(2)
    expect(chunks.every((c) => c.body.length <= 130)).toBe(true)
    expect(join(chunks)).toBe(text)
  })

  it('sınırı aşan tek paragrafı satırlardan, satırı da sınırdan böler', () => {
    const text = `${'x'.repeat(250)}\n${'y'.repeat(40)}\n\nson`
    const chunks = chunkText(text, 100)
    expect(chunks.every((c) => c.body.length <= 100)).toBe(true)
    expect(join(chunks)).toBe(text)
  })
})
