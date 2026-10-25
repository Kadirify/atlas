import { spawn } from 'node:child_process'
import { access, constants, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import type { GitChange, GitChangeKind, GitFileDiff, GitStatus } from '@shared/types'
import { L } from '../i18n'
import { decodeText } from './attachments'
import { isSecretFile } from './code'
import { resolveInside } from './files'

/**
 * Kod alanında git: değişen dosyalar, fark, commit, dal açma ve değişikliği geri çevirme.
 *
 * Git burada kullanıcının tıklamasıyla ya da (durum ve fark için) kendiliğinden çalışır; model bu servisi kullanmaz.
 * Git, deponun kendi ayarlarında yazan programları çalıştırabildiği için (süzgeçler, imza programı) iki önlem alınır:
 * - Durum ve fark komutları program çalıştıran özellikler kapatılarak çağrılır (fsmonitor, dış fark, metne çevirme).
 * - Deponun yerel ayarlarında kapatılamayan türden bir program tanımlıysa git bu depoda hiç çalıştırılmaz (blocked).
 * Push ve başka hiçbir ağ işlemi yoktur.
 */

const WINDOWS = process.platform === 'win32'
const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
const GIT_TIMEOUT_MS = 20_000
/** Commit ve dal açma depodaki betikleri (hook) ve imzalamayı çalıştırabilir; bunlar uzun sürebilir. */
const SLOW_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
/** Arayüze en çok bu kadar değişiklik gönderilir */
const MAX_CHANGES = 300
/** Fark görünümünde bir dosyanın en büyük boyutu */
const MAX_DIFF_BYTES = 400 * 1024
const MAX_MESSAGE_CHARS = 5000
/** Mesaj önerisi için modele verilen fark metninin sınırı ve içeriği okunan dosya sayıları */
const PATCH_CHARS = 6000
const PATCH_FILES = 30
const NEW_FILES = 5
const NEW_FILE_CHARS = 900

/** Program çalıştıran ya da çıktıyı bozan özellikler her çağrıda kapatılır. */
const GLOBAL_ARGS = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false']
/** Fark alırken depodaki dış fark programları ve metne çevirme süzgeçleri çalıştırılmaz. */
const SAFE_DIFF = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames']

/**
 * Deponun yerel ayarında (ya da çalışma ağacı ayarında) bulunursa git'in bizim çağırdığımız komutlarda çalıştıracağı
 * ve komut satırından kapatılamayan programlar; core.worktree ise git'i başka bir klasörde çalıştırır.
 */
const RISKY_KEY = /^(?:core\.worktree|diff\.external|gpg\.program|gpg\..+\.program|filter\..+\.(?:clean|smudge|process))$/i

/** Bizim işlemlerimizin tetikleyebileceği depo betikleri */
const HOOK_NAMES = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'post-checkout', 'post-index-change', 'reference-transaction']

/** Ortamdan devralınırsa git'i başka bir depoya ya da ayara yönlendirebilecek değişkenler */
const INHERITED_GIT_ENV = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|CONFIG|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|CONFIG_PARAMETERS|EXTERNAL_DIFF|TRACE\w*)$/i

export class GitError extends Error {}

let gitPath: string | null = null

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false
  )
}

/**
 * git programının tam yolu; kurulu değilse null. Ad yerine tam yol kullanılır: proje klasöründeki bir "git.exe"
 * PATH'tekinin yerine çalışmasın diye PATH'teki göreli klasörlere de bakılmaz.
 */
export async function findGit(): Promise<string | null> {
  if (gitPath && (await isFile(gitPath))) return gitPath
  const dirs = (process.env.PATH ?? '')
    .split(delimiter)
    .map((dir) => dir.trim().replace(/^"|"$/g, ''))
    .filter((dir) => dir && isAbsolute(dir))
  if (WINDOWS) {
    const local = process.env.LOCALAPPDATA
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], local && join(local, 'Programs')]) {
      if (base) dirs.push(join(base, 'Git', 'cmd'))
    }
  }
  for (const dir of dirs) {
    const full = join(dir, WINDOWS ? 'git.exe' : 'git')
    if (await isFile(full)) return (gitPath = full)
  }
  return (gitPath = null)
}

