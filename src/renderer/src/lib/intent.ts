import { fold } from './fold'

/** "CV'yi yanda göster", "bu belgeyi sağda açar mısın", "yanda göster lütfen" */
const SHOW_ON_SIDE_TR =
  /^(?:[\p{L}\d._'’-]+\s+){0,2}(?:yanda|sağda|sagda|yan\s+tarafta|sağ\s+tarafta|sag\s+tarafta|yan\s+panelde)\s+(?:göster|goster|aç|ac)\p{L}*(?:\s+m[iuü]\p{L}*)?(?:\s+(?:lütfen|lutfen))?$/u
/** "show it on the side", "open the document on the right", "please open this in the side panel" */
const SHOW_ON_SIDE_EN =
  /^(?:please\s+)?(?:show|open|display)\s+(?:it|this|that|the\s+(?:document|doc|file|cv|pdf)|[\p{L}\d._'’-]+)\s+(?:on\s+the\s+(?:side|right)|in\s+(?:the\s+)?side\s+panel)(?:\s+please)?$/u

/**
 * Mesajın tamamı, sohbetteki belgeyi yan panelde açma isteği mi? Yalnızca kısa ve kalıba baştan sona uyan mesajlar
 * sayılır; "Word'de sağda açılan paneli nasıl kapatırım?" ya da "show the two versions side by side" gibi
 * sorular modele gider.
 */
export function asksShowOnSide(text: string): boolean {
  const clean = fold(text.trim())
    .replace(/[.!?…]+$/u, '')
    .trim()
  if (!clean || clean.split(/\s+/).length > 8) return false
  return SHOW_ON_SIDE_TR.test(clean) || SHOW_ON_SIDE_EN.test(clean)
}
