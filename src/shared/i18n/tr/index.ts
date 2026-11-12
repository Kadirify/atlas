import { apps } from './apps'
import { chat } from './chat'
import { common } from './common'
import { main } from './main'
import { panel } from './panel'
import { prompts } from './prompts'
import { settings } from './settings'
import { setup } from './setup'
import { tools } from './tools'
import { whatsapp } from './whatsapp'

/**
 * Türkçe metinler. Bu sözlük kaynak kabul edilir: diğer dillerin sözlükleri
 * aynı yapıda olmak zorundadır, eksik bir metin derleme hatası verir.
 */
export const dict = { common, setup, chat, settings, apps, whatsapp, main, prompts, tools, panel }

export type Dict = typeof dict