interface RunOptions {
  input?: string
  timeoutMs?: number
  maxBytes?: number
}

interface RunResult {
  code: number | null
  out: Buffer
  err: string
  /** Çıktı sınırı aştığı için kesildi */
  truncated: boolean
  timedOut: boolean
}

function gitEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) if (!INHERITED_GIT_ENV.test(key)) env[key] = value
  return {
    ...env,
    // Depo aranırken bağlı klasörün üstüne çıkılmaz: üst klasördeki bir depo bu klasörün deposu sayılmaz.
    GIT_CEILING_DIRECTORIES: dirname(root),
    // Dosya adlarındaki * ve [ gibi işaretler kalıp sayılmaz.
    GIT_LITERAL_PATHSPECS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_EDITOR: ':',
    GIT_PAGER: 'cat',
    GCM_INTERACTIVE: 'never',
    // Hata iletileri tanınabilsin diye İngilizce istenir.
    LC_ALL: 'C',
    LANG: 'C',
    NoDefaultCurrentDirectoryInExePath: '1'
  }
}

function exec(git: string, root: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn(git, [...GLOBAL_ARGS, ...args], { cwd: root, env: gitEnv(root), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const max = options.maxBytes ?? MAX_OUTPUT_BYTES
    const out: Buffer[] = []
    let bytes = 0
    let err = ''
    let truncated = false
    let timedOut = false
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done({ code, out: Buffer.concat(out), err, truncated, timedOut })
    }
    const kill = (): void => {
      // Windows'ta git'in başlattığı alt süreçler (betikler) de sonlansın diye süreç ağacı kapatılır.
      if (WINDOWS && child.pid) spawn(join(SYSTEM32, 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).on('error', () => {})
      else child.kill('SIGKILL')
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, options.timeoutMs ?? GIT_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return
      const room = max - bytes
      if (chunk.length > room) {
        out.push(chunk.subarray(0, room))
        bytes = max
        truncated = true
        kill()
      } else {
        out.push(chunk)
        bytes += chunk.length
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (err.length < 16_000) err += chunk.toString('utf8')
    })
    child.on('error', (e) => {
      err += e.message
      finish(null)
    })
    child.on('close', (code) => finish(code))
    // Süreç girdiyi okumadan kapanırsa yazma hatası önemsizdir.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}

/** Hata iletisinin kullanıcıya gösterilecek kısa hali */
function detail(result: RunResult): string {
  const text = `${result.err}\n${result.out.toString('utf8')}`.trim()
  return text.length > 600 ? `…${text.slice(-600)}` : text
}

function samePath(a: string, b: string): boolean {
  return WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b
}

function isBinary(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 4096)
  let zeros = 0
  for (const b of head) if (b === 0) zeros++
  return zeros > head.length * 0.01
}

/** Karşılaştırmada satır sonu farkı (CRLF / LF) değişiklik sayılmasın */
function text(bytes: Buffer): string {
  return decodeText(bytes).replace(/\r\n/g, '\n')
}

interface ParsedStatus {
  branch: string | null
  initial: boolean
  ahead: number | null
  changes: GitChange[]
}

/** "git status --porcelain=v2 --branch -z --no-renames" çıktısını çözer. */
export function parseStatus(output: string): ParsedStatus {
  const parsed: ParsedStatus = { branch: null, initial: false, ahead: null, changes: [] }
  const byPath = new Map<string, GitChange>()
  const add = (path: string, kind: GitChangeKind): void => {
    const known = byPath.get(path)
    // Aynı yol hem "dizinden silindi" hem "izlenmeyen dosya" olarak gelebilir: son commit'e göre değişmiş sayılır.
    if (known) {
      if (known.kind !== kind && known.kind !== 'conflict') known.kind = kind === 'conflict' ? 'conflict' : 'modified'
      return
    }
    const change: GitChange = { path, kind, secret: isSecretFile(path) }
    byPath.set(path, change)
    parsed.changes.push(change)
  }
  for (const entry of output.split('\0')) {
    if (!entry) continue
    if (entry.startsWith('# branch.oid ')) parsed.initial = entry.slice(13) === '(initial)'
    else if (entry.startsWith('# branch.head ')) parsed.branch = entry.slice(14) === '(detached)' ? null : entry.slice(14)
    else if (entry.startsWith('# branch.ab ')) parsed.ahead = Number(/\+(\d+)/.exec(entry)?.[1] ?? 0)
    else if (entry.startsWith('? ')) add(entry.slice(2), 'added')
    else if (entry.startsWith('u ')) add(entry.split(' ').slice(10).join(' '), 'conflict')
    else if (entry.startsWith('1 ')) {
      const xy = entry.slice(2, 4)
      const path = entry.split(' ').slice(8).join(' ')
      add(path, xy.includes('D') ? 'deleted' : xy[0] === 'A' ? 'added' : 'modified')
    }
  }
  return parsed
}

interface Repo {
  git: string
  /** Depo kökünün (bağlı klasörün) gerçek yolu */
  root: string
  gitDir: string
  hooksDir: string
}

/** Mesaj önerisi için modele verilecek bilgiler */
export interface CommitContext {
  /** Depodaki son commit başlıkları (üslup örneği) */
  recent: string[]
  files: { path: string; kind: GitChangeKind }[]
  /** Değişikliklerin kısaltılmış fark metni; gizli dosyaların içeriği yoktur */
  patch: string
}

export class GitService {
  /** trash: dosyayı çöp kutusuna gönderir (değişikliği geri çevirirken şimdiki hal kaybolmasın diye) */
  constructor(private readonly trash: (full: string) => Promise<void>) {}

  /** Klasör bir git deposunun kökü mü; değilse ya da git kurulu değilse null. */
  private async repo(folder: string): Promise<Repo | null> {
    const root = await realpath(folder)
    if (!(await stat(join(root, '.git')).catch(() => null))) return null
    const git = await findGit()
    if (!git) return null
    const res = await exec(git, root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-path', 'hooks'])
    if (res.code !== 0) throw new GitError(L().tools.git.failed(detail(res)))
    const [top, gitDir, hooks] = res.out.toString('utf8').split('\n').map((line) => line.trim())
    if (!top || !gitDir || !hooks) return null
    // Bağlı klasör deponun kökü değilse (ör. core.worktree başka yeri gösteriyorsa) git burada kullanılmaz.
    const topReal = await realpath(top).catch(() => null)
    if (!topReal || !samePath(topReal, root)) return null
    return { git, root, gitDir: resolve(root, gitDir), hooksDir: resolve(root, hooks) }
  }

  /** Deponun yerel ayarlarında git çalışırken başlatılacak programlar (adları) */
  private async riskyConfig(repo: Repo): Promise<string[]> {
    const res = await exec(repo.git, repo.root, ['config', '--list', '--show-scope', '-z'])
    if (res.code !== 0) throw new GitError(L().tools.git.failed(detail(res)))
    const tokens = res.out.toString('utf8').split('\0')
    const found = new Set<string>()
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const key = tokens[i + 1].split('\n')[0]
      if ((tokens[i] === 'local' || tokens[i] === 'worktree') && RISKY_KEY.test(key)) found.add(key)
    }
    return [...found]
  }

  private async hooks(repo: Repo): Promise<string[]> {
    // husky kendi klasörüne her betik için boş bir aracı koyar; asıl betikler bir üst klasördedir.
    const dir = basename(repo.hooksDir) === '_' && basename(dirname(repo.hooksDir)) === '.husky' ? dirname(repo.hooksDir) : repo.hooksDir
    const names = new Set(await readdir(dir).catch(() => [] as string[]))
    const found: string[] = []
    for (const name of HOOK_NAMES) {
      if (!names.has(name)) continue
      // Windows'ta çalıştırma izni yoktur; diğerlerinde git yalnızca çalıştırılabilir betikleri çağırır.
      if (WINDOWS || (await access(join(dir, name), constants.X_OK).then(() => true, () => false))) found.push(name)
    }
    return found
  }

  private async busy(repo: Repo): Promise<boolean> {
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']) {
      if (await stat(join(repo.gitDir, name)).catch(() => null)) return true
    }
    return false
  }

  /** İşlem yapılacak depo: klasör depo kökü değilse ya da deponun ayarları riskliyse hata verir. */
  private async safeRepo(folder: string): Promise<Repo> {
    const t = L().tools.git
    const repo = await this.repo(folder)
    if (!repo) throw new GitError(t.notARepo)
    const risky = await this.riskyConfig(repo)
    if (risky.length > 0) throw new GitError(t.blocked(risky.join(', ')))
    return repo
  }

  /** Bütün değişiklik listesi (arayüz için kısaltılmamış hali) */
  private async read(repo: Repo): Promise<ParsedStatus> {
    const res = await exec(repo.git, repo.root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all', '--ignore-submodules=all', '--no-renames'])
    if (res.timedOut) throw new GitError(L().tools.git.timeout)
    if (res.code !== 0 && !res.truncated) throw new GitError(L().tools.git.failed(detail(res)))
    const output = res.out.toString('utf8')
    // Çıktı sınırda kesildiyse yarım kalan son satır atılır.
    return parseStatus(res.truncated ? output.slice(0, output.lastIndexOf('\0') + 1) : output)
  }

  private async open(folder: string): Promise<{ repo: Repo; state: ParsedStatus }> {
    const repo = await this.safeRepo(folder)
    return { repo, state: await this.read(repo) }
  }

  /** Bağlı klasör bir git deposunun köküyse durumunu verir; değilse ya da git kurulu değilse null. */
  async status(folder: string): Promise<GitStatus | null> {
    const repo = await this.repo(folder)
    if (!repo) return null
    const blocked = await this.riskyConfig(repo)
    if (blocked.length > 0) return { branch: null, initial: false, ahead: null, changes: [], more: 0, hooks: [], busy: false, blocked }
    const [state, hooks, busy] = await Promise.all([this.read(repo), this.hooks(repo), this.busy(repo)])
    return {
      branch: state.branch,
      initial: state.initial,
      ahead: state.ahead,
      changes: state.changes.slice(0, MAX_CHANGES),
      more: Math.max(0, state.changes.length - MAX_CHANGES),
      hooks,
      busy,
      blocked: []
    }
  }

  /** Dosyanın son commit'teki içeriği; dosya o commit'te yoksa null. Sınırı aşarsa 'large'. */
  private async headBytes(repo: Repo, path: string, maxBytes = MAX_DIFF_BYTES): Promise<Buffer | null | 'large'> {
    const res = await exec(repo.git, repo.root, ['cat-file', 'blob', `HEAD:${path}`], { maxBytes: maxBytes + 1 })
    if (res.truncated) return 'large'
    return res.code === 0 ? res.out : null
  }

  /** Değişen bir dosyanın son commit'teki ve şimdiki hali (fark görünümü için). */
  async diff(folder: string, requested: string): Promise<GitFileDiff> {
    const t = L().tools
    const repo = await this.safeRepo(folder)
    const path = String(requested).replace(/\\/g, '/').replace(/^\.?\/+/, '')
    const full = await resolveInside(repo.root, path)
    if (isSecretFile(path)) return { path, before: null, after: null, note: t.code.secretFile }
    const before = await this.headBytes(repo, path)
    const info = await stat(full).catch(() => null)
    if (before === 'large' || (info && info.size > MAX_DIFF_BYTES)) return { path, before: null, after: null, note: t.git.tooLarge }
    const after = info?.isFile() ? await readFile(full) : null
    if ((before && isBinary(before)) || (after && isBinary(after))) return { path, before: null, after: null, note: t.code.binaryFile }
    return { path, before: before ? text(before) : null, after: after ? text(after) : null, note: '' }
  }

  /** Seçilen yolların hepsi değişiklik listesinde olmalı: arayüzden gelen yol doğrudan git'e verilmez. */
  private pick(state: ParsedStatus, paths: unknown): GitChange[] {
    const t = L().tools.git
    const wanted = [...new Set((Array.isArray(paths) ? paths : []).map(String))]
    if (wanted.length === 0) throw new GitError(t.noPaths)
    const known = new Map(state.changes.map((c) => [c.path, c]))
    return wanted.map((path) => {
      const change = known.get(path)
      if (!change) throw new GitError(t.unknownPath(path))
      return change
    })
  }

  /** Seçilen dosyaların şimdiki halini commit eder; seçilmeyen değişiklikler olduğu gibi kalır. */
  async commit(folder: string, paths: unknown, message: string): Promise<void> {
    const t = L().tools.git
    const body = String(message ?? '').replace(/\r\n/g, '\n').trim()
    if (!body) throw new GitError(t.noMessage)
    if (body.length > MAX_MESSAGE_CHARS) throw new GitError(t.messageTooLong)
    const { repo, state } = await this.open(folder)
    const selected = this.pick(state, paths)
    if ((await this.busy(repo)) || selected.some((c) => c.kind === 'conflict')) throw new GitError(t.busy)
    if (state.branch === null) throw new GitError(t.detached)

    const input = `${selected.map((c) => c.path).join('\0')}\0`
    const added = await exec(repo.git, repo.root, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { input })
    if (added.code !== 0) throw new GitError(t.failed(detail(added)))
    const dir = await mkdtemp(join(tmpdir(), 'atlas-commit-'))
    try {
      const file = join(dir, 'mesaj.txt')
      await writeFile(file, `${body}\n`, 'utf8')
      const res = await exec(repo.git, repo.root, ['commit', '--quiet', '-F', file, '--pathspec-from-file=-', '--pathspec-file-nul'], { input, timeoutMs: SLOW_TIMEOUT_MS })
      if (res.code === 0) return
      const all = `${res.err}\n${res.out.toString('utf8')}`
      if (res.timedOut) throw new GitError(t.timeout)
      if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(all)) throw new GitError(t.nothingToCommit)
      if (/please tell me who you are|unable to auto-detect email|empty ident name|author identity unknown/i.test(all)) throw new GitError(t.noIdentity)
      throw new GitError(t.commitFailed(detail(res)))
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Bulunulan yerden yeni bir dal açar ve ona geçer; dosyalara dokunulmaz. */
  async createBranch(folder: string, requested: string): Promise<void> {
    const t = L().tools.git
    const name = String(requested ?? '').trim()
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]{0,99}$/u.test(name)) throw new GitError(t.badBranchName)
    const repo = await this.safeRepo(folder)
    const check = await exec(repo.git, repo.root, ['check-ref-format', '--branch', name])
    if (check.code !== 0 || check.out.toString('utf8').trim() !== name) throw new GitError(t.badBranchName)
    const res = await exec(repo.git, repo.root, ['switch', '-c', name], { timeoutMs: SLOW_TIMEOUT_MS })
    if (res.code === 0) return
    if (/already exists/i.test(res.err)) throw new GitError(t.branchExists(name))
    throw new GitError(t.failed(detail(res)))
  }

  /**
   * Dosyadaki değişikliği geri çevirir. Dosyanın şimdiki hali silinmez, çöp kutusuna gider; sonra son commit'teki
   * hali geri getirilir. Son commit'te olmayan (yeni) dosya yalnızca çöp kutusuna gider.
   */
  async discard(folder: string, requested: string): Promise<void> {
    const t = L().tools.git
    const { repo, state } = await this.open(folder)
    const [change] = this.pick(state, [requested])
    if (await this.busy(repo)) throw new GitError(t.busy)
    const full = await resolveInside(repo.root, change.path)
    const inHead = (await exec(repo.git, repo.root, ['cat-file', '-e', `HEAD:${change.path}`])).code === 0
    if (await stat(full).catch(() => null)) await this.trash(full)
    const res = inHead
      ? await exec(repo.git, repo.root, ['checkout', 'HEAD', '--', change.path], { timeoutMs: SLOW_TIMEOUT_MS })
      : await exec(repo.git, repo.root, ['rm', '--cached', '--quiet', '--ignore-unmatch', '--', change.path])
    if (res.code !== 0) throw new GitError(t.discardFailed(change.path, detail(res)))
  }

  /** Mesaj önerisi için: son commit başlıkları, seçilen dosyalar ve kısaltılmış fark. Gizli dosyaların içeriği verilmez. */
  async commitContext(folder: string, paths: unknown): Promise<CommitContext> {
    const { repo, state } = await this.open(folder)
    const selected = this.pick(state, paths)
    const log = state.initial ? null : await exec(repo.git, repo.root, ['log', '-5', '--format=%s'])
    const recent = log?.code === 0 ? log.out.toString('utf8').split('\n').map((line) => line.trim()).filter(Boolean) : []

    const open = selected.filter((c) => !c.secret)
    let patch = ''
    if (!state.initial && open.length > 0) {
      const res = await exec(repo.git, repo.root, ['diff', 'HEAD', ...SAFE_DIFF, '-U1', '--', ...open.slice(0, PATCH_FILES).map((c) => c.path)], { maxBytes: 64 * 1024 })
      if (res.code === 0 || res.truncated) patch = text(res.out)
    }
    // İzlenmeyen (yeni) dosyalar farkta görünmez: ilk birkaçının baş kısmı eklenir.
    let added = 0
    for (const change of open) {
      if (change.kind !== 'added' || patch.includes(`b/${change.path}\n`) || added >= NEW_FILES) continue
      const full = await resolveInside(repo.root, change.path)
      const info = await stat(full).catch(() => null)
      if (!info?.isFile() || info.size > MAX_DIFF_BYTES) continue
      const bytes = await readFile(full).catch(() => null)
      if (!bytes || isBinary(bytes)) continue
      added++
      const head = text(bytes).slice(0, NEW_FILE_CHARS)
      patch += `\n+++ ${change.path}\n${head.split('\n').map((line) => `+${line}`).join('\n')}\n`
    }
    return {
      recent,
      files: selected.map((c) => ({ path: c.path, kind: c.kind })),
      patch: patch.length > PATCH_CHARS ? `${patch.slice(0, PATCH_CHARS)}\n…` : patch.trim()
    }
  }
}

/** Modelin önerdiği commit mesajından yalnızca başlık satırını alır: tırnak, madde işareti ve ön ekler atılır. */
export function cleanCommitMessage(reply: string): string {
  const line =
    reply
      .replace(/```[a-z]*\n?/gi, '')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  return line
    .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')
    .replace(/^(?:commit (?:mesajı|message)|mesaj|message)\s*:\s*/i, '')
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .trim()
    .slice(0, 100)
}

/** Commit mesajı önerisi için modele gidecek istem. */
export function commitMessagePrompt(context: CommitContext): { system: string; user: string } {
  const t = L().prompts.git
  return {
    system: t.system,
    user: [
      context.recent.length > 0 ? t.recent(context.recent.map((subject) => `- ${subject}`).join('\n')) : t.language,
      t.files(context.files.map((f) => `- ${t.kinds[f.kind]}: ${f.path}`).join('\n')),
      ...(context.patch ? [t.patch(context.patch)] : [])
    ].join('\n\n')
  }
}
