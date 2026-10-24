/** Ana pencerenin kaydedilen yeri ve boyutu */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Kaydedilen pencere yeri hâlâ kullanılabiliyorsa onu döner; değilse null (pencere varsayılan yerde açılır).
 * Ekran çıkarılmış ya da çözünürlük değişmiş olabilir: pencerenin başlık çubuğu hiçbir ekranın çalışma alanında
 * görünmüyorsa kayıt yok sayılır; pencere ekrandan büyükse o ekrana sığdırılır.
 */
export function restoreBounds(saved: unknown, displays: Area[], min: { width: number; height: number }): WindowState | null {
  if (!saved || typeof saved !== 'object') return null
  const s = saved as Partial<Record<keyof WindowState, unknown>>
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
  const x = num(s.x)
  const y = num(s.y)
  const w = num(s.width)
  const h = num(s.height)
  if (x === null || y === null || w === null || h === null) return null
  const width = Math.max(min.width, w)
  const height = Math.max(min.height, h)
  // Başlık çubuğunun (üstteki 40 piksel) en az 120 piksellik kısmı bir ekranda olmalı: pencere tutulup taşınabilsin.
  const display = displays.find(
    (d) => Math.min(x + width, d.x + d.width) - Math.max(x, d.x) >= 120 && y >= d.y - 8 && y + 40 <= d.y + d.height
  )
  if (!display) return null
  return { x, y, width: Math.min(width, display.width), height: Math.min(height, display.height), maximized: s.maximized === true }
}
