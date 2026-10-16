import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SnapshotStore } from '../src/main/services/snapshot'

let root: string
let store: string
let snapshots: SnapshotStore

const blobCount = async (): Promise<number> => {
  let n = 0
  for (const sub of await readdir(store).catch(() => [] as string[])) n += (await readdir(join(store, sub))).length
  return n
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'atlas-proje-'))
  store = await mkdtemp(join(tmpdir(), 'atlas-depo-'))
  snapshots = new SnapshotStore(store, (rel) => /(^|\/)\.env$/.test(rel))
  await mkdir(join(root, 'src'))
  await mkdir(join(root, 'node_modules', 'paket'), { recursive: true })
  await writeFile(join(root, 'notlar.txt'), 'ilk hal')
  await writeFile(join(root, 'src', 'hesap.js'), 'module.exports = 1\n')
  await writeFile(join(root, 'node_modules', 'paket', 'index.js'), 'bağımlılık')
  await writeFile(join(root, '.env'), 'PAROLA=gizli')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(store, { recursive: true, force: true })
})

describe('anlık görüntü', () => {
  it('silinen, değişen ve oluşan dosyaları bulur; önceki içerik geri okunabilir', async () => {
    const before = await snapshots.take(root)
    expect([...before.files.keys()].sort()).toEqual(['.env', 'notlar.txt', 'src/hesap.js'])
    await writeFile(join(root, 'notlar.txt'), 'bozuldu')
    await rm(join(root, 'src', 'hesap.js'))
    await writeFile(join(root, 'cikti.log'), 'yeni')
    await writeFile(join(root, 'node_modules', 'paket', 'index.js'), 'değişti ama bakılmaz')
    const effects = await snapshots.diff(before)
    expect(effects.changed.map((c) => c.path)).toEqual(['notlar.txt'])
    expect(effects.deleted.map((d) => d.path)).toEqual(['src/hesap.js'])
    expect(effects.created.map((c) => c.path)).toEqual(['cikti.log'])
    expect((await snapshots.read(effects.changed[0].before!))?.toString()).toBe('ilk hal')
    expect((await snapshots.read(effects.deleted[0].before!))?.toString()).toBe('module.exports = 1\n')
  })

  it('gizli dosyaları saklamaz; değişirlerse önceki hali yok diye bildirir', async () => {
    const before = await snapshots.take(root)
    expect(before.files.get('.env')?.hash).toBeNull()
    await writeFile(join(root, '.env'), 'PAROLA=degisti')
    const effects = await snapshots.diff(before)
    expect(effects.changed).toEqual([{ path: '.env', before: null, after: null }])
    // Depoda gizli dosyanın içeriği yok.
    for (const sub of await readdir(store)) {
      for (const name of await readdir(join(store, sub))) expect(await readFile(join(store, sub, name), 'utf8')).not.toContain('PAROLA=gizli')
    }
  })

  it('aynı içerik bir kez saklanır; ikinci görüntü değişmeyen dosyaları yeniden yazmaz', async () => {
    await writeFile(join(root, 'kopya.txt'), 'ilk hal')
    await snapshots.take(root)
    const first = await blobCount()
    // notlar.txt ile kopya.txt aynı içerik: iki dosya, tek kopya (src/hesap.js ile birlikte iki).
    expect(first).toBe(2)
    await snapshots.take(root)
    expect(await blobCount()).toBe(first)
  })

  it('içeriği aynı kalan dosya (yalnızca zamanı değişen) değişmiş sayılmaz', async () => {
    const before = await snapshots.take(root)
    await writeFile(join(root, 'notlar.txt'), 'ilk hal')
    const effects = await snapshots.diff(before)
    expect(effects.changed).toEqual([])
  })

  it('kullanılmayan kopyalar temizlenir, geri alma için gerekenler kalır', async () => {
    const before = await snapshots.take(root)
    const keep = before.files.get('notlar.txt')!.hash!
    expect(await snapshots.prune(new Set([keep]))).toBe(1)
    expect((await snapshots.read(keep))?.toString()).toBe('ilk hal')
    expect(await blobCount()).toBe(1)
  })
})
