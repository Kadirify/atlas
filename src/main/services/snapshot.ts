import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * Komutlar için güvenli kip: komuttan önce proje klasörünün anlık görüntüsü alınır, sonra neyin değiştiğine bakılır.
 * Onaylanan bir komut (`npm test`), Atlas'ın değiştirdiği bir dosyadaki her şeyi çalıştırabilir; komut süzgeci bunu
 * göremez. Görüntü sayesinde komutun sildiği ya da değiştirdiği dosyalar geri getirilebilir.
 *
 * Dosyalar içerik özetleriyle (sha256) bir kez saklanır; aynı içerik ikinci kez yazılmaz. Sonraki görüntülerde boyutu ve
 * değişme zamanı aynı kalan dosyalar okunmaz bile. Git gerekmez.
 */

/** Gezilmeyen klasörler: bağımlılıklar, derleme çıktıları, sürüm denetimi. Noktayla başlayan klasörler de gezilmez. */
const SKIP_DIRS = new Set([
  'node_modules',
  '__pycache__',
  'venv',
  'bin',
  'obj',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '$RECYCLE.BIN',
  'System Volume Information'
])
/** Bundan büyük dosyalar saklanmaz (geri getirilemez, ama değiştiği söylenir). */
const MAX_FILE_BYTES = 8 * 1024 * 1024
/** Bir görüntüde en çok bu kadar dosyaya bakılır */
const MAX_FILES = 20_000
/** Bir görüntüde depoya en çok bu kadar yeni veri yazılır (ilk görüntü bütün projeyi kopyalar) */
const MAX_NEW_BYTES = 256 * 1024 * 1024
/** Komuttan sonra en çok bu kadar değişiklik listelenir */
const MAX_EFFECTS = 500

export interface FileState {
  size: number
  mtimeMs: number
  /** İçeriğin özeti; dosya saklanamadıysa (çok büyük, gizli, okunamadı) null */
  hash: string | null
}

export interface Snapshot {
  root: string
  files: Map<string, FileState>
  /** Sınırlara takıldı: bazı dosyalara bakılmadı ya da saklanmadı */
  partial: boolean
}

export interface CommandEffects {
  /** before: komuttan önceki içeriğin özeti (null: saklanamamıştı), after: şimdiki içeriğin özeti */
  changed: { path: string; before: string | null; after: string | null }[]
  deleted: { path: string; before: string | null }[]
  created: { path: string; after: string | null }[]
  /** Liste sınıra takıldı ya da görüntü eksikti */
  partial: boolean
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Klasördeki dosyaları (göreli yol, boyut, değişme zamanı) gezer; bağlantıları izlemez. */
async function scan(root: string): Promise<{ files: Map<string, { size: number; mtimeMs: number; full: string }>; partial: boolean }> {
  const files = new Map<string, { size: number; mtimeMs: number; full: string }>()
  let partial = false
  const visit = async (dir: string): Promise<void> => {
    if (files.size >= MAX_FILES) {
      partial = true
      return
    }
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const subdirs: string[] = []
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isSymbolicLink()) return
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) subdirs.push(full)
          return
        }
        if (!entry.isFile()) return
        const rel = relative(root, full).split(sep).join('/')
        const info = await stat(full).catch(() => null)
        if (!info) return
        if (files.size >= MAX_FILES) {
          partial = true
          return
        }
        files.set(rel, { size: info.size, mtimeMs: info.mtimeMs, full })
      })
    )
    for (const sub of subdirs.sort()) await visit(sub)
  }
  await visit(root)
  return { files, partial }
}

export class SnapshotStore {
  /** Klasör başına en son bilinen dosya durumları: değişmeyen dosyalar yeniden okunmasın */
  private known = new Map<string, Map<string, FileState>>()

  constructor(
    private dir: string,
    /** Saklanmayacak dosyalar (parola, anahtar) */
    private secret: (rel: string) => boolean = () => false
  ) {}

  private blobPath(hash: string): string {
    return join(this.dir, hash.slice(0, 2), hash)
  }

