/**
 * Ajan test seti düzeneği.
 *
 * Atlas'ın gerçek sohbet, dosya ve veritabanı servislerini (src/main/services) pencere olmadan, gerçek bir Ollama
 * modeliyle çalıştırır. Her görev geçici bir klasörde, görevin dosyalarıyla (ve gerekiyorsa bir SQLite
 * veritabanıyla) başlar. Kullanıcı mesajı gönderilir, onay kartları görevin kuralına göre onaylanır ya da reddedilir;
 * cevap bitince görevin kendi denetimi sonucu kontrol eder.
 *
 * Ölçülenler: başarı, süre, araç adımları, dürtmeler, metin olarak yazılıp gerçek çağrıya çevrilen araçlar,
 * edit_file hataları, "yazdım" deyip hiçbir dosyayı değiştirmeme, cevabı izin sorarak bitirme.
 */
import { execFile } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Message, ToolStep } from '../../src/shared/types'
import { Db } from '../../src/main/db'
import { setLanguage } from '../../src/main/i18n'
import { asksPermission, ChatService, claimsWrite } from '../../src/main/services/chat'
import { FilesService } from '../../src/main/services/files'
import { scanHardware, toolContextSize } from '../../src/main/services/hardware'
import { MemoryService } from '../../src/main/services/memory'
import { chatOnce } from '../../src/main/services/ollama'
import { initSql, sqlService } from '../../src/main/services/sql'
import { WhatsAppService } from '../../src/main/services/whatsapp'
import { TASKS } from './tasks'

/** Onay kartlarına kullanıcının yerine nasıl cevap verileceği */
export type Policy = 'approve' | 'deny-writes' | 'deny-commands' | 'deny-sql'

export interface Task {
  id: string
  category: 'kod' | 'okuma' | 'güvenlik' | 'komut' | 'sql'
  /** Raporda görünen kısa açıklama */
  title: string
  /** Kullanıcının mesajı */
  prompt: string
  /** Proje klasörünün dosyaları (göreli yol → içerik) */
  files?: Record<string, string | Buffer>
  /** Klasörde veri.sqlite oluşturan ve sohbete bağlanan SQL betiği */
  sqlite?: string
  /** Klasör bağlanmasın: yalnızca veritabanıyla konuşulan görevler */
  noFolder?: boolean
  policy?: Policy
  /** Görev için gereken program ("python"); bilgisayarda yoksa görev atlanır */
  needs?: string
  timeoutMs?: number
  check(ctx: CheckContext): Promise<void> | void
}

export interface Approval {
  kind: string
  path: string
  protected: boolean
  approved: boolean
}

export interface CheckContext {
  dir: string
  /** Asistanın kaydedilen son cevabı */
  reply: string
  steps: ToolStep[]
  approvals: Approval[]
  sqlApprovals: { sql: string; approved: boolean }[]
  error: string | null
  read(rel: string): Promise<string | null>
  bytes(rel: string): Promise<Buffer | null>
  exists(rel: string): Promise<boolean>
  /** Komutu görev klasöründe çalıştırır (denetim için; modelin komutlarından ayrı) */
  run(command: string): Promise<{ code: number | null; output: string }>
  /** Görev klasöründe bir Node betiği çalıştırır (komut satırı tırnaklarıyla uğraşmadan) */
  script(code: string): Promise<{ code: number | null; output: string }>
  /** Görevin SQLite veritabanından okur */
  query<T = Record<string, unknown>>(sql: string): T[]
  /** Görevin başlangıçtaki dosyası */
  original(rel: string): string | Buffer | undefined
  /** Koşul sağlanmazsa notu başarısızlık nedeni olarak kaydeder */
  expect(condition: unknown, note: string): void
  /** Cevapta bu ifadelerden biri geçiyor mu (Türkçe harf ve büyük-küçük farkı gözetmeden) */
  says(...words: string[]): boolean
  /** Bu cevapta bir dosya değişti mi (yazma, düzenleme, taşıma, klasör) */
  changed(): boolean
}

