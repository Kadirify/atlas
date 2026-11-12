import { APP_ICONS, type ImproveRequest, type MiniAppDraft } from '@shared/types'
import { L } from '../i18n'
import { sanitizeDraft } from './apps'
import { chatOnce, OllamaError, type OllamaMessage } from './ollama'

/** Kısa isteği profesyonel bir prompta çevirmek için modele gidecek mesajlar. */
export function buildImproveMessages(request: ImproveRequest): OllamaMessage[] {
  const t = L().prompts.studio
  const short = request.request.trim()
  if (!short && !request.refine) throw new OllamaError(t.errors.requestRequired)
  const messages: OllamaMessage[] = [
    { role: 'system', content: t.improveSystem },
    { role: 'user', content: t.improveRequest(short) }
  ]
  if (request.refine) {
    messages.push(
      { role: 'assistant', content: request.refine.previous },
      { role: 'user', content: t.refineRequest(request.refine.instruction) }
    )
  }
  return messages
}

const APP_SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'icon', 'fields'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    icon: { type: 'string', enum: [...APP_ICONS] },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'type', 'placeholder', 'options', 'required'],
        properties: {
          label: { type: 'string' },
          type: { type: 'string', enum: ['text', 'textarea', 'select', 'toggle'] },
          placeholder: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' }
        }
      }
    }
  }
}

/** Prompttan ad, ikon ve form alanları önerir. Model bozuk veri döndürürse tek alanlı basit bir form verilir. */
export async function buildApp(model: string, prompt: string): Promise<MiniAppDraft> {
  const t = L().prompts.studio
  const text = prompt.trim()
  if (!text) throw new OllamaError(t.errors.promptRequired)

  let parsed: unknown = {}
  try {
    const raw = await chatOnce({
      model,
      format: APP_SCHEMA,
      numPredict: 900,
      temperature: 0.2,
      messages: [
        { role: 'system', content: t.buildSystem },
        { role: 'user', content: t.buildRequest(text.slice(0, 6000)) }
      ]
    })
    parsed = JSON.parse(raw)
  } catch (err) {
    if (err instanceof OllamaError) throw err
    // JSON çözülemediyse kullanıcı düzenleyicide elle tamamlar.
  }

  const suggestion = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  return sanitizeDraft({
    ...suggestion,
    name: typeof suggestion.name === 'string' && suggestion.name.trim() ? suggestion.name : t.defaultAppName,
    prompt: text
  })
}
