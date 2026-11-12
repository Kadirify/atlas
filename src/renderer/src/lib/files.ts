import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment, JobDone } from '@shared/types'
import { errorText } from '@/lib/format'
import { T } from '@/lib/i18n'

const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Resimler modele bu kenar uzunluğuna küçültülerek verilir. */
const MAX_IMAGE_EDGE = 1568

/** Resmi küçültür ve PNG ya da JPEG'e çevirir (ana süreç yalnızca bu ikisini kabul eder). */
async function normalizeImage(file: File): Promise<{ mime: string; bytes: ArrayBuffer }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Saydamlığı olabilecek PNG'ler PNG kalır; diğer her şey JPEG olur.
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9))
  if (!blob) throw new Error(T().whatsapp.files.imageProcessFailed(file.name))
  return { mime, bytes: await blob.arrayBuffer() }
}

async function upload(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) throw new Error(T().whatsapp.files.tooLarge(file.name))
  if (file.type.startsWith('image/')) {
    let image: { mime: string; bytes: ArrayBuffer }
    try {
      image = await normalizeImage(file)
    } catch {
      throw new Error(T().whatsapp.files.imageOpenFailed(file.name))
    }
    return window.api.attachments.add(file.name || T().whatsapp.files.defaultImageName, image.mime, image.bytes)
  }
  return window.api.attachments.add(file.name, file.type, await file.arrayBuffer())
}

export interface AttachmentState {
  items: Attachment[]
  /** Hâlâ okunmakta olan dosya sayısı */
  pending: number
  error: string
  add(files: Iterable<File>): void
  remove(id: string): void
  /** Gönderildikten sonra listeyi boşaltır; dosyalar mesaja bağlandığı için silinmez. */
  reset(): void
  clearError(): void
}

/** Gönderilmeyi bekleyen ek dosyaları yönetir. */
export function useAttachments(): AttachmentState {
  const [items, setItems] = useState<Attachment[]>([])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState('')

  const add = useCallback((files: Iterable<File>) => {
    for (const file of files) {
      setError('')
      setPending((n) => n + 1)
      upload(file)
        .then((attachment) => setItems((list) => [...list, attachment]))
        .catch((e) => setError(errorText(e)))
        .finally(() => setPending((n) => n - 1))
    }
  }, [])

  const remove = useCallback((id: string) => {
    setItems((list) => list.filter((a) => a.id !== id))
    void window.api.attachments.remove(id)
  }, [])

  const reset = useCallback(() => {
    setItems([])
    setError('')
  }, [])

  return { items, pending, error, add, remove, reset, clearError: useCallback(() => setError(''), []) }
}

/** Sürükleyip bırakılan ya da yapıştırılan dosyaları toplar. */
export function filesFrom(data: DataTransfer | null): File[] {
  return data ? [...data.files] : []
}

export interface JobState {
  running: boolean
  text: string
  error: string
  notice: string
  /** fn işi başlatır ve iş numarasını döndürür. */
  start(fn: () => Promise<string>): void
  stop(): void
  /** Ekrandaki metni elle değiştirir (ör. geçmişten bir sonuç açılınca). */
  setText(text: string): void
}

/** Arka planda akan bir üretim işini (mini uygulama, prompt geliştirme) izler. */
export function useJob(onDone?: (done: JobDone) => void): JobState {
  const [running, setRunning] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const jobId = useRef<string | null>(null)
  /** İş numarası henüz dönmeden gelen ilk parçaları kaçırmamak için. */
  const starting = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const mine = (id: string): boolean => {
      if (jobId.current === null && starting.current) jobId.current = id
      return jobId.current === id
    }
    const finish = (): void => {
      jobId.current = null
      starting.current = false
      setRunning(false)
    }
    const offChunk = window.api.jobs.onChunk((c) => mine(c.jobId) && setText((t) => t + c.delta))
    const offDone = window.api.jobs.onDone((d) => {
      if (!mine(d.jobId)) return
      setText(d.text)
      setNotice(d.notice ?? '')
      finish()
      onDoneRef.current?.(d)
    })
    const offError = window.api.jobs.onError((e) => {
      if (!mine(e.jobId)) return
      setError(e.error)
      finish()
    })
    return () => {
      offChunk()
      offDone()
      offError()
    }
  }, [])

  const start = useCallback((fn: () => Promise<string>) => {
    setText('')
    setError('')
    setNotice('')
    setRunning(true)
    jobId.current = null
    starting.current = true
    fn().then(
      (id) => {
        // İş çok hızlı bittiyse numara çoktan temizlenmiştir.
        if (starting.current) jobId.current = id
        starting.current = false
      },
      (e) => {
        starting.current = false
        setRunning(false)
        setError(errorText(e))
      }
    )
  }, [])

  const stop = useCallback(() => {
    if (jobId.current) void window.api.jobs.stop(jobId.current)
  }, [])

  return { running, text, error, notice, start, stop, setText }
}