export interface RunResult {
  task: string
  category: Task['category']
  model: string
  attempt: number
  ok: boolean
  /** Atlandıysa nedeni */
  skipped: string | null
  notes: string[]
  seconds: number
  steps: number
  tools: Record<string, number>
  failedSteps: number
  deniedSteps: number
  editFailures: number
  nudges: number
  textToolCalls: number
  retries: number
  compactions: number
  /** "Yazdım / ekledim" dedi ama hiçbir dosya değişmedi */
  falseClaim: boolean
  /** Cevap kullanıcıya izin sorarak bitti */
  endsAsking: boolean
  error: string | null
  timedOut: boolean
  tokens: number | null
  reply: string
}

export interface ModelSummary {
  model: string
  ok: number
  total: number
  rate: number
  low: number
  high: number
  seconds: number
  steps: number
  nudges: number
  textToolCalls: number
  editFailures: number
  falseClaims: number
  endsAsking: number
  failures: number
}

export interface Summary {
  models: ModelSummary[]
  results: RunResult[]
}

export interface Options {
  models: string[]
  repeat: number
  /** Yalnızca bu görevler (boşsa hepsi) */
  tasks: string[] | null
  /** Sürüm kapısı: en düşük başarı oranı */
  gate: number | null
  /** Başarısız görevlerin klasörlerini incelemek için silme */
  keepFailed: boolean
  out: string
}

const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000
const CHANGE_TOOLS = new Set(['write_file', 'edit_file', 'move_file', 'create_folder'])

export function optionsFromEnv(): Options {
  const list = (value?: string): string[] =>
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  const models = list(process.env.AJAN_MODELS)
  const tasks = list(process.env.AJAN_TASKS)
  return {
    models: models.length > 0 ? models : ['atlas-code:latest', 'atlas-guclu:latest'],
    repeat: Math.max(1, Math.floor(Number(process.env.AJAN_REPEAT) || 1)),
    tasks: tasks.length > 0 ? tasks : null,
    gate: process.env.AJAN_GATE ? Number(process.env.AJAN_GATE) : null,
    keepFailed: process.env.AJAN_KEEP === '1',
    out: process.env.AJAN_OUT ?? join('eval', 'ajan', 'results')
  }
}

/** Türkçe harfleri ve büyük-küçük farkını yok sayarak karşılaştırmak için */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u')
}

function shell(dir: string, command: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32'
    execFile(
      windows ? 'cmd.exe' : 'sh',
      windows ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command],
      { cwd: dir, timeout: 90_000, windowsHide: true, windowsVerbatimArguments: windows, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0
        resolve({ code, output: `${stdout ?? ''}${stderr ?? ''}` })
      }
    )
  })
}

/** Wilson aralığı: az sayıda denemede başarı oranının ne kadar güvenilir olduğunu gösterir */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0]
  const z = 1.96
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)]
}

