import { ChevronLeft, ChevronRight, Copy, Download, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/format'
import { useT } from '@/lib/useT'

export interface ViewerImage {
  id: string
  name: string
  src: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6

/** Resmi panoya PNG olarak koyar (pano JPEG kabul etmez; gerekirse çevrilir). */
async function copyImage(src: string): Promise<void> {
  const image = new Image()
  image.src = src
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('png')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/**
 * Resim görüntüleyici: resmi pencereyi kaplayacak şekilde açar.
 * Tekerlek yakınlaştırır, büyütülmüş resim sürüklenir, ok tuşları sohbetteki diğer resimlere geçer, Esc kapatır.
 */
export default function ImageViewer({ images, startId, onClose }: { images: ViewerImage[]; startId: string; onClose(): void }) {
  const t = useT()
  const v = t.chat.viewer
  const [index, setIndex] = useState(() => Math.max(0, images.findIndex((i) => i.id === startId)))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [copied, setCopied] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const image = images[Math.min(index, images.length - 1)]

  const go = useCallback(
    (by: number): void => {
      if (images.length < 2) return
      setIndex((i) => (i + by + images.length) % images.length)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    },
    [images.length]
  )
  const zoomBy = (factor: number): void => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor))
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') zoomBy(1.25)
      else if (e.key === '-') zoomBy(0.8)
      else if (e.key === '0') {
        setZoom(1)
        setOffset({ x: 0, y: 0 })
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, onClose])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  if (!image) return null
  const tool = 'flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-40'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="no-drag fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/85"
      onClick={() => {
        // Sürükleme bırakıldığında da tıklama gelir; o zaman kapatılmaz.
        if (drag.current?.moved) drag.current = null
        else onClose()
      }}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
    >
      <img
        src={image.src}
        alt={image.name}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => (zoom > 1 ? (setZoom(1), setOffset({ x: 0, y: 0 })) : setZoom(2.5))}
        onPointerDown={(e) => {
          if (zoom === 1) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return
          d.moved = true
          setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        className={cn('max-h-[calc(100%-96px)] max-w-[calc(100%-96px)] rounded-lg object-contain shadow-pop select-none', zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      />

      <div className="absolute top-11 right-4 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={tool} aria-label={v.zoomOut} title={v.zoomOut} disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(0.8)}>
          <ZoomOut size={17} aria-hidden />
        </button>
        <button type="button" className={tool} aria-label={v.zoomIn} title={v.zoomIn} disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(1.25)}>
          <ZoomIn size={17} aria-hidden />
        </button>
        <button
          type="button"
          className={tool}
          aria-label={v.copy}
          title={copied ? v.copied : v.copy}
          onClick={() => void copyImage(image.src).then(() => setCopied(true), () => undefined)}
        >
          <Copy size={16} aria-hidden />
        </button>
        <a className={tool} href={image.src} download={image.name} aria-label={v.save} title={v.save}>
          <Download size={16} aria-hidden />
        </a>
        <button ref={closeButton} type="button" className={tool} aria-label={v.close} title={v.close} onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className={cn(tool, 'absolute top-1/2 left-4 -translate-y-1/2')}
            aria-label={v.previous}
            title={v.previous}
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button
            type="button"
            className={cn(tool, 'absolute top-1/2 right-4 -translate-y-1/2')}
            aria-label={v.next}
            title={v.next}
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        </>
      )}

      <p className="absolute bottom-4 left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded-full bg-black/50 px-3 py-1 text-xs text-white/90" aria-live="polite">
        {copied ? v.copied : images.length > 1 ? `${image.name} (${index + 1} / ${images.length})` : image.name}
        {zoom > 1 && !copied ? `, %${Math.round(zoom * 100)}` : ''}
      </p>
    </div>,
    document.body
  )
}
