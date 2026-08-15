import {
  Bell,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  Handshake,
  Languages,
  Lightbulb,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquare,
  PenLine,
  Reply,
  Scissors,
  ScrollText,
  Server,
  ShieldAlert,
  Sparkles,
  SpellCheck,
  UserPlus,
  Users,
  WandSparkles,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import type { AppField, AppIcon as AppIconName } from '@shared/types'
import { Field, Input, Textarea } from '@/components/ui'
import { cn } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

export const ICONS: Record<AppIconName, LucideIcon> = {
  mail: Mail,
  reply: Reply,
  file: FileText,
  users: Users,
  checklist: ListChecks,
  megaphone: Megaphone,
  languages: Languages,
  wand: WandSparkles,
  shield: ShieldAlert,
  server: Server,
  briefcase: Briefcase,
  pen: PenLine,
  clipboard: ClipboardList,
  calendar: CalendarDays,
  message: MessageSquare,
  sparkles: Sparkles,
  scissors: Scissors,
  userplus: UserPlus,
  scroll: ScrollText,
  spell: SpellCheck,
  bell: Bell,
  lightbulb: Lightbulb,
  handshake: Handshake,
  wrench: Wrench
}

/** Mini uygulamanın ikonu, yumuşak renkli bir karo içinde. */
export function AppIconTile({ icon, size = 40 }: { icon: AppIconName; size?: number }) {
  const Icon = ICONS[icon] ?? Sparkles
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.48)} />
    </span>
  )
}

const SELECT_CLASS =
  'h-10 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed'

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(SELECT_CLASS, className)}>
      {children}
    </select>
  )
}

/** Açılır listelerde ilk seçenek varsayılandır; diğer alanlar boş başlar. */
export function initialValues(fields: AppField[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const f of fields) values[f.key] = f.type === 'select' ? (f.options[0] ?? '') : f.type === 'toggle' ? 'false' : ''
  return values
}

/** Mini uygulamanın formu. disabled verilirse yalnızca önizleme olarak çizilir. */
export function AppForm({
  fields,
  values,
  onChange,
  disabled = false
}: {
  fields: AppField[]
  values: Record<string, string>
  onChange?(key: string, value: string): void
  disabled?: boolean
}) {
  const t = useT()
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = values[field.key] ?? ''
        const set = (v: string): void => onChange?.(field.key, v)
        const label = field.required ? field.label : t.apps.form.optional(field.label)

        if (field.type === 'toggle') {
          return (
            <label key={field.key} className={cn('flex items-center gap-3 text-sm text-ink', !disabled && 'cursor-pointer')}>
              <input
                type="checkbox"
                checked={value === 'true'}
                disabled={disabled}
                onChange={(e) => set(String(e.target.checked))}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {field.label}
            </label>
          )
        }
        return (
          <Field key={field.key} label={label}>
            {field.type === 'textarea' ? (
              <Textarea
                rows={4}
                value={value}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(e) => set(e.target.value)}
                className="resize-y"
              />
            ) : field.type === 'select' ? (
              <Select value={value} disabled={disabled} onChange={(e) => set(e.target.value)}>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={value} disabled={disabled} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />
            )}
          </Field>
        )
      })}
    </div>
  )
}

/**
 * Uygulamalarda kullanılacak modeli seçer. Boş değer "varsayılan model" demektir.
 */
export function ModelPicker({ value, onChange }: { value: string; onChange(model: string): void }) {
  const t = useT()
  const installed = useApp((s) => s.installed)
  const defaultModel = useApp((s) => s.settings?.defaultModel ?? '')
  const names = installed.map((m) => m.name)
  const labelOf = (name: string): string => installed.find((m) => m.name === name)?.label ?? name

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t.apps.modelPicker.label}
      title={t.apps.modelPicker.label}
      className="h-8 max-w-[260px] cursor-pointer rounded-md bg-transparent px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink focus:outline-none"
    >
      <option value="" className="bg-surface text-ink">
        {defaultModel ? t.apps.modelPicker.defaultWith(labelOf(defaultModel)) : t.apps.modelPicker.defaultModel}
      </option>
      {/* Seçili model sonradan silinmişse yine de görünsün. */}
      {value && !names.includes(value) && (
        <option value={value} className="bg-surface text-ink">
          {t.apps.modelPicker.notInstalled(value)}
        </option>
      )}
      {names.map((name) => (
        <option key={name} value={name} className="bg-surface text-ink">
          {labelOf(name)}
        </option>
      ))}
    </select>
  )
}

/** Uygulama ekranlarının üst çubuğu: pencere sürükleme alanı + başlık + sağda düğmeler. */
export function PageHeader({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="drag flex h-14 shrink-0 items-center gap-3 border-b border-line pr-[150px] pl-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}
