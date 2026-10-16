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
import { SnapshotStore } from '../src/main/services/snapshot'
import { isSecretFile } from '../src/main/services/code'
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
    // Metin dosyaları satır numaralı ve satır satır sayfalanır.
    await writeFile(join(root, 'uzun.txt'), `${Array.from({ length: 999 }, (_, i) => `satır ${i + 1}`).join('\n')}\nSON\n`)
    const first = await run('read_file', { path: 'uzun.txt' })
    expect(first.result).toContain('1| satır 1')
    expect(first.result).toMatch(/line: 401/)
    expect(first.result).not.toContain('SON')
    const second = await run('read_file', { path: 'uzun.txt', line: 900 })
    expect(second.result).toContain('900| satır 900')
    expect(second.result).toContain('1000| SON')
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
  it('klasör kısa (8.3) adıyla eklenmiş olsa da göreli yollar doğru', async () => {
    if (process.platform !== 'win32') return
    const long = join(root, 'uzun-adli-proje-klasoru')
    await mkdir(long)
    await writeFile(join(long, 'not.txt'), 'merhaba')
    // Windows'un verdiği kısa ad (GitHub'ın Windows makinelerinde geçici klasör RUNNER~1 gibi kısa adla gelir).
    const { execSync } = await import('node:child_process')
    const short = execSync(`cmd /c for %I in ("${long}") do @echo %~sI`, { encoding: 'utf8' }).trim()
    if (!short || short.toLowerCase() === long.toLowerCase()) return // bu diskte kısa ad üretilmiyor
    const shortFolder = db.addFolder(short)
    const out = await service.execute('sohbet', shortFolder, { name: 'write_file', arguments: { path: 'alt/yeni.md', content: 'x' } }, new AbortController().signal, true)
    expect(out.step.label).toContain('alt/yeni.md')
    expect(out.step.label).not.toContain('..')
    expect((await service.execute('sohbet', shortFolder, { name: 'read_file', arguments: { path: 'not.txt' } }, new AbortController().signal, true)).step.label).toContain('not.txt')
  })

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
      {
        folderId: folder.id,
        path: 'notlar.txt',
        before: 'Proje kod adı: Zümrüt-7\nTeslim tarihi 3 Mart\nSorumlu: Deniz Akar',
        afterHash: expect.any(String)
      }
    ])
    expect(service.takeEdits('sohbet')).toEqual([])
  })

  it('düzenlemenin sonucunu ve yanlışlıkla tekrarlanan satırı modele gösterir', async () => {
    await writeFile(join(root, 'app.js'), "import a from 'a'\nconsole.log(a)\n")
    const out = await run('edit_file', { path: 'app.js', old_text: "import a from 'a'", new_text: "import a from 'a'\nimport a from 'a'" })
    expect(out.result).toContain("2: import a from 'a'")
    expect(out.result).toMatch(/iki kez|twice/)
  })

  it('UTF-8 olmayan dosyayı (Windows-1254 CSV) bozmaz', async () => {
    // "TOPLAM;100\nüş" Windows-1254 ile: ü = FC, ş = FE
    const bytes = Buffer.from([0x54, 0x4f, 0x50, 0x4c, 0x41, 0x4d, 0x3b, 0x31, 0x30, 0x30, 0x0a, 0xfc, 0xfe])
    await writeFile(join(root, 'rapor.csv'), bytes)
    const out = await run('edit_file', { path: 'rapor.csv', old_text: 'TOPLAM;100', new_text: 'TOPLAM;200' })
    expect(out.result).toContain('UTF-8')
    expect(await readFile(join(root, 'rapor.csv'))).toEqual(bytes)
    expect((await run('write_file', { path: 'rapor.csv', content: 'yeni' })).result).toContain('UTF-8')
    expect(approvals).toEqual([])
  })

  it('onay beklenirken kullanıcının değiştirdiği dosyanın üstüne yazmaz', async () => {
    const racing = new FilesService(
      db,
      {
        approval: (a) => void writeFile(join(root, 'notlar.txt'), 'kullanıcı değiştirdi').then(() => racing.respond(a.id, true)),
        indexProgress: () => {}
      },
      noSemantic
    )
    const call = { name: 'edit_file', arguments: { path: 'notlar.txt', old_text: 'Teslim tarihi 3 Mart', new_text: 'Teslim tarihi 10 Mart' } }
    const out = await racing.execute('sohbet', folder, call, new AbortController().signal, true)
    expect(out.step.status).toBe('error')
    expect(await readFile(join(root, 'notlar.txt'), 'utf8')).toBe('kullanıcı değiştirdi')
    expect(racing.takeEdits('sohbet')).toEqual([])
  })

  it('durdurulmuş cevapta izin verilmiş işlemler de yapılmaz', async () => {
    const controller = new AbortController()
    controller.abort()
    const out = await service.execute('sohbet', folder, { name: 'write_file', arguments: { path: 'x.txt', content: 'x' } }, controller.signal, true)
    expect(out.step.status).toBe('denied')
    await expect(stat(join(root, 'x.txt'))).rejects.toThrow()
  })

  it('korunan dosyalar "hep izin ver" olsa da her seferinde sorulur', async () => {
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
    const exec = (name: string, args: Record<string, unknown>) =>
      remembering.execute('sohbet', folder, { name, arguments: args }, new AbortController().signal, true)
    await exec('write_file', { path: 'a.txt', content: '1' })
    await exec('write_file', { path: 'b.txt', content: '2' })
    expect(approvals).toHaveLength(1)
    await exec('write_file', { path: 'package.json', content: '{}' })
    await exec('write_file', { path: 'derle.bat', content: 'echo derle' })
    await exec('write_file', { path: '.git/config', content: '[core]' })
    await exec('write_file', { path: 'package.json', content: '{"a":1}' })
    expect(approvals).toHaveLength(5)
    expect(approvals.slice(1).every((a) => a.protected)).toBe(true)
  })

  it('.env gibi gizli dosyaları modele okutmaz; Windows yol hilelerini reddeder', async () => {
    await writeFile(join(root, '.env'), 'DB_PASS=cokgizli')
    for (const path of ['.env', '.env.', 'notlar.txt:akis', 'raporlar/CON']) {
      const out = await run('read_file', { path })
      expect(out.step.status).toBe('error')
      expect(out.result).not.toContain('cokgizli')
    }
    expect((await run('search_files', { query: 'DB_PASS' })).result).not.toContain('cokgizli')
  })

  it('taşıma geri alınabilir, çalıştırılabilir türe yeniden adlandırılamaz', async () => {
    await run('edit_file', { path: 'notlar.txt', old_text: '3 Mart', new_text: '4 Mart' })
    expect((await run('move_file', { from: 'notlar.txt', to: 'baglan.rdp' })).step.status).toBe('error')
    expect((await run('move_file', { from: 'notlar.txt', to: 'arsiv/notlar.txt' })).step.status).toBe('ok')
    expect(service.takeEdits('sohbet').map((e) => [e.path, e.movedFrom ?? null])).toEqual([
      ['notlar.txt', null],
      ['arsiv/notlar.txt', 'notlar.txt']
    ])
  })

  it('hedefi olmayan bağlantı üzerinden klasör dışına yazdırmaz', async () => {
    try {
      await symlink(join(outside, 'yok'), join(root, 'kisayol'), 'junction')
    } catch {
      return // bu sistemde bağlantı oluşturulamıyor
    }
    await expect(resolveInside(root, 'kisayol/yeni.txt')).rejects.toThrow()
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

describe('komutlar için güvenli kip', () => {
  let store: string
  beforeEach(async () => {
    store = await mkdtemp(join(tmpdir(), 'atlas-depo-'))
  })
  afterEach(async () => {
    await rm(store, { recursive: true, force: true })
  })

  const safeService = (remember = false): FilesService => {
    const s: FilesService = new FilesService(
      db,
      {
        approval: (a) => {
          approvals.push(a)
          queueMicrotask(() => s.respond(a.id, answer, remember))
        },
        indexProgress: () => {}
      },
      noSemantic,
      new SnapshotStore(store, isSecretFile)
    )
    return s
  }

  it('komutun çalıştırdığı kod dosya silip bozsa da Geri al hepsini geri getirir', async () => {
    const safe = safeService()
    // Atlas'ın değiştirdiği bir "test" dosyası: içinde silme kodu var; komut süzgeci bunu göremez.
    await writeFile(
      join(root, 'temizle.js'),
      "const fs = require('fs')\nfs.rmSync('raporlar/ocak.md')\nfs.writeFileSync('notlar.txt', 'bozuldu')\nfs.writeFileSync('cikti.log', 'yeni dosya')\n"
    )
    const out = await safe.execute('sohbet', folder, { name: 'run_command', arguments: { command: 'node temizle.js' } }, new AbortController().signal, true)
    expect(out.step.status).toBe('ok')
    expect(out.step.terminal?.effects).toEqual({ changed: ['notlar.txt'], deleted: ['raporlar/ocak.md'], created: ['cikti.log'], lost: [], partial: false })
    // Model de bilir: beklemediği bir silme olduysa kullanıcıya söylesin.
    expect(out.result).toContain('raporlar/ocak.md')
    expect(out.result).toContain('Geri al')

    const { restored, left } = await safe.undo(safe.takeEdits('sohbet'), (full) => rm(full))
    expect(restored).toBe(3)
    expect(left).toEqual([])
    expect(await readFile(join(root, 'raporlar', 'ocak.md'), 'utf8')).toContain('Ocak raporu')
    expect(await readFile(join(root, 'notlar.txt'), 'utf8')).toContain('Zümrüt-7')
    expect(await stat(join(root, 'cikti.log')).catch(() => null)).toBeNull()
  })

  it('komuttan sonra kullanıcının değiştirdiği dosya geri alırken ezilmez', async () => {
    const safe = safeService()
    await writeFile(join(root, 'boz.js'), "require('fs').writeFileSync('notlar.txt', 'komut yazdı')\n")
    await safe.execute('sohbet', folder, { name: 'run_command', arguments: { command: 'node boz.js' } }, new AbortController().signal, true)
    await writeFile(join(root, 'notlar.txt'), 'kullanıcı yazdı')
    await safe.undo(safe.takeEdits('sohbet'), (full) => rm(full))
    expect(await readFile(join(root, 'notlar.txt'), 'utf8')).toBe('kullanıcı yazdı')
  })

  it('"hep izin ver" denmiş komut, Atlas sorulmadan dosya değiştirdiyse yeniden sorulur', async () => {
    const safe = safeService(true)
    const exec = (name: string, args: Record<string, unknown>) =>
      safe.execute('sohbet', folder, { name, arguments: args }, new AbortController().signal, true)
    await exec('run_command', { command: 'echo merhaba' })
    await exec('run_command', { command: 'echo merhaba' })
    expect(approvals.map((a) => a.kind)).toEqual(['command'])
    // İlk düzenleme sorulur (kullanıcı görür), "hep izin ver" denir; ikincisi sorulmadan yapılır.
    await exec('write_file', { path: 'bir.txt', content: '1' })
    await exec('write_file', { path: 'iki.txt', content: '2' })
    expect(approvals.map((a) => a.kind)).toEqual(['command', 'write'])
    await exec('run_command', { command: 'echo merhaba' })
    expect(approvals.map((a) => a.kind)).toEqual(['command', 'write', 'command'])
    expect(approvals[2].recheck).toBe(true)
    // Yeniden onaylandıktan sonra, arada sorulmadan düzenleme yoksa sorulmaz.
    await exec('run_command', { command: 'echo merhaba' })
    expect(approvals).toHaveLength(3)
  })
})

describe('gizli dosyalar komutla da okunmaz', () => {
  it('.env adı geçen komut çalıştırılmaz, onaya bile sunulmaz', async () => {
    await writeFile(join(root, '.env'), 'DB_PASS=cokgizli')
    for (const command of ['type .env', 'findstr PASS .env', 'node -e "console.log(require(\'fs\').readFileSync(\'.env\', \'utf8\'))"', 'more < keys/id_rsa']) {
      const out = await run('run_command', { command })
      expect(out.step.status, command).toBe('denied')
      expect(out.result).not.toContain('cokgizli')
    }
    expect(approvals).toEqual([])
  })
})

describe('esnek düzenleme', () => {
  it('satır numaralı ve girintisiz kopyalanan metinle de doğru düzenler', async () => {
    await writeFile(join(root, 'kod.js'), 'function f() {\n  if (a) {\n    return 1\n  }\n}\n')
    const out = await run('edit_file', { path: 'kod.js', old_text: '2| if (a) {\n3| return 1\n4| }', new_text: '2| if (a) {\n3| return 2\n4| }' })
    expect(out.step.status).toBe('ok')
    expect(await readFile(join(root, 'kod.js'), 'utf8')).toBe('function f() {\n  if (a) {\n    return 2\n  }\n}\n')
  })

  it('Python: girintisiz yazılan çok satırlı düzeltme girintiyi bozmaz', async () => {
    await writeFile(join(root, 'hesap.py'), 'def ortalama(sayilar):\n    return sum(sayilar) / len(sayilar)\n')
    const out = await run('edit_file', {
      path: 'hesap.py',
      old_text: 'return sum(sayilar) / len(sayilar)',
      new_text: 'if not sayilar:\n    return 0\nreturn sum(sayilar) / len(sayilar)'
    })
    expect(out.step.status).toBe('ok')
    expect(await readFile(join(root, 'hesap.py'), 'utf8')).toBe(
      'def ortalama(sayilar):\n    if not sayilar:\n        return 0\n    return sum(sayilar) / len(sayilar)\n'
    )
  })
})

describe('düzenleme dosyayı bozarsa', () => {
  it('model JSON dosyasının bozulduğunu sonuçta görür', async () => {
    await writeFile(join(root, 'ayar.json'), '{\n  "a": 1,\n  "b": 2\n}\n')
    const out = await run('edit_file', { path: 'ayar.json', old_text: '"b": 2', new_text: '"b": 2,' })
    expect(out.step.status).toBe('ok')
    expect(out.result).toMatch(/geçerli değil|no longer valid/)
    const fine = await run('edit_file', { path: 'ayar.json', old_text: '"b": 2,', new_text: '"b": 3' })
    expect(fine.result).not.toMatch(/geçerli değil|no longer valid/)
  })
})

describe('dosyayı kısaltan üstüne yazma', () => {
  it('yer tutucuyla kısaltılmış içerik yazılmaz, onaya bile sunulmaz', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `const S${i} = ${i}`).join('\n')
    await writeFile(join(root, 'sabit.js'), long)
    const out = await run('write_file', { path: 'sabit.js', content: 'const S0 = 0\n// ... diğer sabitler\nconst KDV = 0.2' })
    expect(out.step.status).toBe('error')
    expect(await readFile(join(root, 'sabit.js'), 'utf8')).toBe(long)
    expect(approvals).toEqual([])
  })
})
