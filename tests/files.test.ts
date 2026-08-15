import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Çöp kutusu yerine dosya doğrudan silinir; donanım taraması yapılmaz.
vi.mock('electron', () => ({
  shell: { trashItem: async (path: string) => (await import('node:fs/promises')).rm(path, { recursive: true }) },
  app: { getPath: () => tmpdir() }
}))

import type { FileApproval, Folder } from '../src/shared/types'
import { Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { chunkText, FilesService, resolveInside, walk } from '../src/main/services/files'
import type { MemoryService } from '../src/main/services/memory'

const noSemantic = { hasSemantic: async () => false } as unknown as MemoryService

let root: string
let outside: string
let db: Db
let folder: Folder
let service: FilesService
let approvals: FileApproval[]
/** Sıradaki onay isteğine verilecek cevap */
let answer: boolean

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'atlas-klasor-'))
  outside = await mkdtemp(join(tmpdir(), 'atlas-disari-'))
  await mkdir(join(root, 'raporlar'))
  await mkdir(join(root, '.gizli'))
  await writeFile(join(root, 'notlar.txt'), 'Proje kod adı: Zümrüt-7\nTeslim tarihi 3 Mart\nSorumlu: Deniz Akar')
  await writeFile(join(root, 'raporlar', 'ocak.md'), '# Ocak raporu\nSunucu iki kez çöktü.\nYedekleme süresi 6 saat.')
  await writeFile(join(root, '.gizli', 'sir.txt'), 'görünmemeli')
  await writeFile(join(outside, 'gizli.txt'), 'dışarıdaki dosya')

  db = new Db(':memory:')
  folder = db.addFolder(root)
  approvals = []
  answer = true
  service = new FilesService(
    db,
    {
      approval: (a) => {
        approvals.push(a)
        queueMicrotask(() => service.respond(a.id, answer))
      },
      indexProgress: () => {}
    },
    noSemantic
  )
})

