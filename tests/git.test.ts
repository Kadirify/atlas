import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: {}, app: { getPath: () => tmpdir() } }))

import { L, setLanguage } from '../src/main/i18n'
import { cleanCommitMessage, commitMessagePrompt, findGit, GitError, GitService, parseStatus } from '../src/main/services/git'

const gitExe = await findGit()

/** Testin kendi hazırlığı için düz git (servisin önlemleri olmadan) */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(gitExe!, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

beforeAll(() => setLanguage('tr'))

describe('parseStatus', () => {
  it('dalı, gönderilmemiş commit sayısını ve dosya durumlarını çözer', () => {
    const output = [
      '# branch.oid 1234',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -0',
      '1 .M N... 100644 100644 100644 aaaa bbbb a.txt',
      '1 D. N... 100644 000000 000000 aaaa bbbb boşluk lu.txt',
      '1 A. N... 000000 100644 100644 aaaa bbbb yeni/iç.js',
      'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc çakışan.txt',
      '? .env',
      '? notlar.txt',
      ''
    ].join('\0')
    expect(parseStatus(output)).toEqual({
      branch: 'main',
      initial: false,
      ahead: 2,
      changes: [
        { path: 'a.txt', kind: 'modified', secret: false },
        { path: 'boşluk lu.txt', kind: 'deleted', secret: false },
        { path: 'yeni/iç.js', kind: 'added', secret: false },
        { path: 'çakışan.txt', kind: 'conflict', secret: false },
        { path: '.env', kind: 'added', secret: true },
        { path: 'notlar.txt', kind: 'added', secret: false }
      ]
    })
  })

  it('hiç commit olmayan depoyu ve dalsız durumu tanır; aynı yol iki kez gelirse tek satır yapar', () => {
    expect(parseStatus('# branch.oid (initial)\0# branch.head (detached)\0')).toEqual({ branch: null, initial: true, ahead: null, changes: [] })
    expect(parseStatus('1 D. N... 100644 000000 000000 aaaa bbbb x.txt\0? x.txt\0').changes).toEqual([{ path: 'x.txt', kind: 'modified', secret: false }])
  })
})

describe('cleanCommitMessage', () => {
  it('yalnızca başlık satırını bırakır', () => {
    expect(cleanCommitMessage('"Sepet toplamı düzeltildi"\n\nBu commit şunları yapar...')).toBe('Sepet toplamı düzeltildi')
    expect(cleanCommitMessage('```\n- Commit mesajı: `fix: toplam yuvarlanıyor`\n```')).toBe('fix: toplam yuvarlanıyor')
    expect(cleanCommitMessage('\n\n')).toBe('')
    expect(cleanCommitMessage('x'.repeat(300))).toHaveLength(100)
  })
})

describe.skipIf(!gitExe)('GitService', () => {
  let base: string
  let root: string
  let trashed: string[]
  let service: GitService
  const t = () => L().tools.git

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'atlas-git-')))
    root = join(base, 'depo')
    await mkdir(join(root, 'src'), { recursive: true })
    git(root, 'init', '-q', '-b', 'main')
    git(root, 'config', 'user.name', 'Deneme')
    git(root, 'config', 'user.email', 'deneme@example.com')
    git(root, 'config', 'core.autocrlf', 'false')
    git(root, 'config', 'commit.gpgsign', 'false')
    await writeFile(join(root, 'a.txt'), 'bir\niki\n')
    await writeFile(join(root, 'sil.txt'), 'silinecek\n')
    await writeFile(join(root, 'src', 'k.js'), 'const k = 1\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'ilk')
    trashed = []
    service = new GitService(async (full) => {
      trashed.push(full)
      await rm(full, { recursive: true })
    })
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  const changes = async (): Promise<string[]> => ((await service.status(root))?.changes ?? []).map((c) => `${c.kind} ${c.path}`).sort()

  it('depo olmayan klasörde ve deponun alt klasöründe null döner', async () => {
    expect(await service.status(base)).toBeNull()
    expect(await service.status(join(root, 'src'))).toBeNull()
  })

  it('değişen, silinen, yeni ve gizli dosyaları listeler', async () => {
    await writeFile(join(root, 'a.txt'), 'bir\nüç\n')
    await rm(join(root, 'sil.txt'))
    await mkdir(join(root, 'yeni', 'alt'), { recursive: true })
    await writeFile(join(root, 'yeni', 'alt', 'q.txt'), 'q\n')
    await writeFile(join(root, '.env'), 'PAROLA=cokgizli\n')
    const status = await service.status(root)
    expect(status).toMatchObject({ branch: 'main', initial: false, ahead: null, more: 0, hooks: [], busy: false, blocked: [] })
    expect([...status!.changes].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: '.env', kind: 'added', secret: true },
      { path: 'a.txt', kind: 'modified', secret: false },
      { path: 'sil.txt', kind: 'deleted', secret: false },
      { path: 'yeni/alt/q.txt', kind: 'added', secret: false }
    ])
  })

  it('hiç commit olmayan depoda dosyaları yeni olarak gösterir', async () => {
    const fresh = join(base, 'bos')
    await mkdir(fresh)
    git(fresh, 'init', '-q', '-b', 'main')
    await writeFile(join(fresh, 'x.txt'), 'x\n')
    expect(await service.status(fresh)).toMatchObject({ branch: 'main', initial: true, changes: [{ path: 'x.txt', kind: 'added', secret: false }] })
    expect(await service.diff(fresh, 'x.txt')).toEqual({ path: 'x.txt', before: null, after: 'x\n', note: '' })
  })

  it('ortamdaki GIT_DIR başka yeri gösterse de bağlı klasörün deposuna bakar', async () => {
    process.env.GIT_DIR = join(base, 'yok')
    try {
      await writeFile(join(root, 'a.txt'), 'değişti\n')
      expect(await changes()).toEqual(['modified a.txt'])
    } finally {
      delete process.env.GIT_DIR
    }
  })

  it('yerel ayarı program çalıştıran depoda git çalıştırmaz', async () => {
    const marker = join(base, 'CALISTI')
    await writeFile(join(root, '.gitattributes'), '*.txt filter=tuzak\n')
    git(root, 'config', 'filter.tuzak.clean', 'touch ../CALISTI; cat')
    // Boyu aynı, içeriği ve tarihi farklı: git değişip değişmediğini anlamak için dosyayı süzgeçten geçirmek zorunda.
    await writeFile(join(root, 'a.txt'), 'bir\nuc!\n')
    const later = new Date(Date.now() + 60_000)
    await utimes(join(root, 'a.txt'), later, later)

    const status = await service.status(root)
    expect(status?.blocked).toEqual(['filter.tuzak.clean'])
    expect(status?.changes).toEqual([])
    await expect(service.commit(root, ['a.txt'], 'deneme')).rejects.toThrow(/filter\.tuzak\.clean/)
    await expect(service.diff(root, 'a.txt')).rejects.toThrow(GitError)
    await expect(service.discard(root, 'a.txt')).rejects.toThrow(GitError)
    await expect(service.createBranch(root, 'yeni')).rejects.toThrow(GitError)
    await expect(service.commitContext(root, ['a.txt'])).rejects.toThrow(GitError)
    expect(await exists(marker)).toBe(false)

    // Karşılaştırma: aynı depoda düz "git status" süzgeci çalıştırır. Yukarıdaki önlem bu yüzden var.
    git(root, 'status', '--porcelain')
    expect(await exists(marker)).toBe(true)
  })

  it('çalışma ağacını başka klasöre yönlendiren depoyu depo saymaz', async () => {
    const other = join(base, 'baska')
    await mkdir(other)
    git(root, 'config', 'core.worktree', other.replace(/\\/g, '/'))
    expect(await service.status(root)).toBeNull()
    await expect(service.commit(root, ['a.txt'], 'deneme')).rejects.toThrow(t().notARepo)
  })

  it('farkı satır sonu farkını saymadan verir; gizli ve metin olmayan dosyanın içeriğini vermez', async () => {
    await writeFile(join(root, 'a.txt'), 'bir\r\nüç\r\n')
    expect(await service.diff(root, 'a.txt')).toEqual({ path: 'a.txt', before: 'bir\niki\n', after: 'bir\nüç\n', note: '' })
    expect(await service.diff(root, 'src\\k.js')).toEqual({ path: 'src/k.js', before: 'const k = 1\n', after: 'const k = 1\n', note: '' })

    await rm(join(root, 'sil.txt'))
    expect(await service.diff(root, 'sil.txt')).toEqual({ path: 'sil.txt', before: 'silinecek\n', after: null, note: '' })

    await writeFile(join(root, '.env'), 'PAROLA=cokgizli\n')
    const secret = await service.diff(root, '.env')
    expect(secret).toMatchObject({ before: null, after: null })
    expect(secret.note).toBe(L().tools.code.secretFile)

    await writeFile(join(root, 'resim.bin'), Buffer.from([0, 1, 2, 0, 0, 3, 0, 0]))
    expect((await service.diff(root, 'resim.bin')).note).toBe(L().tools.code.binaryFile)

    await writeFile(join(root, 'buyuk.txt'), 'x'.repeat(500 * 1024))
    expect((await service.diff(root, 'buyuk.txt')).note).toBe(t().tooLarge)

    await expect(service.diff(root, '../disari.txt')).rejects.toThrow()
  })

  it('yalnızca seçilen dosyaları commit eder; mesajı olduğu gibi yazar', async () => {
    await writeFile(join(root, 'a.txt'), 'bir\nüç\n')
    await rm(join(root, 'sil.txt'))
    await writeFile(join(root, 'yeni.txt'), 'yeni\n')
    await writeFile(join(root, 'src', 'k.js'), 'const k = 2\n')
    await service.commit(root, ['a.txt', 'sil.txt', 'yeni.txt'], '  Üç dosya güncellendi\r\n\r\n#42 ile ilgili\n')

    expect(git(root, 'log', '-1', '--format=%B').trim()).toBe('Üç dosya güncellendi\n\n#42 ile ilgili')
    expect(git(root, 'show', '--name-status', '--format=', 'HEAD').trim().split('\n').sort()).toEqual(['A\tyeni.txt', 'D\tsil.txt', 'M\ta.txt'])
    expect(await changes()).toEqual(['modified src/k.js'])
  })

  it('dosya adındaki köşeli parantezi kalıp saymaz', async () => {
    await writeFile(join(root, '[a].txt'), 'köşeli\n')
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await service.commit(root, ['[a].txt'], 'Köşeli parantezli dosya')
    expect(git(root, 'show', '--name-status', '--format=', 'HEAD').trim()).toBe('A\t[a].txt')
    expect(await changes()).toEqual(['modified a.txt'])
  })

  it('boş mesajı, seçilmemiş ve listede olmayan dosyayı reddeder', async () => {
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await expect(service.commit(root, ['a.txt'], '  \n ')).rejects.toThrow(t().noMessage)
    await expect(service.commit(root, [], 'mesaj')).rejects.toThrow(t().noPaths)
    await expect(service.commit(root, ['src/k.js'], 'mesaj')).rejects.toThrow(t().unknownPath('src/k.js'))
    await expect(service.commit(root, ['../disari.txt'], 'mesaj')).rejects.toThrow(GitError)
    await expect(service.commit(root, ['a.txt'], 'x'.repeat(6000))).rejects.toThrow(t().messageTooLong)
    expect(git(root, 'log', '--format=%s').trim()).toBe('ilk')
  })

  it('git kimliği ayarlı değilse ne yapılacağını söyler', async () => {
    git(root, 'config', 'user.name', '')
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await expect(service.commit(root, ['a.txt'], 'mesaj')).rejects.toThrow(t().noIdentity)
  })

  it('depodaki betikleri (hook) bildirir; betik commit\'i durdurursa çıktısını gösterir', async () => {
    await writeFile(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "biçim denetimi geçmedi" >&2\nexit 1\n', { mode: 0o755 })
    expect((await service.status(root))?.hooks).toEqual(['pre-commit'])
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await expect(service.commit(root, ['a.txt'], 'mesaj')).rejects.toThrow(/biçim denetimi geçmedi/)
    expect(git(root, 'log', '--format=%s').trim()).toBe('ilk')

    await writeFile(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    await service.commit(root, ['a.txt'], 'Betikten geçti')
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('Betikten geçti')
  })

  it('husky düzeninde yalnızca gerçekten var olan betikleri sayar', async () => {
    await mkdir(join(root, '.husky', '_'), { recursive: true })
    for (const name of ['pre-commit', 'commit-msg', 'post-checkout']) await writeFile(join(root, '.husky', '_', name), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    await writeFile(join(root, '.husky', 'pre-commit'), 'npm test\n', { mode: 0o755 })
    git(root, 'config', 'core.hooksPath', '.husky/_')
    expect((await service.status(root))?.hooks).toEqual(['pre-commit'])
  })

  it('yarım kalmış birleştirmede ve dalsız durumda commit yaptırmaz', async () => {
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await writeFile(join(root, '.git', 'MERGE_HEAD'), `${git(root, 'rev-parse', 'HEAD').trim()}\n`)
    expect((await service.status(root))?.busy).toBe(true)
    await expect(service.commit(root, ['a.txt'], 'mesaj')).rejects.toThrow(t().busy)
    await expect(service.discard(root, 'a.txt')).rejects.toThrow(t().busy)
    await rm(join(root, '.git', 'MERGE_HEAD'))

    git(root, 'checkout', '-q', '--detach')
    expect((await service.status(root))?.branch).toBeNull()
    await expect(service.commit(root, ['a.txt'], 'mesaj')).rejects.toThrow(t().detached)
    await service.createBranch(root, 'kurtarma')
    await service.commit(root, ['a.txt'], 'Dal açıldıktan sonra')
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('Dal açıldıktan sonra')
  })

  it('yeni dal açar ve ona geçer; değişiklikler yerinde kalır', async () => {
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await service.createBranch(root, ' ozellik/yeni-şey ')
    expect(git(root, 'branch', '--show-current').trim()).toBe('ozellik/yeni-şey')
    expect((await service.status(root))?.branch).toBe('ozellik/yeni-şey')
    expect(await changes()).toEqual(['modified a.txt'])

    for (const bad of ['', 'kötü ad', '-x', 'a..b', 'x.lock', 'a~1', '@{-1}', 'a:b']) {
      await expect(service.createBranch(root, bad), bad).rejects.toThrow(t().badBranchName)
    }
    await expect(service.createBranch(root, 'main')).rejects.toThrow(t().branchExists('main'))
  })

  it('hiç commit olmayan depoda da dal açar', async () => {
    const fresh = join(base, 'bos')
    await mkdir(fresh)
    git(fresh, 'init', '-q', '-b', 'main')
    await service.createBranch(fresh, 'gelistirme')
    expect((await service.status(fresh))?.branch).toBe('gelistirme')
  })

  it('değişikliği geri çevirir: şimdiki hal çöp kutusuna gider, son commit\'teki hal geri gelir', async () => {
    await writeFile(join(root, 'a.txt'), 'değişti\n')
    await service.discard(root, 'a.txt')
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('bir\niki\n')
    expect(trashed).toEqual([join(root, 'a.txt')])

    // Yeni dosya: son commit'te yok, yalnızca çöp kutusuna gider.
    await writeFile(join(root, 'yeni.txt'), 'yeni\n')
    await service.discard(root, 'yeni.txt')
    expect(await exists(join(root, 'yeni.txt'))).toBe(false)
    expect(trashed).toEqual([join(root, 'a.txt'), join(root, 'yeni.txt')])

    // Silinen dosya geri gelir; çöp kutusuna gidecek bir şey yoktur.
    await rm(join(root, 'sil.txt'))
    await service.discard(root, 'sil.txt')
    expect(await readFile(join(root, 'sil.txt'), 'utf8')).toBe('silinecek\n')
    expect(trashed).toHaveLength(2)

    // Hazırlık alanına eklenmiş yeni dosya da tamamen geri çevrilir.
    await writeFile(join(root, 'eklendi.txt'), 'e\n')
    git(root, 'add', 'eklendi.txt')
    await service.discard(root, 'eklendi.txt')
    expect(await changes()).toEqual([])
    await expect(service.discard(root, 'a.txt')).rejects.toThrow(t().unknownPath('a.txt'))
  })

  it('mesaj önerisi için farkı verir; gizli dosyanın içeriğini vermez', async () => {
    await writeFile(join(root, 'a.txt'), 'bir\nüç\n')
    await writeFile(join(root, '.env'), 'PAROLA=cokgizli\n')
    await writeFile(join(root, 'yeni.js'), "console.log('merhaba')\n")
    const context = await service.commitContext(root, ['a.txt', '.env', 'yeni.js'])
    expect(context.recent).toEqual(['ilk'])
    expect(context.files).toEqual([
      { path: 'a.txt', kind: 'modified' },
      { path: '.env', kind: 'added' },
      { path: 'yeni.js', kind: 'added' }
    ])
    expect(context.patch).toContain('-iki')
    expect(context.patch).toContain('+üç')
    expect(context.patch).toContain("+console.log('merhaba')")
    expect(context.patch).not.toContain('cokgizli')

    const prompt = commitMessagePrompt(context)
    expect(prompt.user).toContain('- ilk')
    expect(prompt.user).toContain('- değişti: a.txt')
    expect(prompt.user).toContain('- yeni: .env')
    expect(prompt.user).not.toContain('cokgizli')
    expect(commitMessagePrompt({ recent: [], files: context.files, patch: '' }).user).toContain(L().prompts.git.language)
  })
})
