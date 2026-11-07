// Kurulum dosyasıyla dağıtılan açık kaynak paketlerin lisans bildirimlerini üretir: resources/third-party-notices.txt
//
// Kapsam:
//   1. Üretim bağımlılıkları (kurulum dosyasına node_modules olarak girer).
//   2. Derleme sırasında uygulamanın içine gömülen paketler (arayüz kütüphaneleri, yazı tipleri): src/ altındaki
//      import'lardan bulunur, bağımlılıklarıyla birlikte eklenir.
// Lisansı belli olmayan ya da yalnızca copyleft (GPL, AGPL, LGPL...) olan bir paket bulunursa hata verir; böylece
// kurulum dosyasına farkında olmadan böyle bir paket girmez.
//
// Kullanım: node scripts/make-notices.cjs [--check]   (--check dosya yazmaz, yalnızca denetler)
const fs = require('node:fs')
const path = require('node:path')
const { builtinModules } = require('node:module')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'resources', 'third-party-notices.txt')

/** Dağıtılan bir ikilide bildirimle birlikte kullanılabilen (copyleft olmayan) lisanslar */
const PERMISSIVE =
  /^(?:MIT|MIT-0|MIT\/X11|ISC|0BSD|BSD|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|Unlicense|Zlib|OFL-1\.1|CC0-1\.0|CC-BY-4\.0|BlueOak-1\.0\.0|Python-2\.0|WTFPL)$/i

/** package.json'daki lisans alanını (metin, { type } ya da eski "licenses" dizisi) tek bir ifadeye çevirir. */
function licenseExpression(pkg) {
  const raw = pkg.license ?? pkg.licenses
  if (typeof raw === 'string') return raw.trim()
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ')
  if (raw && typeof raw === 'object' && typeof raw.type === 'string') return raw.type.trim()
  return ''
}

/**
 * Lisans ifadesinden kullanılacak lisansı seçer. "A OR B" biçiminde seçenek sunuluyorsa copyleft olmayan ilk seçenek
 * alınır ("(MIT OR GPL-3.0-or-later)" → MIT); "A AND B" ise ikisi de geçerlidir ve ikisi de uygun olmalıdır.
 * Uygun bir seçenek yoksa null döner.
 */
function chooseLicense(expression) {
  const text = String(expression ?? '').trim().replace(/^\(([^()]*)\)$/, '$1').trim()
  if (!text) return null
  // İç içe parantez ("GPL-2.0-only AND (MIT OR Apache-2.0)") ya da istisna (WITH) içeren ifade burada doğru
  // değerlendirilemez; elle bakılması için uygun sayılmaz.
  if (/[()]/.test(text) || /\sWITH\s/i.test(text)) return null
  const allPermissive = (part) =>
    part
      .split(/\s+AND\s+/i)
      .map((p) => p.trim().replace(/^\(|\)$/g, ''))
      .every((p) => PERMISSIVE.test(p))
  const options = text.split(/\s+OR\s+/i).map((o) => o.trim().replace(/^\(|\)$/g, ''))
  const chosen = options.find(allPermissive)
  if (!chosen) return null
  return { license: chosen, chosenFrom: options.length > 1 ? text : null }
}

/** import ifadesindeki addan paket adını çıkarır; göreli yol, takma ad, Node'un kendi modülü ya da electron ise null. */
function packageName(specifier) {
  const spec = String(specifier).trim()
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('@shared/') || spec === '@shared') return null
  if (spec.startsWith('node:') || spec === 'electron' || builtinModules.includes(spec.split('/')[0])) return null
  const parts = spec.split('/')
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  return /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) ? name : null
}

/** Bir kaynak dosyanın (TypeScript, JavaScript ya da CSS) içe aktardığı paket adları */
function importsOf(source) {
  const names = new Set()
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@(?:import|plugin)\s+['"]([^'"]+)['"]/g
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = packageName(match[1])
      if (name) names.add(name)
    }
  }
  return [...names]
}

/** Kilit dosyasında bir paketin bağımlılığının kurulu olduğu yeri bulur (iç içe node_modules'tan köke doğru). */
function resolveDependency(packages, fromPath, name) {
  let base = fromPath
  for (;;) {
    const candidate = `${base ? `${base}/` : ''}node_modules/${name}`
    if (packages[candidate]) return candidate
    if (!base) return null
    const cut = base.lastIndexOf('/node_modules/')
    base = cut >= 0 ? base.slice(0, cut) : ''
  }
}

/** Verilen paketlerden başlayarak bütün bağımlılıkların kilit dosyasındaki yolları */
function closure(packages, rootPaths) {
  const seen = new Set()
  const queue = [...rootPaths]
  while (queue.length > 0) {
    const current = queue.pop()
    if (seen.has(current) || !packages[current]) continue
    seen.add(current)
    const entry = packages[current]
    for (const name of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      const resolved = resolveDependency(packages, current, name)
      if (resolved) queue.push(resolved)
    }
  }
  return seen
}

function walkSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSources(full, out)
    else if (/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Paket klasöründeki lisans ve bildirim dosyalarının metni (LICENSE, COPYING, NOTICE...) */
function licenseTexts(dir) {
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return ''
  }
  return names
    .filter((n) => /^(?:licen[cs]e|copying|unlicense|notice)(?:[-.][\w.-]*)?$/i.test(n))
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b))
    .map((n) => {
      try {
        const stat = fs.statSync(path.join(dir, n))
        return stat.isFile() && stat.size < 200_000 ? fs.readFileSync(path.join(dir, n), 'utf8').replace(/\r\n/g, '\n').trim() : ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

function collect() {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))
  const packages = lock.packages
  // 1. Üretim bağımlılıkları: kilit dosyasında "dev" işareti olmayanlar
  const shipped = new Set(Object.keys(packages).filter((p) => p.startsWith('node_modules/') && !packages[p].dev))
  // 2. Uygulamanın içine derlenenler: kaynaktaki import'lar ve bağımlılıkları
  const imported = new Set()
  for (const file of walkSources(path.join(ROOT, 'src'))) for (const name of importsOf(fs.readFileSync(file, 'utf8'))) imported.add(name)
  const bundledRoots = [...imported].map((name) => `node_modules/${name}`).filter((p) => packages[p])
  const missing = [...imported].filter((name) => !packages[`node_modules/${name}`])
  for (const p of closure(packages, bundledRoots)) shipped.add(p)

  const entries = []
  const problems = missing.map((name) => `${name}: kaynakta içe aktarılıyor ama kilit dosyasında yok`)
  for (const p of [...shipped].sort()) {
    const dir = path.join(ROOT, p)
    let pkg
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    } catch {
      // Başka işletim sistemleri için olan isteğe bağlı paketler kurulu değildir ve dağıtılmaz.
      if (packages[p].optional) continue
      problems.push(`${p}: kurulu değil (npm ci çalıştır)`)
      continue
    }
    const expression = licenseExpression(pkg) || packages[p].license || ''
    const chosen = chooseLicense(expression)
    if (!chosen) {
      problems.push(`${pkg.name}@${pkg.version}: lisans uygun değil ya da belirtilmemiş ("${expression}")`)
      continue
    }
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: chosen.license,
      chosenFrom: chosen.chosenFrom,
      url: (pkg.homepage || repo || '').replace(/^git\+/, '').replace(/\.git$/, ''),
      author: author || '',
      text: licenseTexts(dir)
    })
  }
  // Aynı paket iki ayrı yerde aynı sürümle kuruluysa bir kez yazılır.
  const unique = new Map(entries.map((e) => [`${e.name}@${e.version}`, e]))
  return { entries: [...unique.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)), problems }
}

function render(entries) {
  const lines = [
    'Atlas: üçüncü taraf yazılım bildirimleri / Third-party software notices',
    '',
    'Atlas açık kaynak yazılımlar içerir. Aşağıda kurulum dosyasıyla dağıtılan paketler ve lisans metinleri yer alır.',
    'Atlas includes open source software. The packages distributed with the installer and their license texts follow.',
    '',
    'Electron ve Chromium: lisans ve bildirimleri kurulum klasöründeki LICENSE.electron.txt ve LICENSES.chromium.html',
    'dosyalarındadır. / Electron and Chromium: see LICENSE.electron.txt and LICENSES.chromium.html in the install folder.',
    '',
    'Atlas modelleri kurulum dosyasında yer almaz; Ollama ile indirilir. Modeller Qwen 3.5, Gemma 4 ve Qwen2.5-Coder taban',
    'modellerinden ince ayarla türetilmiştir ve taban modeller gibi Apache License 2.0 ile dağıtılır.',
    'Atlas models are not part of the installer; they are downloaded with Ollama. They are fine-tuned derivatives of the',
    'Qwen 3.5, Gemma 4 and Qwen2.5-Coder base models and, like them, are distributed under the Apache License 2.0.',
    '',
    `Paket sayısı / Packages: ${entries.length}`,
    '',
    '='.repeat(100),
    ''
  ]
  for (const e of entries) lines.push(`${e.name} ${e.version}  |  ${e.license}${e.chosenFrom ? ` (seçenekler / offered as: ${e.chosenFrom})` : ''}${e.url ? `  |  ${e.url}` : ''}`)
  lines.push('', '='.repeat(100), '')

  // Aynı metni paylaşan paketler tek başlık altında toplanır.
  const groups = new Map()
  for (const e of entries) {
    const text = e.text || `License: ${e.license}. The package does not ship a license file.${e.author ? ` Copyright (c) ${e.author}.` : ''}`
    const key = text.replace(/\s+/g, ' ')
    if (!groups.has(key)) groups.set(key, { text, names: [] })
    groups.get(key).names.push(`${e.name} ${e.version}`)
  }
  for (const { text, names } of groups.values()) {
    lines.push(names.join(', '), '-'.repeat(100), text, '', '='.repeat(100), '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function main() {
  const { entries, problems } = collect()
  if (problems.length > 0) {
    console.error('Lisans bildirimi üretilemedi:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  const counts = {}
  for (const e of entries) counts[e.license] = (counts[e.license] ?? 0) + 1
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([license, n]) => `${license}: ${n}`)
    .join(', ')
  if (process.argv.includes('--check')) {
    console.log(`${entries.length} paket denetlendi (${summary}).`)
    return
  }
  fs.writeFileSync(OUTPUT, render(entries), 'utf8')
  console.log(`${path.relative(ROOT, OUTPUT)}: ${entries.length} paket (${summary}).`)
}

if (require.main === module) main()

module.exports = { main, chooseLicense, closure, importsOf, licenseExpression, packageName, resolveDependency }