async function runTask(task: Task, model: string, attempt: number, options: Options): Promise<RunResult> {
  const started = Date.now()
  const dir = await mkdtemp(join(tmpdir(), `atlas-ajan-${task.id}-`))
  const db = new Db(':memory:')
  let chat: ChatService | null = null
  let keep = false
  try {
    for (const [rel, content] of Object.entries(task.files ?? {})) {
      const full = join(dir, rel)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, content)
    }
    if (task.sqlite) {
      const sqlite = new DatabaseSync(join(dir, 'veri.sqlite'))
      sqlite.exec(task.sqlite)
      sqlite.close()
    }

    setLanguage('tr')
    db.setSettings({ setupDone: true, language: 'tr', defaultModel: model, memoryEnabled: false, notifyWhenDone: false, think: false, userName: 'Deniz' })
    const memory = new MemoryService(db)
    const whatsapp = new WhatsAppService(db, memory)
    const policy = task.policy ?? 'approve'
    const approvals: Approval[] = []
    const sqlApprovals: { sql: string; approved: boolean }[] = []
    const files: FilesService = new FilesService(
      db,
      {
        approval: (a) => {
          const writes = a.kind === 'write' || a.kind === 'move' || a.kind === 'mkdir'
          const approved = !((policy === 'deny-writes' && writes) || (policy === 'deny-commands' && a.kind === 'command'))
          approvals.push({ kind: a.kind, path: a.path, protected: a.protected === true, approved })
          queueMicrotask(() => files.respond(a.id, approved))
        },
        indexProgress: () => {}
      },
      memory
    )
    initSql(db, {
      approval: (a) => {
        const approved = policy !== 'deny-sql'
        sqlApprovals.push({ sql: a.sql, approved })
        queueMicrotask(() => sqlService().respond(a.id, approved))
      },
      result: () => {}
    })
    const folder = task.noFolder ? null : db.addFolder(dir)
    const connection = task.sqlite ? sqlService().save({ name: 'Mağaza', engine: 'sqlite', file: join(dir, 'veri.sqlite') }) : null
    const conversation = db.createConversation(model, { personaId: 'builtin:yazilim', folderId: folder?.id ?? null, sqlId: connection?.id ?? null })
    // Sohbete ad verilir: başlık üretimi (ayrı bir model çağrısı) bir sonraki görevin süresine karışmasın.
    db.renameConversation(conversation.id, task.id)

    const counters = { nudges: 0, textToolCalls: 0, retries: 0, compactions: 0 }
    const liveSteps: ToolStep[] = []
    let finish: (r: { message: Message | null; error: string | null }) => void = () => {}
    const finished = new Promise<{ message: Message | null; error: string | null }>((resolve) => (finish = resolve))
    const service = new ChatService(
      db,
      {
        chunk: () => {},
        thinking: () => {},
        conversationUpdated: () => {},
        learned: () => {},
        step: (e) => {
          if (e.conversationId === conversation.id) liveSteps.push(e.step)
        },
        done: (d) => {
          if (d.conversationId === conversation.id) finish({ message: d.message, error: null })
        },
        error: (e) => {
          if (e.conversationId === conversation.id) finish({ message: e.message, error: e.error || 'durduruldu' })
        },
        debug: (e) => {
          if (e.kind === 'nudge') counters.nudges++
          else if (e.kind === 'textToolCall') counters.textToolCalls++
          else if (e.kind === 'retry') counters.retries++
          else counters.compactions++
        }
      },
      memory,
      whatsapp,
      files
    )
    chat = service

    const timeoutMs = task.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      service.stop(conversation.id)
    }, timeoutMs)
    service.send(conversation.id, task.prompt)
    const outcome = await finished
    clearTimeout(timer)

    const reply = outcome.message?.content ?? ''
    const steps = outcome.message?.steps.length ? outcome.message.steps : liveSteps
    const notes: string[] = []
    const changed = (): boolean => steps.some((s) => CHANGE_TOOLS.has(s.tool) && s.status === 'ok')
    const ctx: CheckContext = {
      dir,
      reply,
      steps,
      approvals,
      sqlApprovals,
      error: outcome.error,
      read: (rel) => readFile(join(dir, rel), 'utf8').catch(() => null),
      bytes: (rel) => readFile(join(dir, rel)).catch(() => null),
      exists: (rel) => stat(join(dir, rel)).then(() => true, () => false),
      run: (command) => shell(dir, command),
      script: async (code) => {
        await writeFile(join(dir, '.atlas-denetim.cjs'), code)
        return shell(dir, 'node .atlas-denetim.cjs')
      },
      query: <T>(sql: string): T[] => {
        const sqlite = new DatabaseSync(join(dir, 'veri.sqlite'), { readOnly: true })
        try {
          return sqlite.prepare(sql).all() as T[]
        } finally {
          sqlite.close()
        }
      },
      original: (rel) => task.files?.[rel],
      expect: (condition, note) => {
        if (!condition) notes.push(note)
      },
      says: (...words) => {
        const text = fold(reply)
        return words.some((w) => text.includes(fold(w)))
      },
      changed
    }
    if (timedOut) notes.push(`süre doldu (${Math.round(timeoutMs / 1000)} sn)`)
    else if (outcome.error) notes.push(`hata: ${outcome.error.replace(/\s+/g, ' ').slice(0, 160)}`)
    try {
      await task.check(ctx)
    } catch (err) {
      notes.push(`denetim çalışmadı: ${err instanceof Error ? err.message : String(err)}`)
    }

    const tools: Record<string, number> = {}
    for (const s of steps) tools[s.tool] = (tools[s.tool] ?? 0) + 1
    const ok = notes.length === 0
    keep = !ok && options.keepFailed
    if (keep) notes.push(`klasör: ${dir}`)
    return {
      task: task.id,
      category: task.category,
      model,
      attempt,
      ok,
      skipped: null,
      notes,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      steps: steps.length,
      tools,
      failedSteps: steps.filter((s) => s.status === 'error').length,
      deniedSteps: steps.filter((s) => s.status === 'denied').length,
      editFailures: steps.filter((s) => s.tool === 'edit_file' && s.status === 'error').length,
      ...counters,
      falseClaim: claimsWrite(reply) && !changed(),
      endsAsking: asksPermission(reply),
      error: outcome.error,
      timedOut,
      tokens: outcome.message?.tokens ?? null,
      reply: reply.slice(0, 1500)
    }
  } finally {
    await chat?.settle(5000)
    db.close()
    // Arka planda kalan bir süreç klasörü tutuyorsa silinemeyebilir; önemsenmez.
    if (!keep) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {})
  }
}

