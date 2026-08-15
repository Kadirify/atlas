import { execFile } from 'node:child_process'
import os from 'node:os'
import { app } from 'electron'
import si from 'systeminformation'
import type { GpuInfo, HardwareInfo } from '@shared/types'
import { L } from '../i18n'
import { tierOf } from './catalog'

const GB = 1024 ** 3

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** nvidia-smi en doğru VRAM değerini verir; yoksa boş döner. */
function nvidiaGpus(): Promise<GpuInfo[]> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([])
        const gpus = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, mib] = line.split(',').map((s) => s.trim())
            return { name, vramGb: round1(Number(mib) / 1024) }
          })
          .filter((g) => Number.isFinite(g.vramGb))
        resolve(gpus)
      }
    )
  })
}

/** Windows 4 GB üstü VRAM'i yanlış bildirebildiği için bu sadece yedek yöntemdir. */
async function genericGpus(): Promise<GpuInfo[]> {
  try {
    const { controllers } = await si.graphics()
    return controllers
      .filter((c) => (c.vram ?? 0) > 0 && !c.vramDynamic)
      .map((c) => ({ name: c.model || c.vendor || L().main.hardware.genericGpu, vramGb: round1((c.vram ?? 0) / 1024) }))
  } catch {
    return []
  }
}

async function diskFreeGb(): Promise<number> {
  try {
    const target = app.getPath('home')
    const disks = await si.fsSize()
    const match = disks
      .filter((d) => target.toLowerCase().startsWith(d.mount.toLowerCase()))
      .sort((a, b) => b.mount.length - a.mount.length)[0]
    return match ? round1(match.available / GB) : 0
  } catch {
    return 0
  }
}

let cachedVram: number | null = null

/**
 * Klasör ya da veritabanı bağlı (araçlı) sohbetlerde kullanılacak bağlam boyutu. Dosyalar ve komut çıktıları bağlamı hızla
 * doldurduğu için ekran kartı yetiyorsa büyütülür. Ölçüm: 12 GB'lık kartta Atlas Strong 32 bin token ile 11,1 GB kullanıyor.
 */
export async function toolContextSize(): Promise<number> {
  if (cachedVram === null) cachedVram = (await scanHardware()).bestVramGb
  // 12 GB'lık kartta 32 bin de sığıyor ama ikinci bir model yüklenince Ollama çöküyor; pay bırakmak için 16 bin.
  return cachedVram >= 15 ? 32_768 : cachedVram >= 7 ? 16_384 : 8_192
}

export async function scanHardware(): Promise<HardwareInfo> {
  const [nvidia, generic, disk] = await Promise.all([nvidiaGpus(), genericGpus(), diskFreeGb()])
  const gpus = nvidia.length > 0 ? nvidia : generic
  const bestVramGb = gpus.reduce((max, g) => Math.max(max, g.vramGb), 0)
  const ramGb = Math.round(os.totalmem() / GB)
  const cpus = os.cpus()

  return {
    os: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model.trim() ?? L().main.hardware.unknownCpu,
    cores: cpus.length,
    ramGb,
    gpus,
    bestVramGb,
    diskFreeGb: disk,
    tier: tierOf(ramGb, bestVramGb)
  }
}
