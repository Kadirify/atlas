import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlApproval, SqlResultEvent } from '@shared/types'

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }))

import { Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { SqlService } from '../src/main/services/sql'

let dir: string
let file: string
let service: SqlService
let connectionId: string
let approvals: SqlApproval[]
let results: SqlResultEvent[]
/** Onay istenince verilecek cevap */
let answer: boolean

const count = (): number => {
  const db = new DatabaseSync(file, { readOnly: true })
  const n = (db.prepare('SELECT count(*) AS n FROM personel').get() as { n: number }).n
  db.close()
  return n
}
const run = (name: string, args: Record<string, unknown>) =>
  service.execute('sohbet-1', connectionId, { name, arguments: args }, new AbortController().signal)

beforeEach(() => {
  setLanguage('tr')
  dir = mkdtempSync(join(tmpdir(), 'atlas-sql-'))
  file = join(dir, 'ornek.db')
  const seed = new DatabaseSync(file)
  seed.exec(`CREATE TABLE personel (id INTEGER PRIMARY KEY, ad TEXT NOT NULL, maas REAL);
             INSERT INTO personel (ad, maas) VALUES ('Ayşe', 50000), ('Mehmet', 42000), ('Zeynep', 61000);`)
  seed.close()
  approvals = []
  results = []
  answer = true
  service = new SqlService(new Db(':memory:'), {
    approval: (a) => {
      approvals.push(a)
      queueMicrotask(() => service.respond(a.id, answer))
    },
    result: (e) => results.push(e)
  })
  connectionId = service.save({ name: 'Örnek', engine: 'sqlite', file }).id
})

afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))

describe('SqlService: bağlantılar', () => {
  it('bağlantıyı saklar, listeler, şemayı okur ve siler', async () => {
    expect(service.list()).toMatchObject([{ name: 'Örnek', engine: 'sqlite', file, hasPassword: false }])
    expect(await service.test(connectionId)).toBe(1)
    expect(await service.schema(connectionId)).toEqual([
      {
        schema: '',
        name: 'personel',
        type: 'table',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: true, key: true },
          { name: 'ad', type: 'TEXT', nullable: false, key: false },
          { name: 'maas', type: 'REAL', nullable: true, key: false }
        ]
      }
    ])
    service.remove(connectionId)
    expect(service.list()).toEqual([])
  })

  it('panelden yalnızca okuma çalışır', async () => {
    expect((await service.runRead(connectionId, 'SELECT ad FROM personel ORDER BY id')).rows).toEqual([['Ayşe'], ['Mehmet'], ['Zeynep']])
    await expect(service.runRead(connectionId, "UPDATE personel SET maas = 1")).rejects.toThrow('yalnızca SELECT')
    await expect(service.runRead(connectionId, 'DELETE FROM personel')).rejects.toThrow('yalnızca SELECT')
    expect(count()).toBe(3)
  })
})

