import type { HardwareInfo, InstalledModel, Settings } from '@shared/types'

/**
 * Hata bildirimine yapıştırılacak tanılama bilgisi: sürümler, donanım, modeller ve davranışı etkileyen ayarlar.
 * Sohbet içeriği, kullanıcı adı, şirket bilgisi, dosya yolları ve başka (Atlas dışı) modellerin adları girmez.
 */
export interface DiagnosticsInput {
  version: string
  packaged: boolean
  versions: { electron: string; chrome: string; node: string }
  arch: string
  hardware: HardwareInfo
  ollama: { installed: boolean; running: boolean; version: string | null }
  installed: InstalledModel[]
  loaded: { name: string; sizeGb: number; gpuPercent: number }[]
  /** Atlas'ın kendi modeli mi (Atlas ailesi) */
  isAtlas(name: string): boolean
  embeddingModel: string
  settings: Pick<Settings, 'language' | 'defaultModel' | 'think' | 'memoryEnabled' | 'corporateMode'>
  lockEnabled: boolean
  log: { errors: number; warnings: number }
}

const onOff = (on: boolean): string => (on ? 'on' : 'off')

export function formatDiagnostics(d: DiagnosticsInput): string {
  const hw = d.hardware
  const atlas = d.installed.filter((m) => d.isAtlas(m.name))
  const embedding = d.installed.some((m) => m.name === d.embeddingModel || m.name.startsWith(`${d.embeddingModel}:`))
  const others = d.installed.length - atlas.length - (embedding ? 1 : 0)
  const lines = [
    `Atlas: ${d.version} (${d.packaged ? 'installed' : 'development'})`,
    `Electron: ${d.versions.electron}, Chromium ${d.versions.chrome}, Node ${d.versions.node}`,
    `OS: ${hw.os} (${d.arch})`,
    `CPU: ${hw.cpu} (${hw.cores} threads)`,
    `RAM: ${hw.ramGb} GB`,
    `GPU: ${hw.gpus.length > 0 ? hw.gpus.map((g) => `${g.name} (${g.vramGb} GB)`).join(', ') : 'none detected'}`,
    `Free disk: ${hw.diskFreeGb} GB`,
    `Ollama: ${d.ollama.running ? `${d.ollama.version ?? '?'}, running` : d.ollama.installed ? 'installed, not running' : 'not installed'}`,
    `Atlas models: ${atlas.length > 0 ? atlas.map((m) => `${m.name} (${m.sizeGb} GB)`).join(', ') : 'none'}`,
    `Embedding model: ${embedding ? 'installed' : 'missing'}`,
    `Other models: ${others}`,
    `In memory: ${d.loaded.length > 0 ? d.loaded.map((m) => `${m.name} (${m.sizeGb} GB, ${m.gpuPercent}% GPU)`).join(', ') : 'none'}`,
    `Settings: language ${d.settings.language}, default model ${d.settings.defaultModel ?? 'none'}, thinking ${onOff(d.settings.think)}, memory ${onOff(d.settings.memoryEnabled)}, corporate mode ${onOff(d.settings.corporateMode)}, app lock ${onOff(d.lockEnabled)}`,
    `Log (last 7 days): ${d.log.errors} errors, ${d.log.warnings} warnings`
  ]
  return lines.join('\n')
}
