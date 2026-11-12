import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:brightness-95'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        VARIANTS[variant],
        className
      )}
    >
      {busy && <LoaderCircle size={16} className="spin" aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors',
        'hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  )
}

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-3">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(FIELD, 'h-10', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(FIELD, 'resize-none py-2.5 leading-relaxed', className)} />
}

/** Açıklamalı onay kutusu: bir seçeneği açıp kapatmak için. */
export function CheckCard({
  checked,
  onChange,
  title,
  description
}: {
  checked: boolean
  onChange(checked: boolean): void
  title: string
  description: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3.5 rounded-xl border bg-surface px-4 py-3.5 transition-colors',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        checked ? 'border-accent' : 'border-line hover:border-ink-3'
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-ink-3'
        )}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 5 8.6l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{description}</span>
      </span>
    </label>
  )
}

export function ProgressBar({ percent, tone = 'accent' }: { percent: number; tone?: 'accent' | 'teal' }) {
  const value = Math.max(0, Math.min(100, percent))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', tone === 'teal' ? 'bg-teal' : 'bg-accent')}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'danger' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'info' && 'bg-accent-soft text-accent'
      )}
    >
      {children}
    </div>
  )
}
