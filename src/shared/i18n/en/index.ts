import type { Dict } from '../tr'
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

export const dict: Dict = { common, setup, chat, settings, apps, whatsapp, main, prompts, tools, panel }
