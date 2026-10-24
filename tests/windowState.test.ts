import { describe, expect, it } from 'vitest'
import { restoreBounds } from '../src/main/windowState'

const MIN = { width: 760, height: 560 }
const MAIN = { x: 0, y: 0, width: 1920, height: 1040 }
const SECOND = { x: 1920, y: 0, width: 2560, height: 1400 }

describe('pencere yerini geri yükleme', () => {
  it('kaydedilen yer ekrandaysa aynen döner', () => {
    expect(restoreBounds({ x: 200, y: 100, width: 1300, height: 900, maximized: false }, [MAIN], MIN)).toEqual({
      x: 200,
      y: 100,
      width: 1300,
      height: 900,
      maximized: false
    })
    expect(restoreBounds({ x: 2000, y: 50, width: 1400, height: 1000, maximized: true }, [MAIN, SECOND], MIN)?.maximized).toBe(true)
  })

  it('ikinci ekran çıkarıldıysa kayıt yok sayılır (pencere varsayılan yerde açılır)', () => {
    expect(restoreBounds({ x: 2400, y: 50, width: 1400, height: 1000, maximized: false }, [MAIN], MIN)).toBeNull()
  })

  it('başlık çubuğu ekranın dışında kalan pencere geri yüklenmez', () => {
    // Yukarıda kalmış: başlık tutulamaz
    expect(restoreBounds({ x: 100, y: -300, width: 1000, height: 700, maximized: false }, [MAIN], MIN)).toBeNull()
    // Sağdan yalnızca 50 piksel görünüyor
    expect(restoreBounds({ x: 1870, y: 100, width: 1000, height: 700, maximized: false }, [MAIN], MIN)).toBeNull()
    // Sağdan 300 piksel görünüyor: tutulup çekilebilir
    expect(restoreBounds({ x: 1620, y: 100, width: 1000, height: 700, maximized: false }, [MAIN], MIN)).not.toBeNull()
  })

  it('ekrandan büyük pencere ekrana, çok küçük pencere en küçük boyuta getirilir', () => {
    expect(restoreBounds({ x: 0, y: 0, width: 4000, height: 3000, maximized: false }, [MAIN], MIN)).toMatchObject({ width: 1920, height: 1040 })
    expect(restoreBounds({ x: 10, y: 10, width: 100, height: 100, maximized: false }, [MAIN], MIN)).toMatchObject({ width: 760, height: 560 })
  })

  it('bozuk kayıt yok sayılır', () => {
    for (const bad of [null, undefined, 'x', 5, {}, { x: 1, y: 2, width: 'geniş', height: 3 }, { x: NaN, y: 0, width: 800, height: 600 }]) {
      expect(restoreBounds(bad, [MAIN], MIN)).toBeNull()
    }
  })
})
