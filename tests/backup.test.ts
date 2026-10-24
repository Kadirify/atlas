import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase, Db } from '../src/main/db'

let dir: string
let backups: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-yedek-'))
  backups = join(dir, 'backups')
})

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Yarıda kalan bir göç denemesi dosyayı açık bırakmış olabilir; geçici klasör sistemce temizlenir.
  }
})

describe('şema güncellemesinden önce yedek', () => {
  it('açık veritabanının okunabilir bir kopyasını alır (henüz ana dosyaya işlenmemiş değişikliklerle)', () => {
    const db = new DatabaseSync(join(dir, 'atlas.db'))
    db.exec("PRAGMA journal_mode = WAL; CREATE TABLE notlar (id INTEGER PRIMARY KEY, metin TEXT); INSERT INTO notlar (metin) VALUES ('ilk'), ('ikinci');")
    const file = backupDatabase(db, backups, 7, new Date('2026-11-14T10:00:00Z'))
    db.close()
    expect(file).toContain('atlas-v7-2026-11-14-10-00-00.db')
    const copy = new DatabaseSync(file, { readOnly: true })
    expect(copy.prepare('SELECT metin FROM notlar ORDER BY id').all()).toEqual([{ metin: 'ilk' }, { metin: 'ikinci' }])
    copy.close()
  })

  it('yalnızca en yeni üç yedek saklanır', () => {
    const db = new DatabaseSync(join(dir, 'atlas.db'))
    db.exec('CREATE TABLE t (x INTEGER)')
    for (let day = 1; day <= 5; day++) backupDatabase(db, backups, day, new Date(`2026-11-0${day}T10:00:00Z`))
    db.close()
    expect(readdirSync(backups).sort()).toEqual(['atlas-v3-2026-11-03-10-00-00.db', 'atlas-v4-2026-11-04-10-00-00.db', 'atlas-v5-2026-11-05-10-00-00.db'])
  })

  it('yeni ve güncel veritabanında yedek alınmaz; şeması eski olanda alınır', () => {
    const path = join(dir, 'atlas.db')
    new Db(path, { backupDir: backups }).close()
    new Db(path, { backupDir: backups }).close()
    expect(readdirSync(dir)).not.toContain('backups')

    // Şema sürümü bir geri alınır: açılışta güncelleme bekleyen bir veritabanı gibi görünür.
    const raw = new DatabaseSync(path)
    const version = (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    raw.exec(`PRAGMA user_version = ${version - 1}`)
    raw.close()
    try {
      new Db(path, { backupDir: backups }).close()
    } catch {
      // Son göç ikinci kez uygulanamayabilir; önemli olan yedeğin ondan önce alınmış olması.
    }
    expect(readdirSync(backups).filter((name) => name.startsWith(`atlas-v${version - 1}-`))).toHaveLength(1)
  })
})
