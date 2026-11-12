import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpdateInfo, UpdateProgress } from '@shared/types'
import { L } from '../i18n'
import { setAtlasModels, type AtlasModelsFile } from './catalog'

/** Uygulamanın ve model tariflerinin yayımlandığı GitHub deposu */
const REPO = 'kadirify/atlas'
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`
const RECIPES_URL = `https://raw.githubusercontent.com/${REPO}/main/resources/atlas-models.json`
const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const RECIPES_FILE = 'atlas-models.json'
const TIMEOUT_MS = 10_000
/** Kurulum dosyası yalnızca bu adresin altından indirilir. */
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`

/** Son denetimde bulunan kurulum dosyası. Adres arayüzden alınmaz, yalnızca burada tutulur. */
export interface UpdateAsset {
  version: string
  name: string
  url: string
  size: number
  /** GitHub'ın bildirdiği SHA-256 özeti; yoksa null */
  sha256: string | null
  notes: string
}

let pending: UpdateAsset | null = null

/** Yayındaki dosyalardan bu bilgisayara uygun kurulum dosyasını seçer. Güvenilmeyen adresler elenir. */
export function pickAsset(release: unknown, platform: NodeJS.Platform = process.platform): Omit<UpdateAsset, 'version' | 'notes'> | null {
  if (platform !== 'win32') return null
  const assets = (release as { assets?: unknown } | null)?.assets
  if (!Array.isArray(assets)) return null
  for (const a of assets as Record<string, unknown>[]) {
    const name = typeof a?.name === 'string' ? a.name : ''
    const url = typeof a?.browser_download_url === 'string' ? a.browser_download_url : ''
    const size = typeof a?.size === 'number' ? a.size : 0
    if (!/^[\w .()+-]+\.exe$/i.test(name) || !url.startsWith(DOWNLOAD_PREFIX) || size <= 0) continue
    const digest = typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a.digest) : null
    return { name, url, size, sha256: digest ? digest[1].toLowerCase() : null }
  }
  return null
}

/** "v1.2.3" ile "1.2.10" gibi sürümleri sayı sayı karşılaştırır: a daha yeniyse pozitif döner. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    v
      .trim()
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((p) => Number.parseInt(p, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Depodan gelen tarif dosyası beklenen biçimde mi. Bozuk ya da eksik dosya kataloğu bozmasın. */
export function isValidRecipes(value: unknown): value is AtlasModelsFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as { version?: unknown; models?: unknown }
  if (typeof file.version !== 'number' || !Array.isArray(file.models) || file.models.length === 0) return false
  return file.models.every((m: Record<string, unknown>) => {
    const name = m?.name as Record<string, unknown> | undefined
    const description = m?.description as Record<string, unknown> | undefined
    return (
      typeof m?.id === 'string' &&
      /^atlas[\w.-]*:[\w.-]+$/.test(m.id) &&
      typeof m.base === 'string' &&
      m.base.length > 0 &&
      typeof m.sizeGb === 'number' &&
      typeof m.rank === 'number' &&
      typeof name?.tr === 'string' &&
      typeof name?.en === 'string' &&
      typeof description?.tr === 'string' &&
      typeof description?.en === 'string' &&
      (m.tuned === undefined || typeof m.tuned === 'string') &&
      typeof m.parameters === 'object' &&
      m.parameters !== null
    )
  })
}

/** Daha önce indirilmiş tarifler varsa ve uygulamayla gelenden yeniyse onları kullanır. */
export function loadSavedRecipes(userData: string, bundledVersion: number): void {
  const path = join(userData, RECIPES_FILE)
  if (!existsSync(path)) return
  try {
    const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (isValidRecipes(saved) && saved.version > bundledVersion) setAtlasModels(saved)
  } catch {
    // Bozuk dosya yok sayılır; uygulamayla gelen tarifler kullanılır.
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Atlas', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(L().main.updates.failed)
  return res.json()
}

/**
 * Yeni uygulama sürümü ve yeni model tarifi var mı diye depoya bakar.
 * Yalnızca kullanıcı istediğinde çağrılır; depoya hiçbir bilgi gönderilmez.
 */
export async function checkUpdates(currentVersion: string, currentRecipes: number, userData: string): Promise<UpdateInfo> {
  let release: unknown
  let recipes: unknown
  try {
    ;[release, recipes] = await Promise.all([getJson(RELEASE_API), getJson(RECIPES_URL)])
  } catch {
    throw new Error(L().main.updates.failed)
  }

  const tag = (release as { tag_name?: unknown } | null)?.tag_name
  const latestVersion = typeof tag === 'string' ? tag.replace(/^v/i, '') : null
  const page = (release as { html_url?: unknown } | null)?.html_url

  let modelsUpdated = false
  if (isValidRecipes(recipes) && recipes.version > currentRecipes) {
    writeFileSync(join(userData, RECIPES_FILE), JSON.stringify(recipes, null, 2), 'utf8')
    setAtlasModels(recipes)
    modelsUpdated = true
  }

  const hasUpdate = latestVersion !== null && compareVersions(latestVersion, currentVersion) > 0
  const body = (release as { body?: unknown } | null)?.body
  const notes = typeof body === 'string' ? body.trim().slice(0, 20_000) : ''
  const asset = hasUpdate ? pickAsset(release) : null
  pending = asset && latestVersion ? { ...asset, version: latestVersion, notes } : null

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    url: typeof page === 'string' && page.startsWith(`https://github.com/${REPO}/`) ? page : RELEASES_PAGE,
    modelsUpdated,
    notes: hasUpdate ? notes : '',
    installable: pending !== null,
    sizeMb: pending ? Math.round(pending.size / 1e6) : 0
  }
}

