import { LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LOCK_MINUTES, SHORTCUT_CHOICES, type ShortcutStatus } from '@shared/types'
import { Select } from '@/components/AppParts'
import { Button, CheckCard, Field, Input, Notice } from '@/components/ui'
import { errorText } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const MIN_PIN_LENGTH = 4

/** Ayarlar → Arka plan ve kilit: sistem tepsisi, açılışta başlatma ve uygulama kilidi. */
export function DesktopTab() {
  const t = useT()
  const d = t.settings.desktop
  const settings = useApp((s) => s.settings)!
  const saveSettings = useApp((s) => s.saveSettings)
  const lock = useApp((s) => s.lock)

  const [packaged, setPackaged] = useState(true)
  const [shortcuts, setShortcuts] = useState<ShortcutStatus>({ quick: true, selection: true })
  const isWindows = navigator.userAgent.includes('Windows')
  const [form, setForm] = useState<'none' | 'enable' | 'change' | 'disable'>('none')
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void window.api.app.isPackaged().then(setPackaged, () => setPackaged(true))
  }, [])

  // Kısayol değişince kaydedilip kaydedilemediği ana süreçten okunur.
  useEffect(() => {
    void window.api.panel.shortcutStatus().then(setShortcuts, () => {})
  }, [settings.quickShortcut, settings.selectionShortcut])

  const keyLabel = (key: string): string => (key ? key.replace('Space', d.spaceKey) : d.shortcutOff)
  const sameShortcut = !!settings.quickShortcut && settings.quickShortcut === settings.selectionShortcut

  const enabled = lock?.enabled ?? false

  function open(next: typeof form): void {
    setForm(next)
    setCurrent('')
    setPin('')
    setAgain('')
    setError('')
    setMessage('')
  }

  async function submit(): Promise<void> {
    setError('')
    if (form !== 'disable' && pin !== again) {
      setError(d.mismatch)
      return
    }
    setBusy(true)
    try {
      if (form === 'disable') await window.api.lock.disable(current)
      else await window.api.lock.setPin(pin, form === 'change' ? current : undefined)
      setMessage(form === 'enable' ? d.enabled : form === 'change' ? d.changed : d.disabled)
      setForm('none')
    } catch (e) {
      setError(errorText(e))
    }
    setBusy(false)
  }

  const canSubmit =
    form === 'disable'
      ? current.length > 0
      : pin.length >= MIN_PIN_LENGTH && again.length > 0 && (form === 'enable' || current.length > 0)

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">{d.backgroundTitle}</h3>
        <div className="space-y-3">
          <CheckCard
            checked={settings.closeToTray}
            onChange={(closeToTray) => void saveSettings({ closeToTray })}
            title={d.closeToTray}
            description={d.closeToTrayDescription}
          />
          <CheckCard
            checked={settings.launchAtLogin}
            onChange={(launchAtLogin) => void saveSettings({ launchAtLogin })}
            title={d.launchAtLogin}
            description={packaged ? d.launchAtLoginDescription : `${d.launchAtLoginDescription} ${d.launchAtLoginDevNote}`}
          />
          <CheckCard
            checked={settings.notifyWhenDone}
            onChange={(notifyWhenDone) => void saveSettings({ notifyWhenDone })}
            title={d.notifyWhenDone}
            description={d.notifyWhenDoneDescription}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">{d.shortcutsTitle}</h3>
        <p className="mb-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-3">{d.shortcutsHint}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={d.quickShortcut} hint={d.quickShortcutHint}>
            <Select value={settings.quickShortcut} onChange={(e) => void saveSettings({ quickShortcut: e.target.value })}>
              {SHORTCUT_CHOICES.map((key) => (
                <option key={key} value={key}>
                  {keyLabel(key)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={d.selectionShortcut} hint={isWindows ? d.selectionShortcutHint : d.selectionWindowsOnly}>
            <Select
              value={settings.selectionShortcut}
              disabled={!isWindows}
              onChange={(e) => void saveSettings({ selectionShortcut: e.target.value })}
            >
              {SHORTCUT_CHOICES.map((key) => (
                <option key={key} value={key}>
                  {keyLabel(key)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 space-y-2">
          {sameShortcut && <Notice tone="warn">{d.shortcutSame}</Notice>}
          {!shortcuts.quick && <Notice tone="warn">{d.shortcutTaken(keyLabel(settings.quickShortcut))}</Notice>}
          {!shortcuts.selection && !sameShortcut && <Notice tone="warn">{d.shortcutTaken(keyLabel(settings.selectionShortcut))}</Notice>}
        </div>
      </section>

      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <LockKeyhole size={15} aria-hidden />
          {d.lockTitle}
        </h3>
        <p className={enabled ? 'text-[13px] text-teal' : 'text-[13px] text-ink-2'}>{enabled ? d.lockOn : d.lockOff}</p>
        <p className="mt-1 mb-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-3">{d.lockLimits}</p>

        {form === 'none' ? (
          <div className="flex flex-wrap items-center gap-2">
            {enabled ? (
              <>
                <Button size="sm" variant="primary" onClick={() => void window.api.lock.lock()}>
                  {d.lockNow}
                </Button>
                <Button size="sm" onClick={() => open('change')}>
                  {d.change}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => open('disable')}>
                  {d.disable}
                </Button>
                <span className="ml-1 text-xs text-ink-3">{d.shortcut}</span>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => open('enable')}>
                {d.enable}
              </Button>
            )}
          </div>
        ) : (
          <form
            className="max-w-[340px] space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (canSubmit) void submit()
            }}
          >
            {form !== 'enable' && (
              <Field label={d.currentPin}>
                <Input type="password" autoFocus autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
            )}
            {form !== 'disable' && (
              <>
                <Field label={d.newPin} hint={d.pinHint(MIN_PIN_LENGTH)}>
                  <Input
                    type="password"
                    autoFocus={form === 'enable'}
                    autoComplete="new-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </Field>
                <Field label={d.newPinAgain}>
                  <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
                </Field>
              </>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" variant={form === 'disable' ? 'danger' : 'primary'} busy={busy} disabled={!canSubmit}>
                {form === 'enable' ? d.enable : form === 'change' ? d.change : d.disable}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => open('none')}>
                {t.common.actions.cancel}
              </Button>
            </div>
          </form>
        )}
        {message && form === 'none' && (
          <p className="mt-3 text-[13px] text-teal" role="status">
            {message}
          </p>
        )}

        {enabled && (
          <div className="mt-6 w-[260px]">
            <Field label={d.autoLock}>
              <Select
                value={String(settings.lockAfterMinutes)}
                onChange={(e) => void saveSettings({ lockAfterMinutes: Number(e.target.value) })}
              >
                {LOCK_MINUTES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? d.autoLockOff : d.minutes(n)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </section>
    </div>
  )
}