function skippedResult(task: Task, model: string, reason: string): RunResult {
  return {
    task: task.id,
    category: task.category,
    model,
    attempt: 1,
    ok: false,
    skipped: reason,
    notes: [],
    seconds: 0,
    steps: 0,
    tools: {},
    failedSteps: 0,
    deniedSteps: 0,
    editFailures: 0,
    nudges: 0,
    textToolCalls: 0,
    retries: 0,
    compactions: 0,
    falseClaim: false,
    endsAsking: false,
    error: null,
    timedOut: false,
    tokens: null,
    reply: ''
  }
}

export function summarize(results: RunResult[], models: string[]): Summary {
  const summaries = models.map((model) => {
    const runs = results.filter((r) => r.model === model && !r.skipped)
    const ok = runs.filter((r) => r.ok).length
    const [low, high] = wilson(ok, runs.length)
    const avg = (pick: (r: RunResult) => number): number => (runs.length ? runs.reduce((s, r) => s + pick(r), 0) / runs.length : 0)
    return {
      model,
      ok,
      total: runs.length,
      rate: runs.length ? ok / runs.length : 0,
      low,
      high,
      seconds: avg((r) => r.seconds),
      steps: avg((r) => r.steps),
      nudges: runs.reduce((s, r) => s + r.nudges, 0),
      textToolCalls: runs.reduce((s, r) => s + r.textToolCalls, 0),
      editFailures: runs.reduce((s, r) => s + r.editFailures, 0),
      falseClaims: runs.filter((r) => r.falseClaim).length,
      endsAsking: runs.filter((r) => r.endsAsking).length,
      failures: runs.filter((r) => r.error || r.timedOut).length
    }
  })
  return { models: summaries, results }
}

interface Meta {
  date: string
  machine: string
  ollama: string
  numCtx: number
  repeat: number
  models: string[]
  tasks: number
}

const percent = (x: number): string => `%${Math.round(x * 100)}`

