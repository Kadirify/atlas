import { FileSpreadsheet, FileText, LoaderCircle, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { ATTACHMENT_BASE_CHARS, type Attachment } from '@shared/types'
import ImageViewer, { type ViewerImage } from '@/components/ImageViewer'
import { cn, formatBytes } from '@/lib/format'
import { useT } from '@/lib/useT'
import { useApp } from '@/stores/app'

const ACCEPT =
  'image/*,.pdf,.docx,.xlsx,.txt,.md,.csv,.tsv,.json,.xml,.html,.log,.yml,.yaml,.sql,.js,.ts,.tsx,.jsx,.py,.java,.cs,.go,.rs,.php,.sh,.ps1'

/** Dosya seçme penceresini açan düğme. */
export function AttachButton({
  onFiles,
  disabled,
  children,
  className
}: {
  onFiles(files: File[]): void
  disabled?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={t.chat.attachments.add}
        title={t.chat.attachments.addTitle}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-ink-3 transition-colors',
          'hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
          children ? 'h-9 px-3 text-[13px] font-medium' : 'h-10 w-10',
          className
        )}
      >
        <Paperclip size={children ? 15 : 18} aria-hidden />
        {children}
      </button>
    </>
  )
}

/** Açık sohbetteki bütün resimler (ok tuşlarıyla gezmek için); tıklanan resim listede yoksa tek başına gösterilir. */
function conversationImages(current: Attachment): ViewerImage[] {
  const { activeId, messages } = useApp.getState()
  const images: ViewerImage[] = []
  for (const message of activeId ? (messages[activeId] ?? []) : []) {
    for (const a of message.attachments ?? []) if (a.kind === 'image' && a.dataUrl) images.push({ id: a.id, name: a.name, src: a.dataUrl })
  }
  if (!images.some((i) => i.id === current.id) && current.dataUrl) return [{ id: current.id, name: current.name, src: current.dataUrl }]
  return images
}

/**
 * Klasör ya da veritabanı bağlı sohbetlerde ve mini uygulamalarda belge payı büyümez (bağlamın çoğu araç sonuçlarına
 * kalır); "baş kısmı okunur" uyarısı o durumda temel sınıra göre verilir.
 */
function useBaseBudget(): boolean {
  return useApp((s) => {
    if (s.view.name !== 'chat') return true
    const conversation = s.conversations.find((c) => c.id === s.activeId)
    return Boolean(conversation ? conversation.folderId || conversation.sqlId : s.draft.folderId || s.draft.sqlId)
  })
}

function FileChip({ attachment, onRemove, baseBudget }: { attachment: Attachment; onRemove?(): void; baseBudget: boolean }) {
  const t = useT()
  const open = useApp((s) => s.docId === attachment.id)
  const [zoomed, setZoomed] = useState(false)
  const Icon = /\.(xlsx|csv|tsv)$/i.test(attachment.name) ? FileSpreadsheet : FileText
  const removeButton = onRemove && (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t.chat.attachments.remove(attachment.name)}
      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-sm hover:text-danger"
    >
      <X size={12} aria-hidden />
    </button>
  )

  if (attachment.kind === 'image' && attachment.dataUrl) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={t.chat.attachments.enlarge(attachment.name)}
          title={t.chat.attachments.enlarge(attachment.name)}
          className="block cursor-zoom-in rounded-lg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <img src={attachment.dataUrl} alt={attachment.name} className="h-16 w-16 rounded-lg border border-line object-cover" />
        </button>
        {removeButton}
        {zoomed && <ImageViewer images={conversationImages(attachment)} startId={attachment.id} onClose={() => setZoomed(false)} />}
      </div>
    )
  }

  // Belgeye tıklanınca metni sohbetin sağındaki panelde açılır.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => useApp.getState().openDoc(attachment.id)}
        title={t.chat.doc.open(attachment.name)}
        className={cn(
          'flex max-w-[240px] items-center gap-2.5 rounded-lg border bg-surface py-1.5 pr-3 pl-2.5 text-left transition-colors',
          open ? 'border-accent' : 'border-line hover:border-ink-3'
        )}
      >
        <Icon size={18} className="shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{attachment.name}</p>
          <p className="text-xs text-ink-3">
            {(baseBudget ? attachment.chars > ATTACHMENT_BASE_CHARS : attachment.truncated) ? t.chat.attachments.truncated : formatBytes(attachment.size)}
          </p>
        </div>
      </button>
      {removeButton}
    </div>
  )
}

export function AttachmentList({
  items,
  pending = 0,
  onRemove,
  className
}: {
  items: Attachment[]
  pending?: number
  onRemove?(id: string): void
  className?: string
}) {
  const t = useT()
  const baseBudget = useBaseBudget()
  if (items.length === 0 && pending === 0) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {items.map((a) => (
        <FileChip key={a.id} attachment={a} baseBudget={baseBudget} onRemove={onRemove ? () => onRemove(a.id) : undefined} />
      ))}
      {pending > 0 && (
        <span className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-[13px] text-ink-3" role="status">
          <LoaderCircle size={14} className="spin" aria-hidden />
          {t.chat.attachments.reading}
        </span>
      )}
    </div>
  )
}
