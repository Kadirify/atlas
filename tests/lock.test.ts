import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { LockService } from '../src/main/services/lock'
import { analyze, caseLocale } from '../src/main/services/whatsapp/style'

afterEach(() => setLanguage('tr'))

describe('uygulama kilidi', () => {
  let db: Db
  let now: number
  let events: boolean[]
  let lock: LockService

  beforeEach(() => {
    db = new Db(':memory:')
    now = 1_000_000
    events = []
    lock = new LockService(db, (s) => events.push(s.locked), () => now)
  })

  it('şifre yokken kapalıdır ve kilitlenmez', () => {
    expect(lock.state()).toMatchObject({ enabled: false, locked: false, retryAfterSec: 0 })
    expect(lock.lock().locked).toBe(false)
    expect(events).toEqual([])
  })

  it('şifre belirlenir, kilitlenir, doğru şifreyle açılır', () => {
    expect(() => lock.setPin('123')).toThrow('en az 4')
    expect(lock.setPin('1234').enabled).toBe(true)
    expect(lock.lock().locked).toBe(true)
    expect(() => lock.unlock('0000')).toThrow('Şifre yanlış.')
    expect(lock.isLocked()).toBe(true)
    expect(lock.unlock('1234').locked).toBe(false)
    expect(events).toEqual([false, true, false])
  })

  it('şifrenin kendisi saklanmaz ve ayarlarla birlikte arayüze gitmez', () => {
    lock.setPin('gizli-şifre')
    const stored = db.getInternal('lockHash')!
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(stored).not.toContain('gizli')
    expect(JSON.stringify(db.getSettings())).not.toContain('scrypt')
    expect(Object.keys(db.getSettings())).not.toContain('internal:lockHash')
  })

  it('kilit açıksa uygulama kilitli başlar', () => {
    lock.setPin('1234')
    expect(new LockService(db).isLocked()).toBe(true)
    expect(new LockService(new Db(':memory:')).isLocked()).toBe(false)
  })

  it('şifre değiştirmek ve kilidi kaldırmak için eski şifre gerekir', () => {
    lock.setPin('1234')
    expect(() => lock.setPin('5678')).toThrow('Şifre yanlış.')
    expect(() => lock.setPin('5678', '0000')).toThrow('Şifre yanlış.')
    lock.setPin('5678', '1234')
    lock.lock()
    expect(() => lock.unlock('1234')).toThrow()
    lock.unlock('5678')
    expect(() => lock.disable('1234')).toThrow('Şifre yanlış.')
    expect(lock.disable('5678')).toMatchObject({ enabled: false, locked: false })
    expect(db.getInternal('lockHash')).toBeNull()
  })

  it('art arda yanlış denemelerden sonra bekletir; bekleme sırasında doğru şifre de kabul edilmez', () => {
    lock.setPin('1234')
    lock.lock()
    for (let i = 0; i < 4; i++) expect(() => lock.unlock('x')).toThrow('Şifre yanlış.')
    expect(lock.state().retryAfterSec).toBe(0)
    expect(() => lock.unlock('x')).toThrow('Şifre yanlış.')
    expect(lock.state().retryAfterSec).toBe(30)
    expect(() => lock.unlock('1234')).toThrow('Çok fazla yanlış deneme')
    now += 31_000
    expect(() => lock.unlock('x')).toThrow('Şifre yanlış.')
    expect(lock.state().retryAfterSec).toBe(60)
    now += 61_000
    expect(lock.unlock('1234').locked).toBe(false)
    lock.lock()
    // Doğru girişten sonra sayaç sıfırlanır.
    expect(() => lock.unlock('x')).toThrow('Şifre yanlış.')
    expect(lock.state().retryAfterSec).toBe(0)
  })

  it('hata mesajları dile göre değişir', () => {
    setLanguage('en')
    expect(() => lock.setPin('1')).toThrow('at least 4')
  })
})

describe('WhatsApp: İngilizce sohbetlerde küçük harf', () => {
  const english = ['I think It is fine', 'I will call you in the evening', 'Is It ok if I come', 'I know I know', 'I am in Izmir now']
  const turkish = ['Işık çok güzel olmuş', 'Ilık bir çay içelim mi', 'Isparta’ya gidiyoruz yarın', 'şimdi çıkıyorum evden']

  it('sohbetin dilini Türkçeye özgü harflerden anlar', () => {
    expect(caseLocale(english)).toBe('en')
    expect(caseLocale(turkish)).toBe('tr')
    expect(caseLocale([])).toBe('tr')
  })

  it('İngilizce sohbette "I" harfi "ı" olmaz', () => {
    const stats = analyze([...english, ...english, ...english], [1])
    expect([...stats.topWords, ...stats.topPhrases].join(' ')).not.toContain('ı')
  })

  it('Türkçe sohbette "I" harfi "ı" olarak küçülür', () => {
    const stats = analyze([...turkish, ...turkish, ...turkish], [1])
    const all = [...stats.topWords, ...stats.topPhrases].join(' ')
    expect(all).toContain('ışık')
    expect(all).not.toContain('işık')
  })
})