afterEach(async () => {
  db.close()
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

const run = (name: string, args: Record<string, unknown>, canWrite = true) =>
  service.execute('sohbet', folder, { name, arguments: args }, new AbortController().signal, canWrite)

describe('resolveInside', () => {
  it('klasörün içindeki yolları kabul eder', async () => {
    expect(await resolveInside(root, 'notlar.txt')).toContain('notlar.txt')
    expect(await resolveInside(root, '.')).toBeTruthy()
    expect(await resolveInside(root, '/raporlar/ocak.md')).toContain('ocak.md')
    // Henüz var olmayan dosya ve klasör (yeni dosya yazarken)
    expect(await resolveInside(root, 'yeni/alt/dosya.txt')).toContain(join('yeni', 'alt', 'dosya.txt'))
  })

  it('klasörün dışına çıkan her yolu reddeder', async () => {
    await expect(resolveInside(root, '../gizli.txt')).rejects.toThrow(/dışında/)
    await expect(resolveInside(root, 'raporlar/../../x')).rejects.toThrow(/dışında/)
    await expect(resolveInside(root, join(outside, 'gizli.txt'))).rejects.toThrow(/dışında/)
    await expect(resolveInside(root, 'C:\\Windows\\system32')).rejects.toThrow(/dışında/)
  })

  it('dışarıyı gösteren kısayolu reddeder', async () => {
    try {
      await symlink(outside, join(root, 'kacak'), 'junction')
    } catch {
      return // Kısayol oluşturma izni yoksa bu kontrol atlanır.
    }
    await expect(resolveInside(root, 'kacak/gizli.txt')).rejects.toThrow(/dışında/)
  })
})

describe('okuma araçları', () => {
  it('klasörü listeler; gizli klasörleri göstermez', async () => {
    const { step, result } = await run('list_folder', { path: '.' })
    expect(step.status).toBe('ok')
    expect(step.label).toContain('2 öğe')
    expect(result).toContain('[klasör] raporlar/')
    expect(result).toContain('notlar.txt')
    expect(result).not.toContain('.gizli')
  })

  it('dosyayı okur; uzun dosyayı parça parça verir', async () => {
    expect((await run('read_file', { path: 'notlar.txt' })).result).toContain('Zümrüt-7')
    await writeFile(join(root, 'uzun.txt'), 'a'.repeat(15_000) + 'SON')
    const first = await run('read_file', { path: 'uzun.txt' })
    expect(first.result).toContain('start: 12000')
    expect(first.result).not.toContain('SON')
    const second = await run('read_file', { path: 'uzun.txt', start: 12000 })
    expect(second.result).toContain('SON')
    expect(second.step.label).toContain('devamı')
  })

  it('dosya adında ve içerikte arar', async () => {
    const byContent = await run('search_files', { query: 'yedekleme' })
    expect(byContent.result).toContain('raporlar/ocak.md, satır 3')
    const byName = await run('search_files', { query: 'ocak' })
    expect(byName.result).toContain('Adı eşleşen dosyalar')
    expect((await run('search_files', { query: 'görünmemeli' })).result).toContain('sonuç bulunamadı')
  })

  it('olmayan dosyada ve klasör dışı yolda hatayı modele anlatır, çökmeden', async () => {
    const missing = await run('read_file', { path: 'yok.txt' })
    expect(missing.step.status).toBe('error')
    expect(missing.result).toContain('Böyle bir dosya')
    expect(missing.step.label).toBe('Okunamadı: yok.txt')
    const escape = await run('read_file', { path: '../gizli.txt' })
    expect(escape.step.status).toBe('error')
    expect(escape.result).not.toContain('dışarıdaki dosya')
    expect((await run('uydurma_arac', {})).step.status).toBe('error')
  })
})

describe('yazma araçları', () => {
  it('yeni dosyayı onayla yazar ve kayda geçirir', async () => {
    const { step } = await run('write_file', { path: 'raporlar/ozet.md', content: '# Özet\nHer şey yolunda.' })
    expect(step.label).toBe('Oluşturuldu: raporlar/ozet.md')
    expect(approvals[0]).toMatchObject({ kind: 'write', path: 'raporlar/ozet.md', before: null, after: '# Özet\nHer şey yolunda.' })
    expect(await readFile(join(root, 'raporlar', 'ozet.md'), 'utf8')).toContain('Her şey yolunda.')
    expect(db.listFileActions(folder.id)[0]).toMatchObject({ kind: 'write', path: 'raporlar/ozet.md' })
  })

  it('var olan dosyada eski içeriği onaya gösterir; reddedilirse dokunmaz', async () => {
    answer = false
    const { step, result } = await run('write_file', { path: 'notlar.txt', content: 'silindi' })
    expect(step.status).toBe('denied')
    expect(result).toContain('REDDETTİ')
    expect(approvals[0].before).toContain('Zümrüt-7')
    expect(await readFile(join(root, 'notlar.txt'), 'utf8')).toContain('Zümrüt-7')
    expect(db.listFileActions(folder.id)).toEqual([])
  })

  it('aynı içerikte onay istemez; belge türlerine ve klasör dışına yazmaz', async () => {
    const same = await run('write_file', { path: 'notlar.txt', content: await readFile(join(root, 'notlar.txt'), 'utf8') })
    expect(same.step.label).toContain('Değişiklik yok')
    expect((await run('write_file', { path: 'rapor.pdf', content: 'x' })).step.status).toBe('error')
    expect((await run('write_file', { path: 'program.exe', content: 'x' })).step.status).toBe('error')
    expect((await run('write_file', { path: '../kacak.txt', content: 'x' })).step.status).toBe('error')
    expect(approvals).toEqual([])
  })

  it('taşır ve klasör oluşturur; silme isteğini reddeder', async () => {
    expect((await run('create_folder', { path: 'arsiv' })).step.status).toBe('ok')
    const moved = await run('move_file', { from: 'notlar.txt', to: 'arsiv/notlar-eski.txt' })
    expect(moved.step.label).toBe('Taşındı: notlar.txt → arsiv/notlar-eski.txt')
    expect((await stat(join(root, 'arsiv', 'notlar-eski.txt'))).isFile()).toBe(true)
    // Hedefte aynı adda dosya varsa üstüne yazmaz.
    await writeFile(join(root, 'a.txt'), 'a')
    expect((await run('move_file', { from: 'a.txt', to: 'arsiv/notlar-eski.txt' })).step.status).toBe('error')

    // Atlas dosya silmez: araç çağrılsa bile onay istenmeden reddedilir ve dosya yerinde kalır.
    const before = approvals.length
    const deleted = await run('delete_file', { path: 'a.txt' })
    expect(deleted.step.status).toBe('denied')
    expect(deleted.result).toContain('Maalesef silme işlemlerini ben yapamam')
    expect((await stat(join(root, 'a.txt'))).isFile()).toBe(true)
    expect(approvals.length).toBe(before)
    expect((await run('delete_file', { path: '.' })).step.status).toBe('denied')
    expect(db.listFileActions(folder.id).map((a) => a.kind).sort()).toEqual(['mkdir', 'move'])
  })

  it('yazma kapalıyken hiçbir şeyi değiştirmez', async () => {
    for (const [name, args] of [
      ['write_file', { path: 'x.txt', content: 'x' }],
      ['move_file', { from: 'notlar.txt', to: 'y.txt' }],
      ['create_folder', { path: 'yeni' }]
    ] as const) {
      expect((await run(name, args, false)).step.status, name).toBe('error')
    }
    expect(approvals).toEqual([])
    expect((await stat(join(root, 'notlar.txt'))).isFile()).toBe(true)
  })

  it('cevap durdurulursa bekleyen onay reddedilmiş sayılır', async () => {
    const quiet = new FilesService(db, { approval: () => {}, indexProgress: () => {} }, noSemantic)
    const controller = new AbortController()
    const pending = quiet.execute('sohbet', folder, { name: 'move_file', arguments: { from: 'notlar.txt', to: 'tasindi.txt' } }, controller.signal, true)
    controller.abort()
    expect((await pending).step.status).toBe('denied')
    expect((await stat(join(root, 'notlar.txt'))).isFile()).toBe(true)
  })
})

describe('indeksleme', () => {
  it('uzun metni üst üste binen parçalara ayırır', () => {
    expect(chunkText('kısa metin')).toEqual(['kısa metin'])
    expect(chunkText('   ')).toEqual([])
    const long = Array.from({ length: 80 }, (_, i) => `Bu ${i}. cümledir ve yeterince uzundur.`).join(' ')
    const chunks = chunkText(long, 400, 60)
    expect(chunks.length).toBeGreaterThan(5)
    expect(chunks.every((c) => c.length <= 400)).toBe(true)
    expect(chunks.join(' ')).toContain('Bu 79. cümledir')
  })

  it('klasörü gezer, gizli klasörleri atlar', async () => {
    expect((await walk(root)).map((f) => f.path).sort()).toEqual(['notlar.txt', 'raporlar/ocak.md'])
    expect(await walk(root, 1)).toHaveLength(1)
  })

  it('indeksler, değişmeyeni atlar, silineni çıkarır ve belgenin içinde aratır', async () => {
    await writeFile(join(root, 'sozlesme.md'), 'Kiralama sözleşmesi 15 Haziran 2027 tarihinde yenilenecektir. Yıllık bedel 480.000 TL.')
    let indexed = await service.index(folder.id)
    expect(indexed.chunks).toBe(3)
    expect(indexed.indexedAt).not.toBeNull()
    expect((await service.index(folder.id)).chunks).toBe(3)

    const found = await run('search_files', { query: 'sözleşme yenilenecek tarih' })
    expect(found.result).toContain('Konuyla ilgili bölümler')
    expect(found.result).toContain('sozlesme.md')

    await rm(join(root, 'sozlesme.md'))
    indexed = await service.index(folder.id)
    expect(indexed.chunks).toBe(2)
    db.deleteFolder(folder.id)
    expect(db.listFileChunks(folder.id)).toEqual([])
  })
})

describe('İngilizce', () => {
  beforeEach(() => setLanguage('en'))
  afterEach(() => setLanguage('tr'))

  it('adım etiketleri ve modele dönen sonuçlar İngilizcedir', async () => {
    expect((await run('read_file', { path: 'notlar.txt' })).step.label).toBe('Read: notlar.txt')
    const list = await run('list_folder', { path: '.' })
    expect(list.step.label).toContain('2 items')
    expect(list.result).toContain('[folder] raporlar/')
    const search = await run('search_files', { query: 'zümrüt' })
    expect(search.step.label).toContain('1 result)')
    expect(search.result).toContain('notlar.txt, line 1')

    const missing = await run('read_file', { path: 'yok.txt' })
    expect(missing.step).toMatchObject({ status: 'error', label: "Couldn't read: yok.txt" })
    expect(missing.result).toContain('Error: There is no such file or folder')

    answer = false
    const denied = await run('write_file', { path: 'yeni.txt', content: 'x' })
    expect(denied.step).toMatchObject({ status: 'denied', label: 'Rejected: yeni.txt' })
    expect(denied.result).toContain('REJECTED')
    await expect(resolveInside(root, '../x')).rejects.toThrow(/outside this folder/)
  })

  it('araç tanımları ve klasör talimatı İngilizcedir; araç adları değişmez', async () => {
    const names = (defs: unknown[]): string[] => defs.map((d) => (d as { function: { name: string } }).function.name)
    const en = service.toolDefs(true)
    setLanguage('tr')
    const tr = service.toolDefs(true)
    expect(names(en)).toEqual(names(tr))
    // Silme aracı modele hiç verilmez.
    expect(names(en)).toEqual(['list_folder', 'read_file', 'search_files', 'update_plan', 'edit_file', 'write_file', 'move_file', 'create_folder', 'run_command'])
    expect(JSON.stringify(en)).toContain('Lists the files and subfolders in a folder.')
    expect(JSON.stringify(en)).not.toMatch(/[ğşıİĞŞ]/)
    expect(JSON.stringify(tr)).toContain('Bir klasördeki dosya ve alt klasörleri listeler.')

    setLanguage('en')
    const prompt = await service.promptBlock(folder, false)
    expect(prompt).toContain('You only have reading tools')
    expect(prompt).toContain('list_folder, search_files or read_file')
    expect(await service.promptBlock(folder, true)).toContain('write_file, move_file')
    expect(await service.promptBlock(folder, true)).toContain('You cannot delete files or folders')
  })
})


describe('Kod alanı araçları', () => {
  it('edit_file yalnızca tek yerde geçen parçayı değiştirir, onay ister ve geri alma kaydı tutar', async () => {
    const out = await run('edit_file', { path: 'notlar.txt', old_text: 'Teslim tarihi 3 Mart', new_text: 'Teslim tarihi 10 Mart' })
    expect(out.step.status).toBe('ok')
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({ kind: 'write', path: 'notlar.txt' })
    expect(await readFile(join(root, 'notlar.txt'), 'utf8')).toBe('Proje kod adı: Zümrüt-7\nTeslim tarihi 10 Mart\nSorumlu: Deniz Akar')
    expect(service.takeEdits('sohbet')).toEqual([
      { folderId: folder.id, path: 'notlar.txt', before: 'Proje kod adı: Zümrüt-7\nTeslim tarihi 3 Mart\nSorumlu: Deniz Akar' }
    ])
    expect(service.takeEdits('sohbet')).toEqual([])
  })

  it('edit_file bulunamayan ya da birden çok yerde geçen metni yazmaz', async () => {
    await writeFile(join(root, 'tekrar.txt'), 'a = 1\nb = 1\n')
    expect((await run('edit_file', { path: 'notlar.txt', old_text: 'olmayan metin', new_text: 'x' })).result).toContain('read_file')
    expect((await run('edit_file', { path: 'tekrar.txt', old_text: '= 1', new_text: '= 2' })).result).toContain('2')
    expect(approvals).toEqual([])
    expect(await readFile(join(root, 'tekrar.txt'), 'utf8')).toBe('a = 1\nb = 1\n')
  })

  it('edit_file Windows satır sonlu dosyada da çalışır', async () => {
    await writeFile(join(root, 'win.txt'), 'satır 1\r\nsatır 2\r\nsatır 3\r\n')
    expect((await run('edit_file', { path: 'win.txt', old_text: 'satır 1\nsatır 2', new_text: 'ilk\nikinci' })).step.status).toBe('ok')
    expect(await readFile(join(root, 'win.txt'), 'utf8')).toBe('ilk\r\nikinci\r\nsatır 3\r\n')
  })

  it('update_plan dosyaya dokunmadan planı adım olarak verir', async () => {
    const out = await run('update_plan', {
      steps: [
        { step: 'Dosyaları incele', status: 'done' },
        { step: 'Hatayı düzelt', status: 'in_progress' },
        { step: 'Testi çalıştır', status: 'garip' }
      ]
    })
    expect(out.step.plan).toEqual([
      { step: 'Dosyaları incele', status: 'done' },
      { step: 'Hatayı düzelt', status: 'in_progress' },
      { step: 'Testi çalıştır', status: 'pending' }
    ])
    expect(approvals).toEqual([])
  })

  it('"hep izin ver" sonrası aynı sohbette düzenlemeler sorulmaz; başka sohbette sorulur ve izin kaldırılabilir', async () => {
    const remembering = new FilesService(
      db,
      {
        approval: (a) => {
          approvals.push(a)
          queueMicrotask(() => remembering.respond(a.id, true, true))
        },
        indexProgress: () => {}
      },
      noSemantic
    )
    const exec = (conversation: string, name: string, args: Record<string, unknown>) =>
      remembering.execute(conversation, folder, { name, arguments: args }, new AbortController().signal, true)
    await exec('a', 'write_file', { path: 'bir.txt', content: '1' })
    await exec('a', 'write_file', { path: 'iki.txt', content: '2' })
    expect(approvals).toHaveLength(1)
    expect(remembering.trustState('a')).toEqual({ edits: true, commands: [] })
    await exec('b', 'write_file', { path: 'uc.txt', content: '3' })
    expect(approvals).toHaveLength(2)
    remembering.revokeTrust('a')
    await exec('a', 'write_file', { path: 'dort.txt', content: '4' })
    expect(approvals).toHaveLength(3)
  })

  it('ATLAS.md varsa proje talimatı olarak talimata eklenir', async () => {
    await writeFile(join(root, 'ATLAS.md'), 'Bu projede yalnızca TypeScript kullan.')
    expect(await service.promptBlock(folder, true)).toContain('Bu projede yalnızca TypeScript kullan.')
  })
})