export function report(summary: Summary, meta: Meta, tasks: Task[]): string {
  const lines: string[] = []
  lines.push('# Ajan test seti sonuçları', '')
  lines.push(
    `${meta.date}. ${meta.machine}, Ollama ${meta.ollama}, bağlam ${meta.numCtx} belirteç. ${meta.tasks} görev, her biri ${meta.repeat} kez.`,
    '',
    'Nasıl çalıştırılır ve neyin ölçüldüğü: [README.md](README.md)',
    ''
  )
  lines.push(
    '| Model | Başarı | %95 aralık | Ortalama süre | Ortalama adım | Dürtme | Metinden araç | edit_file hatası | "Yazdım" deyip yazmama | İzin sorarak bitirme | Hata ya da süre aşımı |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  )
  for (const m of summary.models) {
    lines.push(
      `| ${m.model} | ${m.ok}/${m.total} (${percent(m.rate)}) | ${percent(m.low)}-${percent(m.high).slice(1)} | ${Math.round(m.seconds)} sn | ${m.steps.toFixed(1)} | ${m.nudges} | ${m.textToolCalls} | ${m.editFailures} | ${m.falseClaims} | ${m.endsAsking} | ${m.failures} |`
    )
  }
  lines.push('')

  const categories = [...new Set(tasks.map((t) => t.category))]
  lines.push('## Türlere göre', '', `| Tür | ${summary.models.map((m) => m.model).join(' | ')} |`, `| --- | ${summary.models.map(() => '---:').join(' | ')} |`)
  for (const category of categories) {
    const cells = summary.models.map((m) => {
      const runs = summary.results.filter((r) => r.model === m.model && r.category === category && !r.skipped)
      return `${runs.filter((r) => r.ok).length}/${runs.length}`
    })
    lines.push(`| ${category} | ${cells.join(' | ')} |`)
  }
  lines.push('')

  lines.push('## Görevler', '', `| Görev | Tür | ${summary.models.map((m) => m.model).join(' | ')} |`, `| --- | --- | ${summary.models.map(() => ':---:').join(' | ')} |`)
  for (const task of tasks) {
    const cells = summary.models.map((m) => {
      const runs = summary.results.filter((r) => r.model === m.model && r.task === task.id)
      if (runs.length > 0 && runs.every((r) => r.skipped)) return 'atlandı'
      const done = runs.filter((r) => !r.skipped)
      return `${done.filter((r) => r.ok).length}/${done.length}`
    })
    lines.push(`| \`${task.id}\`: ${task.title} | ${task.category} | ${cells.join(' | ')} |`)
  }
  lines.push('')

  const failed = summary.results.filter((r) => !r.ok && !r.skipped)
  if (failed.length > 0) {
    lines.push('## Başarısız denemeler', '')
    for (const r of failed) {
      const reply = r.reply.replace(/\s+/g, ' ').trim()
      lines.push(`- **${r.model}, \`${r.task}\` #${r.attempt}** (${r.seconds} sn, ${r.steps} adım): ${r.notes.join('; ')}${reply ? `. Son cevap: "${reply.slice(0, 220)}${reply.length > 220 ? '…' : ''}"` : ''}`)
    }
    lines.push('')
  }
  const skipped = summary.results.filter((r) => r.skipped)
  if (skipped.length > 0) {
    lines.push('## Atlananlar', '')
    for (const r of skipped) lines.push(`- ${r.model}, \`${r.task}\`: ${r.skipped}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function ollamaVersion(): Promise<string> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(3000) })
    return ((await res.json()) as { version?: string }).version ?? '?'
  } catch {
    return '?'
  }
}

export async function runSuite(options: Options): Promise<Summary> {
  const tasks = TASKS.filter((t) => !options.tasks || options.tasks.includes(t.id))
  const hardware = await scanHardware()
  const numCtx = await toolContextSize()
  const meta: Meta = {
    date: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    machine: [hardware.gpus.map((g) => `${g.name} (${g.vramGb} GB)`).join(', ') || 'ekran kartı yok', `${hardware.ramGb} GB bellek`].join(', '),
    ollama: await ollamaVersion(),
    numCtx,
    repeat: options.repeat,
    models: options.models,
    tasks: tasks.length
  }
  await mkdir(options.out, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const jsonFile = join(options.out, `${stamp}.json`)
  const results: RunResult[] = []
  const programs = new Map<string, boolean>()

  for (const model of options.models) {
    // Model araçlı sohbetin bağlam boyuyla önceden yüklenir: yükleme süresi ilk görevin süresine eklenmesin.
    try {
      await chatOnce({ model, messages: [{ role: 'user', content: 'Merhaba' }], numPredict: 1, numCtx })
    } catch (err) {
      console.log(`${model} yüklenemedi: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    for (const task of tasks) {
      if (task.needs) {
        if (!programs.has(task.needs)) programs.set(task.needs, (await shell(tmpdir(), `${task.needs} --version`)).code === 0)
        if (!programs.get(task.needs)) {
          results.push(skippedResult(task, model, `${task.needs} kurulu değil`))
          continue
        }
      }
      for (let attempt = 1; attempt <= options.repeat; attempt++) {
        const result = await runTask(task, model, attempt, options)
        results.push(result)
        const line = `${result.ok ? 'GEÇTİ' : 'KALDI'} ${model} ${task.id} #${attempt} (${result.seconds} sn, ${result.steps} adım)${result.notes.length ? ` ${result.notes.join('; ')}` : ''}`
        console.log(line)
        // İlerleme ayrı bir dosyaya da yazılır: uzun çalıştırmalarda nerede olunduğu izlenebilsin.
        await appendFile(join(options.out, `${stamp}.log`), `${line}\n`)
        await writeFile(jsonFile, JSON.stringify({ meta, results }, null, 2))
      }
    }
  }

  const summary = summarize(results, options.models)
  const markdown = report(summary, meta, tasks)
  await writeFile(join(options.out, `${stamp}.md`), markdown)
  // Bütün görevlerle yapılan çalıştırma, depodaki özet tabloyu günceller.
  if (!options.tasks) await writeFile(join('eval', 'ajan', 'RESULTS.md'), markdown)
  return summary
}
