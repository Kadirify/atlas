import { cn } from '@/lib/format'
import { useT } from '@/lib/useT'

/** Uygulamanın adı. Arayüzde adın geçtiği her yer bunu kullanır. */
export const APP_NAME = 'Atlas'

/** Kaynak kodunun yayımlanacağı GitHub deposu. */
export const REPO_URL = 'https://github.com/kadirify/atlas'

/** Depo bağlantısı; tarayıcıda açılır. */
export function RepoLink({ className }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className={cn('text-ink-2 underline decoration-line underline-offset-2 hover:text-accent', className)}
    >
      {REPO_URL.replace('https://', '')}
    </a>
  )
}

/** Atlas logosu: resources/logo.svg ile aynı çizim. Marka renkleri iki temada da sabittir. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  const t = useT()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label={t.chat.logoLabel(APP_NAME)}>
      <rect width="64" height="64" rx="15" fill="#2443B8" />
      <path
        d="M16.5 47 32 16.5 47.5 47"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="9.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="42.5" r="5.5" fill="#2DD4CB" />
    </svg>
  )
}

/** Logo ve ad yan yana. */
export function Wordmark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className="font-display font-semibold tracking-tight text-ink" style={{ fontSize: size * 0.72 }}>
        {APP_NAME}
      </span>
    </span>
  )
}

/** Uygulamanın en altında duran açık kaynak ve gizlilik satırı. */
export function OpenSourceNote({ className }: { className?: string }) {
  const t = useT()
  return (
    <p className={cn('text-xs text-ink-3', className)}>
      {t.common.openSourceNote(APP_NAME)}{' '}
      <RepoLink />
    </p>
  )
}
