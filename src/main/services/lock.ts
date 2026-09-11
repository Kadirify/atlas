import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { LockState } from '@shared/types'
import type { Db } from '../db'
import { L } from '../i18n'

const KEY = 'lockHash'
/** Yanlış deneme sayısı ve bekleme bitişi; uygulamayı kapatıp açmak beklemeyi sıfırlamasın diye saklanır */
const ATTEMPTS_KEY = 'lockAttempts'
export const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 64
/** Bu kadar yanlış denemeden sonra her yeni yanlışta bekleme süresi uzar. */
const FREE_ATTEMPTS = 5
const MAX_WAIT_MS = 5 * 60_000

function hash(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin.normalize('NFKC'), salt, 32)
}

/**
 * Uygulama kilidi: Atlas'ı açan kişinin sohbetleri görmesi için bir şifre ister.
 *
 * Şifrenin kendisi saklanmaz, yalnızca tuzlanmış özeti saklanır. Kilit açılana kadar
 * ana süreç arayüzden gelen veri isteklerini reddeder. Veritabanı dosyası şifrelenmez:
 * kilit, bilgisayarın başına geçen birine karşı korur, diski kopyalayan birine karşı korumaz.
 */
export class LockService {
  private locked: boolean
  private failures = 0
  private blockedUntil = 0

  constructor(
    private db: Db,
    private onChange: (state: LockState) => void = () => {},
    private now: () => number = Date.now
  ) {
    // Kilit açıksa uygulama kilitli başlar.
    this.locked = this.enabled()
    try {
      const saved = JSON.parse(this.db.getInternal(ATTEMPTS_KEY) ?? 'null') as { failures?: unknown; blockedUntil?: unknown } | null
      this.failures = Number(saved?.failures) || 0
      this.blockedUntil = Number(saved?.blockedUntil) || 0
    } catch {
      // Bozuk kayıt: sayaç sıfırdan başlar.
    }
  }

  private saveAttempts(): void {
    this.db.setInternal(ATTEMPTS_KEY, this.failures > 0 ? JSON.stringify({ failures: this.failures, blockedUntil: this.blockedUntil }) : null)
  }

  enabled(): boolean {
    return this.db.getInternal(KEY) !== null
  }

  isLocked(): boolean {
    return this.locked
  }

  state(): LockState {
    const settings = this.db.getSettings()
    return {
      enabled: this.enabled(),
      locked: this.locked,
      retryAfterSec: Math.max(0, Math.ceil((this.blockedUntil - this.now()) / 1000)),
      language: settings.language,
      theme: settings.theme
    }
  }

  private check(pin: string): boolean {
    const stored = this.db.getInternal(KEY)
    if (!stored) return false
    const [, saltHex, hashHex] = stored.split(':')
    if (!saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const actual = hash(pin, Buffer.from(saltHex, 'hex'))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  /** Şifreyi dener; art arda yanlışlarda bekleme süresi uygular. Yanlışsa hata fırlatır. */
  private verify(pin: string): void {
    const wait = this.blockedUntil - this.now()
    if (wait > 0) throw new Error(L().main.lock.wait(Math.ceil(wait / 1000)))
    if (this.check(pin)) {
      this.failures = 0
      this.blockedUntil = 0
      this.saveAttempts()
      return
    }
    this.failures++
    if (this.failures >= FREE_ATTEMPTS) {
      // 5. yanlışta 30 sn, sonra her yanlışta iki katı; en çok 5 dakika.
      this.blockedUntil = this.now() + Math.min(30_000 * 2 ** (this.failures - FREE_ATTEMPTS), MAX_WAIT_MS)
    }
    this.saveAttempts()
    throw new Error(L().main.lock.wrong)
  }

  /** Kilidi ilk kez kurar ya da şifreyi değiştirir. Kilit zaten varsa eski şifre gerekir. */
  setPin(pin: string, current?: string): LockState {
    if (this.enabled()) this.verify(current ?? '')
    if (typeof pin !== 'string' || pin.length < MIN_PIN_LENGTH) throw new Error(L().main.lock.tooShort(MIN_PIN_LENGTH))
    if (pin.length > MAX_PIN_LENGTH) throw new Error(L().main.lock.tooLong(MAX_PIN_LENGTH))
    const salt = randomBytes(16)
    this.db.setInternal(KEY, `scrypt:${salt.toString('hex')}:${hash(pin, salt).toString('hex')}`)
    return this.changed()
  }

  /** Kilidi kaldırır; geçerli şifre gerekir. */
  disable(current: string): LockState {
    this.verify(current)
    this.db.setInternal(KEY, null)
    this.locked = false
    return this.changed()
  }

  lock(): LockState {
    if (!this.enabled() || this.locked) return this.state()
    this.locked = true
    return this.changed()
  }

  unlock(pin: string): LockState {
    if (!this.locked) return this.state()
    this.verify(pin)
    this.locked = false
    return this.changed()
  }

  private changed(): LockState {
    const state = this.state()
    this.onChange(state)
    return state
  }
}