describe('SqlService: Atlas araçları', () => {
  it('bitmeyen sorgu Durdur ile hemen kesilir; adım "durduruldu" görünür', async () => {
    const controller = new AbortController()
    const started = Date.now()
    setTimeout(() => controller.abort(), 500)
    const out = await service.execute(
      'sohbet-1',
      connectionId,
      { name: 'sql_query', arguments: { sql: 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c' } },
      controller.signal
    )
    expect(Date.now() - started).toBeLessThan(1500)
    expect(out.step.status).toBe('error')
    expect(out.step.label).toBe('Sorgu durduruldu')
    expect(out.result).toContain('yarıda kesildi')
  })

  it('SELECT onay istemeden çalışır ve sonucu panele bildirir', async () => {
    const out = await run('sql_query', { sql: 'SELECT ad, maas FROM personel WHERE maas > 45000 ORDER BY maas' })
    expect(out.step.status).toBe('ok')
    expect(out.result).toBe('ad | maas\nAyşe | 50000\nZeynep | 61000')
    expect(approvals).toEqual([])
    expect(results).toHaveLength(1)
  })

  it('değiştiren sorgu onay ister; onaylanınca çalışır', async () => {
    const out = await run('sql_query', { sql: "UPDATE personel SET maas = maas + 1000 WHERE ad = 'Mehmet'" })
    expect(approvals).toMatchObject([{ conversationId: 'sohbet-1', connectionName: 'Örnek', keywords: ['UPDATE'] }])
    expect(out.step.status).toBe('ok')
    expect(out.result).toContain('1 satır etkilendi')
    expect((await service.runRead(connectionId, "SELECT maas FROM personel WHERE ad = 'Mehmet'")).rows).toEqual([[43000]])
  })

  it('onaylanmayan sorgu çalışmaz', async () => {
    answer = false
    const out = await run('sql_query', { sql: "INSERT INTO personel (ad, maas) VALUES ('Yeni', 1)" })
    expect(out.step.status).toBe('denied')
    expect(count()).toBe(3)
  })

  it('silme ve yok etme hiç çalışmaz, onaya bile sunulmaz', async () => {
    for (const sql of ['DELETE FROM personel', 'DROP TABLE personel', 'SELECT 1; DELETE FROM personel WHERE id = 1', 'ALTER TABLE personel DROP COLUMN maas']) {
      const out = await run('sql_query', { sql })
      expect(out.step.status).toBe('denied')
      expect(out.result).toContain('Maalesef silme işlemlerini ben yapamam')
    }
    expect(approvals).toEqual([])
    expect(count()).toBe(3)
    expect((await service.schema(connectionId))[0].columns).toHaveLength(3)
  })

  it('okuma bağlantısı salt okunurdur: SELECT gibi görünen bir yazma veriyi değiştiremez', async () => {
    // Sınıflandırıcı atlatılsa bile sürücünün salt okunur bağlantısı yazmayı reddeder.
    const driverOnly = service as unknown as { withDriver<T>(id: string, work: (d: { read(sql: string, n: number): Promise<T> }) => Promise<T>): Promise<T> }
    await expect(driverOnly.withDriver(connectionId, (d) => d.read("UPDATE personel SET maas = 0", 10))).rejects.toThrow()
    expect((await service.runRead(connectionId, 'SELECT min(maas) FROM personel')).rows).toEqual([[42000]])
  })

  it('şema aracı tabloları ve bir tablonun sütunlarını verir', async () => {
    expect((await run('sql_schema', {})).result).toBe('- personel: id, ad, maas')
    expect((await run('sql_schema', { table: 'personel' })).result).toBe('personel (tablo)\n- id: INTEGER (anahtar)\n- ad: TEXT boş olamaz\n- maas: REAL')
    expect((await run('sql_schema', { table: 'yok' })).step.status).toBe('error')
  })

  it('hatalı sorgu sohbeti kesmez, hata modele döner', async () => {
    const out = await run('sql_query', { sql: 'SELECT * FROM olmayan_tablo' })
    expect(out.step.status).toBe('error')
    expect(out.result).toContain('Sorgu hata verdi')
  })
})

describe('SqlService: programlanabilir nesneler', () => {
  it('tetikleyicileri listeler ve kodunu verir', async () => {
    const seed = new DatabaseSync(file)
    seed.exec("CREATE TABLE gunluk (id INTEGER PRIMARY KEY, mesaj TEXT); CREATE TRIGGER trg_personel_ekle AFTER INSERT ON personel BEGIN INSERT INTO gunluk (mesaj) VALUES ('eklendi: ' || NEW.ad); END;")
    seed.close()
    const objects = await service.schema(connectionId)
    expect(objects.find((o) => o.type === 'trigger')).toMatchObject({ name: 'trg_personel_ekle', parent: 'personel' })
    const out = await run('sql_schema', { table: 'trg_personel_ekle' })
    expect(out.result).toContain('tetikleyici')
    expect(out.result).toContain('INSERT INTO gunluk')
  })
})
