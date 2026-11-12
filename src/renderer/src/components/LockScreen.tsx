import { LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dictFor } from '@shared/i18n'
import type { LockState } from '@shared/types'
import { LogoMark } from '@/components/Logo'
import { Button, Input, Notice } from '@/components/ui'
import { errorText } from '@/lib/format'

/**
 * Kilit ekranı. Kilitliyken ana süreç veri isteklerini reddettiği için bu ekran
 * yalnızca kilit durumunu bilir; sohbetler ve ayarlar kilit açılınca yüklenir.
 */
export default function LockScreen({ lock }: { lock: LockState }) {
  const t = dictFor(lock.language).settings.lockScreen
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(lock.retryAfterSec)
  const focus = (): void => document.getElementById('lock-pin')?.focus()

  // Bekleme süresi dolana kadar saniye saniye geri sayar.
  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function unlock(): Promise<void> {
    if (!pin || busy || wait > 0) return
    setBusy(true)
    setError('')
    try {
      await window.api.lock.unlock(pin)
    } catch (e) {
      setError(errorText(e))
      setPin('')
      try {
        setWait((await window.api.lock.state()).retryAfterSec)
      } catch {
        // Durum okunamazsa geri sayım gösterilmez; bir sonraki deneme yine ana süreçte denetlenir.
      }
      focus()
    }
    setBusy(false)
  }

  return (
    <div className="drag flex h-full items-center justify-center bg-bg p-6">
      <form
        className="no-drag w-full max-w-[340px] text-center"
        onSubmit={(e) => {
          e.preventDefault()
          void unlock()
        }}
      >
        <div className="mx-auto mb-5 flex w-fit items-end">
          <LogoMark size={56} />
          <span className="-mb-1.5 -ml-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-ink text-bg">
            <LockKeyhole size={14} aria-hidden />
          </span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-2">{t.hint}</p>
        <Input
          id="lock-pin"
          autoFocus
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label={t.password}
          placeholder={t.password}
          autoComplete="off"
          className="h-11 text-center text-base tracking-widest"
        />
        <Button type="submit" variant="primary" busy={busy} disabled={!pin || wait > 0} className="mt-3 w-full">
          {t.unlock}
        </Button>
        <div className="mt-4 min-h-[44px] text-left" aria-live="polite">
          {wait > 0 ? <Notice tone="warn">{t.wait(wait)}</Notice> : error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      </form>
    </div>
  )
}
