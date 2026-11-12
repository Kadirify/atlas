import {
  APP_CATEGORIES,
  APP_ICONS,
  type AppCategory,
  type AppField,
  type AppIcon,
  type FieldType,
  type MiniApp,
  type MiniAppDraft,
  type RunRequest,
  type Settings
} from '@shared/types'
import { ATTACHMENT_CHAR_BUDGET, type Db } from '../db'
import { L } from '../i18n'
import { attachmentsBlock } from './attachments'
import { todayLine } from './chat'
import type { OllamaMessage } from './ollama'

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'select', 'toggle']
const MAX_FIELDS = 10

export const EXPORT_FORMAT = 'atlas-app'
export const EXPORT_EXTENSION = 'atlasapp'

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Dışarıdan gelen (model çıktısı ya da içe aktarılan dosya) veriyi güvenli bir taslağa çevirir.
 * Eksik ya da hatalı alanlar varsayılanlarla doldurulur; ad ve prompt yoksa hata verir.
 */
export function sanitizeDraft(input: unknown): MiniAppDraft {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = str(raw.name, 60)
  const prompt = str(raw.prompt, 20_000)
  const t = L().tools.apps
  if (!name) throw new Error(t.errors.noName)
  if (!prompt) throw new Error(t.errors.noPrompt)

  const seenKeys = new Set<string>()
  const fields: AppField[] = []
  for (const item of Array.isArray(raw.fields) ? raw.fields.slice(0, MAX_FIELDS) : []) {
    const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const label = str(f.label, 60)
    if (!label) continue
    const options = (Array.isArray(f.options) ? f.options : [])
      .map((o) => str(o, 60))
      .filter(Boolean)
      .slice(0, 12)
    let type = FIELD_TYPES.includes(f.type as FieldType) ? (f.type as FieldType) : 'text'
    // Seçeneği olmayan bir açılır liste kullanılamaz.
    if (type === 'select' && options.length < 2) type = 'text'

    let key = str(f.key, 40).replace(/[^\w-]/g, '') || `alan_${fields.length + 1}`
    while (seenKeys.has(key)) key += '_'
    seenKeys.add(key)

    fields.push({
      key,
      label,
      type,
      placeholder: str(f.placeholder, 160),
      options: type === 'select' ? options : [],
      // Evet/hayır alanı zorunlu olamaz; açılır listede her zaman bir seçim vardır.
      required: type === 'toggle' ? false : type === 'select' ? true : f.required !== false
    })
  }
  if (fields.length === 0) {
    fields.push({ key: 'alan_1', label: t.defaultFieldLabel, type: 'textarea', placeholder: '', options: [], required: true })
  }

  return {
    name,
    description: str(raw.description, 160),
    icon: APP_ICONS.includes(raw.icon as AppIcon) ? (raw.icon as AppIcon) : 'sparkles',
    category: APP_CATEGORIES.includes(raw.category as AppCategory) ? (raw.category as AppCategory) : 'Diğer',
    prompt,
    fields
  }
}

/** Kurumsal kullanım açıksa yazan kişinin bilgileri ve imzası modele verilir. */
export function corporateBlock(
  settings: Pick<Settings, 'corporateMode' | 'userName' | 'jobTitle' | 'company' | 'signature'> &
    Partial<Pick<Settings, 'salutation' | 'closing'>>
): string {
  const t = L().tools.apps
  const parts: string[] = []

  if (!settings.corporateMode) {
    if (settings.userName) parts.push(t.writerName(settings.userName))
  } else {
    const who = [t.aboutWriter]
    if (settings.userName) who.push(t.writerNameLine(settings.userName))
    if (settings.jobTitle) who.push(t.writerTitleLine(settings.jobTitle))
    if (settings.company) who.push(t.writerCompanyLine(settings.company))
    if (who.length > 1) parts.push(who.join('\n'))
  }

  // Kullanıcının Ayarlar'da seçtiği hitap ve kapanış; formda "Samimi" ton seçilse bile bunlar kullanılır.
  const salutation = settings.salutation?.trim()
  const closing = settings.closing?.trim()
  const hasSignature = settings.corporateMode && !!settings.signature
  if (salutation || closing || hasSignature) {
    const prefs = [t.letterPrefs]
    if (salutation) prefs.push(t.salutationRule(salutation))
    if (closing && !hasSignature) prefs.push(t.closingRule(closing))
    if (hasSignature) prefs.push(t.signatureRule, settings.signature)
    parts.push(prefs.join('\n'))
  }
  return parts.join('\n\n')
}

/** Formdaki değerleri "Etiket: değer" satırlarına çevirir. Boş bırakılan isteğe bağlı alanlar atlanır. */
export function formatValues(fields: AppField[], values: Record<string, string>): string {
  const t = L().tools.apps
  const lines: string[] = []
  for (const field of fields) {
    const value = (values[field.key] ?? '').trim()
    if (field.type === 'toggle') {
      lines.push(`${field.label}: ${value === 'true' ? t.yes : t.no}`)
    } else if (value) {
      lines.push(field.type === 'textarea' ? `${field.label}:\n${value}` : `${field.label}: ${value}`)
    }
  }
  return lines.join('\n\n')
}

export function missingRequired(fields: AppField[], values: Record<string, string>, hasAttachments: boolean): string[] {
  return fields
    .filter((f) => f.required && !(values[f.key] ?? '').trim())
    // Metin yerine dosya eklendiyse uzun metin alanı boş kalabilir.
    .filter((f) => !(f.type === 'textarea' && hasAttachments))
    .map((f) => f.label)
}

/** Mini uygulamayı çalıştırmak için modele gidecek mesajları kurar. */
export function buildRunMessages(app: MiniApp, request: RunRequest, db: Db): OllamaMessage[] {
  const hasAttachments = request.attachmentIds.length > 0
  const missing = missingRequired(app.fields, request.values, hasAttachments)
  const t = L().tools.apps
  if (missing.length > 0) throw new Error(t.errors.requiredMissing(missing.join(', ')))

  const system = [app.prompt, t.commonRules, todayLine(), corporateBlock(db.getSettings())].filter(Boolean).join('\n\n')
  const files = db.attachmentContents(request.attachmentIds)
  const user = [formatValues(app.fields, request.values), attachmentsBlock(files, ATTACHMENT_CHAR_BUDGET)]
    .filter(Boolean)
    .join('\n\n')

  const messages: OllamaMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user || t.emptyRequest }
  ]
  if (request.refine) {
    messages.push(
      { role: 'assistant', content: request.refine.previous },
      {
        role: 'user',
        content: t.refine(request.refine.instruction)
      }
    )
  }
  return messages
}