export function pendingUpdate(): UpdateAsset | null {
  return pending
}

/**
 * Son denetimde bulunan kurulum dosyasını indirir ve bütünlüğünü denetler.
 * Boyut tutmazsa ya da GitHub'ın bildirdiği özet uyuşmazsa dosya silinir ve hata verilir.
 * @returns indirilen dosyanın yolu
 */
export async function downloadUpdate(tempDir: string, onProgress: (p: UpdateProgress) => void, asset = pending): Promise<string> {
  if (!asset) throw new Error(L().main.updates.nothingToInstall)
  const dir = join(tempDir, 'atlas-update')
  await mkdir(dir, { recursive: true })
  const file = join(dir, asset.name)
  await rm(file, { force: true })

  let res: Response
  try {
    res = await fetch(asset.url, { headers: { 'User-Agent': 'Atlas' } })
  } catch {
    throw new Error(L().main.updates.downloadFailed)
  }
  if (!res.ok || !res.body) throw new Error(L().main.updates.downloadFailed)

  const hash = createHash('sha256')
  const out = createWriteStream(file)
  let done = 0
  let lastEmit = 0
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      done += chunk.length
      if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
      const now = Date.now()
      if (now - lastEmit > 200) {
        lastEmit = now
        onProgress({ completedBytes: done, totalBytes: asset.size, percent: Math.min(100, (done / asset.size) * 100) })
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
  } catch {
    out.destroy()
    await rm(file, { force: true })
    throw new Error(L().main.updates.downloadFailed)
  }

  const size = (await stat(file)).size
  if (size !== asset.size || (asset.sha256 && hash.digest('hex') !== asset.sha256)) {
    await rm(file, { force: true })
    throw new Error(L().main.updates.corrupt)
  }
  onProgress({ completedBytes: size, totalBytes: asset.size, percent: 100 })
  return file
}

/** İndirilen kurulum dosyasını başlatır. Çağıran taraf hemen ardından uygulamayı kapatmalıdır. */
export function launchInstaller(file: string): void {
  const child = spawn(file, [], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}
