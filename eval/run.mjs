// Atlas-TR ölçümünü çalıştırır.
//
//   node eval/run.mjs --models "gemma4:12b,qwen3.5:9b" [--host http://127.0.0.1:11434] [--out eval/results] [--force]
//
// Her model için eval/results/<model>.json yazılır, sonra bütün sonuçlardan eval/RESULTS.md üretilir.
// Aynı model yeniden istenirse var olan sonuç kullanılır (--force ile yeniden ölçülür).
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreItem } from './checks.mjs'
import { CATEGORIES, ITEMS, SYSTEM } from './items.mjs'

const here = dirname(fileURLToPath(import.meta.url))

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? '') : fallback
}

const HOST = arg('host', 'http://127.0.0.1:11434')
const OUT = arg('out', join(here, 'results'))
const FORCE = process.argv.includes('--force')
const MODELS = arg('models')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

const fileFor = (model) => join(OUT, model.replace(/[^\w.-]+/g, '_') + '.json')

async function ask(model, item) {
  const body = {
    model,
    stream: false,
    think: false,
    messages: [
      { role: 'system', content: SYSTEM[item.cat] ?? SYSTEM.default },
      { role: 'user', content: item.prompt }
    ],
    // Sıcaklık sıfır ve sabit tohum: aynı model aynı soruya aynı cevabı verir.
    options: { temperature: 0, seed: 1, num_ctx: 4096, num_predict: item.long ? 900 : 400 }
  }
  const post = (payload) =>
    fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000)
    })
  let res = await post(body)
  // Düşünme ayarını tanımayan modellerde ayarsız tekrar denenir.
  if (res.status === 400) {
    const { think: _think, ...rest } = body
    res = await post(rest)
  }
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const content = (json.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return {
    output: content,
    tokens: json.eval_count ?? 0,
    seconds: (json.eval_duration ?? 0) / 1e9
  }
}

async function evaluate(model) {
  const results = []
  let tokens = 0
  let seconds = 0
  for (const [index, item] of ITEMS.entries()) {
    let output = ''
    let error = ''
    try {
      const r = await ask(model, item)
      output = r.output
      tokens += r.tokens
      seconds += r.seconds
    } catch (e) {
      error = String(e.message ?? e)
    }
    const { score, passed } = scoreItem(item, output)
    results.push({ id: item.id, cat: item.cat, score, passed, output, ...(error ? { error } : {}) })
    process.stdout.write(`\r${model}: ${index + 1}/${ITEMS.length}   `)
  }
  process.stdout.write('\n')
  return { model, date: new Date().toISOString(), tokensPerSec: seconds > 0 ? tokens / seconds : 0, results }
}

function summarize(run) {
  const byCat = {}
  for (const c of CATEGORIES) {
    const items = run.results.filter((r) => r.cat === c.id)
    byCat[c.id] = items.length ? (items.reduce((a, r) => a + r.score, 0) / items.length) * 100 : 0
  }
  // Genel puan kategorilerin ortalamasıdır: soru sayısı çok olan kategori ağır basmaz.
  const overall = Object.values(byCat).reduce((a, b) => a + b, 0) / CATEGORIES.length
  // Türkçe puanı: İngilizce ve kod dışındaki kategoriler.
  const trCats = CATEGORIES.filter((c) => !['ingilizce', 'kod'].includes(c.id)).map((c) => byCat[c.id])
  return { byCat, overall, turkish: trCats.reduce((a, b) => a + b, 0) / trCats.length }
}

function writeReport() {
  const runs = readdirSync(OUT)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')))
    .map((run) => ({ run, s: summarize(run) }))
    .sort((a, b) => b.s.overall - a.s.overall)

  const n = (x) => x.toFixed(0)
  const head = ['Model', 'Genel', 'Türkçe', ...CATEGORIES.map((c) => c.name), 'Hız (token/sn)']
  const lines = [
    '# Atlas-TR ölçüm sonuçları',
    '',
    `${ITEMS.length} soru, ${CATEGORIES.length} kategori. Puanlar 100 üzerinden; her soru otomatik kurallarla puanlanır.`,
    '"Genel" kategorilerin ortalamasıdır. "Türkçe", İngilizce ve kod dışındaki kategorilerin ortalamasıdır.',
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    ...runs.map(
      ({ run, s }) =>
        `| ${run.model} | **${n(s.overall)}** | ${n(s.turkish)} | ${CATEGORIES.map((c) => n(s.byCat[c.id])).join(' | ')} | ${n(run.tokensPerSec)} |`
    ),
    '',
    'Yeniden üretmek için: `node eval/run.mjs --models "<model adları>"`. Sorular `eval/items.mjs`, kurallar `eval/checks.mjs` dosyasındadır.',
    ''
  ]
  writeFileSync(join(here, 'RESULTS.md'), lines.join('\n'), 'utf8')
  return runs
}

mkdirSync(OUT, { recursive: true })
for (const model of MODELS) {
  if (!FORCE && existsSync(fileFor(model))) {
    // Kurallar değişmiş olabilir: kayıtlı cevaplar modele sormadan yeniden puanlanır.
    const saved = JSON.parse(readFileSync(fileFor(model), 'utf8'))
    for (const r of saved.results) {
      const item = ITEMS.find((i) => i.id === r.id)
      if (item) Object.assign(r, scoreItem(item, r.output))
    }
    writeFileSync(fileFor(model), JSON.stringify(saved, null, 1), 'utf8')
    console.log(`${model}: kayıtlı cevaplar yeniden puanlandı`)
    continue
  }
  const run = await evaluate(model)
  writeFileSync(fileFor(model), JSON.stringify(run, null, 1), 'utf8')
  const s = summarize(run)
  console.log(`${model}: genel ${s.overall.toFixed(1)}, Türkçe ${s.turkish.toFixed(1)}, ${run.tokensPerSec.toFixed(0)} token/sn`)
}
const runs = writeReport()
console.log(`\n${runs.length} modelin sonucu eval/RESULTS.md dosyasına yazıldı.`)