  private async put(hash: string, bytes: Buffer): Promise<number> {
    const target = this.blobPath(hash)
    if (existsSync(target)) return 0
    await mkdir(join(this.dir, hash.slice(0, 2)), { recursive: true })
    // Yarıda kalan yazma bozuk bir kopya bırakmasın.
    const temp = `${target}.${process.pid}.tmp`
    await writeFile(temp, bytes)
    await rename(temp, target).catch(async () => rm(temp, { force: true }))
    return bytes.length
  }

  /** Saklanan içerik; yoksa null */
  async read(hash: string): Promise<Buffer | null> {
    return readFile(this.blobPath(hash)).catch(() => null)
  }

  /** Dosyanın içeriğini okur, özetini çıkarır ve saklar. Okunamazsa ya da bütçe yetmezse özet null olur. */
  private async keep(full: string, size: number, budget: { left: number }): Promise<string | null> {
    if (size > MAX_FILE_BYTES || size > budget.left) return null
    const bytes = await readFile(full).catch(() => null)
    if (!bytes) return null
    const hash = sha256(bytes)
    budget.left -= await this.put(hash, bytes).catch(() => bytes.length)
    return existsSync(this.blobPath(hash)) ? hash : null
  }

  /** Komuttan önce: klasörün şimdiki hali */
  async take(root: string): Promise<Snapshot> {
    const cache = this.known.get(root) ?? new Map<string, FileState>()
    const { files: found, partial: walkPartial } = await scan(root)
    const files = new Map<string, FileState>()
    const budget = { left: MAX_NEW_BYTES }
    let partial = walkPartial
    for (const [rel, info] of found) {
      const prev = cache.get(rel)
      if (prev && prev.hash && prev.size === info.size && prev.mtimeMs === info.mtimeMs) {
        files.set(rel, prev)
        continue
      }
      // Gizli dosyalar (parola, anahtar) izlenir ama içerikleri saklanmaz.
      const hash = this.secret(rel) ? null : await this.keep(info.full, info.size, budget)
      if (!hash && !this.secret(rel) && info.size <= MAX_FILE_BYTES && budget.left < info.size) partial = true
      files.set(rel, { size: info.size, mtimeMs: info.mtimeMs, hash })
    }
    this.known.set(root, files)
    return { root, files, partial }
  }

  /** Komuttan sonra: görüntüden bu yana silinen, değişen ve oluşan dosyalar */
  async diff(before: Snapshot): Promise<CommandEffects> {
    const { files: now, partial: walkPartial } = await scan(before.root)
    const effects: CommandEffects = { changed: [], deleted: [], created: [], partial: before.partial || walkPartial }
    const budget = { left: MAX_NEW_BYTES }
    const next = new Map<string, FileState>()
    const count = (): number => effects.changed.length + effects.deleted.length + effects.created.length
    for (const [rel, info] of now) {
      const old = before.files.get(rel)
      if (old && old.size === info.size && old.mtimeMs === info.mtimeMs) {
        next.set(rel, old)
        continue
      }
      // Değişen ya da yeni dosya: şimdiki içerik de saklanır (geri alırken "sonradan değişti mi" diye bakılır).
      const hash = this.secret(rel) ? null : await this.keep(info.full, info.size, budget)
      next.set(rel, { size: info.size, mtimeMs: info.mtimeMs, hash })
      if (old && hash !== null && hash === old.hash) continue
      if (count() >= MAX_EFFECTS) {
        effects.partial = true
        continue
      }
      if (old) effects.changed.push({ path: rel, before: old.hash, after: hash })
      else effects.created.push({ path: rel, after: hash })
    }
    for (const [rel, old] of before.files) {
      if (now.has(rel)) continue
      if (count() >= MAX_EFFECTS) {
        effects.partial = true
        break
      }
      effects.deleted.push({ path: rel, before: old.hash })
    }
    this.known.set(before.root, next)
    return effects
  }

  /** Hiçbir geri alma kaydının kullanmadığı içerikleri siler (uygulama açılırken). */
  async prune(keep: Set<string>): Promise<number> {
    let removed = 0
    const dirs = await readdir(this.dir).catch(() => [] as string[])
    for (const sub of dirs) {
      const names = await readdir(join(this.dir, sub)).catch(() => [] as string[])
      for (const name of names) {
        if (keep.has(name)) continue
        await rm(join(this.dir, sub, name), { force: true }).catch(() => undefined)
        removed++
      }
    }
    this.known.clear()
    return removed
  }
}
