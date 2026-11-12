import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/main/i18n'
import { docxBody, parseInline, parseMarkdown, safeFileName, toDocx, toHtml, toMarkdown, type ExportDocument } from '../src/main/services/export'
import { buildPanelMessages, PANEL_TEXT_LIMIT, panelTemperature } from '../src/main/services/panelPrompts'
import { downloadUpdate, pickAsset, type UpdateAsset } from '../src/main/services/updates'

afterEach(() => {
  setLanguage('tr')
  vi.unstubAllGlobals()
})

const SAMPLE = `# Başlık

Bu **kalın**, bu *italik*, bu \`kod\` ve [bağlantı](https://example.com).

- bir
- iki **önemli**

1. önce
2. sonra

> alıntı satırı

\`\`\`sql
SELECT TOP 5 * FROM [Musteri] WHERE a < 3 & b > 1
\`\`\`

| Ad | Yaş |
| --- | ---: |
| Ayşe | 30 |

---
Son paragraf.`

const doc: ExportDocument = {
  title: 'Bütçe <planı>',
  subtitle: '11 Kasım 2026, Atlas Orta',
  messages: [
    { role: 'user', author: 'Kadir', content: 'Bana bir özet yaz & tablo ekle' },
    { role: 'assistant', author: 'Atlas', content: SAMPLE }
  ]
}

describe('Markdown ayrıştırma', () => {
  it('satır içi biçimleri ayırır', () => {
    expect(parseInline('a **b** *c* `d` [e](https://x.y) f')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', code: true },
      { text: ' ' },
      { text: 'e', href: 'https://x.y' },
      { text: ' f' }
    ])
    // Kod içindeki yıldızlar biçim sayılmaz; http olmayan bağlantı adresi atılır.
    expect(parseInline('`a * b * c`')).toEqual([{ text: 'a * b * c', code: true }])
    expect(parseInline('[x](javascript:alert(1))')[0].href).toBeUndefined()
    expect(parseInline('2 * 3 * 4 = 24')).toEqual([{ text: '2 * 3 * 4 = 24' }])
  })

  it('blokları sırasıyla tanır', () => {
    const blocks = parseMarkdown(SAMPLE)
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'table', 'rule', 'paragraph'])
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false })
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true })
    const code = blocks[5] as { text: string }
    expect(code.text).toBe('SELECT TOP 5 * FROM [Musteri] WHERE a < 3 & b > 1')
    const table = blocks[6] as { rows: unknown[][] }
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toHaveLength(2)
  })

  it('kapanmamış kod bloğunda ve boş metinde takılmaz', () => {
    expect(parseMarkdown('```\nyarım')).toEqual([{ type: 'code', text: 'yarım' }])
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })
})

describe('dışa aktarma', () => {
  it('Markdown dosyası başlık ve yazarlarla kurulur', () => {
    const md = toMarkdown(doc)
    expect(md.startsWith('# Bütçe <planı>\n\n_11 Kasım 2026, Atlas Orta_\n\n## Kadir\n\n')).toBe(true)
    expect(md).toContain('## Atlas\n\n# Başlık')
  })

  it('HTML özel karakterleri kaçırır ve betik çalıştırmaz', () => {
    const html = toHtml({ ...doc, messages: [{ role: 'user', author: 'A', content: '<script>alert(1)</script> & "x"' }] })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<h1>Bütçe &lt;planı&gt;</h1>')
    const full = toHtml(doc)
    expect(full).toContain('<strong>kalın</strong>')
    expect(full).toContain('<a href="https://example.com">bağlantı</a>')
    expect(full).toContain('<th>Ad</th>')
    expect(full).toContain('a &lt; 3 &amp; b &gt; 1')
  })

  it('Word gövdesi geçerli XML karakterleri içerir ve numaralı listeyi yeniden başlatır', () => {
    const { xml, orderedLists } = docxBody(doc)
    expect(orderedLists).toBe(1)
    expect(xml).toContain('Bütçe &lt;planı&gt;')
    expect(xml).toContain('özet yaz &amp; tablo ekle')
    expect(xml).toContain('<w:numId w:val="1"/>')
    expect(xml).toContain('<w:numId w:val="3"/>')
    expect(xml).not.toContain('<w:numId w:val="2"/>')
    expect(xml).toContain('<w:tbl>')
    // Açılan her paragraf kapanır.
    expect(xml.match(/<w:p>|<w:p\/>/g)!.length).toBeGreaterThan(8)
    expect((xml.match(/<w:p>/g) ?? []).length).toBe((xml.match(/<\/w:p>/g) ?? []).length)
    expect(docxBody({ ...doc, messages: [{ role: 'user', author: 'A', content: 'a\u0001b' }] }).xml).toContain('>ab<')
  })

  it('Word dosyası açılabilir bir zip olarak üretilir', async () => {
    const buffer = await toDocx(doc)
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    const zip = await JSZip.loadAsync(buffer)
    expect(Object.keys(zip.files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/', '_rels/.rels', 'word/', 'word/_rels/', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml'].sort()
    )
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Son paragraf.')
    expect(await zip.file('word/numbering.xml')!.async('string')).toContain('w:numId="3"')
  })

  it('dosya adını temizler', () => {
    expect(safeFileName('Rapor: 2026/11 "taslak"?')).toBe('Rapor 2026 11 taslak')
    expect(safeFileName('  ...  ')).toBe('Atlas')
    expect(safeFileName('a'.repeat(200))).toHaveLength(80)
  })
})

describe('panel talimatları', () => {
  it('hazır işlemler metni talimatın içine koyar', () => {
    const [system, user] = buildPanelMessages('fix', '  bende geliyorum  ', undefined, 'tr', 'ATLAS')
    expect(system.content).toContain('Yalnızca sonucu yaz')
    expect(user.content).toContain('yazım ve noktalama hatalarını düzelt')
    expect(user.content.endsWith('bende geliyorum')).toBe(true)
    expect(buildPanelMessages('translate', 'hello', undefined, 'en', 'ATLAS')[1].content).toContain('translate it into Turkish')
  })

  it('soru modunda Atlas kişiliği kullanılır, özel istekte kullanıcının talimatı', () => {
    expect(buildPanelMessages('ask', 'Saat kaç?', undefined, 'tr', 'ATLAS')).toEqual([
      { role: 'system', content: 'ATLAS' },
      { role: 'user', content: 'Saat kaç?' }
    ])
    expect(buildPanelMessages('custom', 'metin', 'daha samimi yaz', 'tr', 'ATLAS')[1].content).toBe('daha samimi yaz\n\nMetin:\nmetin')
  })

  it('boş metni reddeder, çok uzun metni keser', () => {
    expect(() => buildPanelMessages('fix', '   ', undefined, 'tr', 'A')).toThrow()
    const long = buildPanelMessages('ask', 'x'.repeat(PANEL_TEXT_LIMIT + 500), undefined, 'tr', 'A')[1].content
    expect(long).toHaveLength(PANEL_TEXT_LIMIT)
    expect(panelTemperature('fix')).toBe(0.2)
    expect(panelTemperature('ask')).toBeUndefined()
  })
})

describe('güncellemeyi indirme', () => {
  const release = (asset: Record<string, unknown>) => ({ assets: [{ name: 'notlar.txt', browser_download_url: 'https://github.com/kadirify/atlas/releases/download/v1/notlar.txt', size: 5 }, asset] })
  const good = {
    name: 'Atlas Setup 0.2.0.exe',
    browser_download_url: 'https://github.com/kadirify/atlas/releases/download/v0.2.0/Atlas.Setup.0.2.0.exe',
    size: 11
  }

  it('yalnızca kendi deposundaki kurulum dosyasını seçer', () => {
    expect(pickAsset(release(good), 'win32')).toEqual({ name: good.name, url: good.browser_download_url, size: 11, sha256: null })
    expect(pickAsset(release({ ...good, digest: 'sha256:' + 'AB'.repeat(32) }), 'win32')?.sha256).toBe('ab'.repeat(32))
    expect(pickAsset(release({ ...good, browser_download_url: 'https://evil.example/Atlas.exe' }), 'win32')).toBeNull()
    expect(pickAsset(release({ ...good, browser_download_url: 'https://github.com/baskasi/atlas/releases/download/v1/a.exe' }), 'win32')).toBeNull()
    expect(pickAsset(release({ ...good, name: '..\\..\\kotu.exe' }), 'win32')).toBeNull()
    expect(pickAsset(release({ ...good, size: 0 }), 'win32')).toBeNull()
    expect(pickAsset(release(good), 'linux')).toBeNull()
    expect(pickAsset(null, 'win32')).toBeNull()
  })

  const body = Buffer.from('hello world')
  const asset = (over: Partial<UpdateAsset> = {}): UpdateAsset => ({
    version: '0.2.0',
    name: 'Atlas Setup 0.2.0.exe',
    url: good.browser_download_url,
    size: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
    notes: '',
    ...over
  })
  const serve = (): void => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
  }

  it('dosyayı indirir, boyutunu ve özetini denetler', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-gunc-'))
    try {
      serve()
      const progress: number[] = []
      const file = await downloadUpdate(dir, (p) => progress.push(p.percent), asset())
      expect(readFileSync(file).toString()).toBe('hello world')
      expect(progress.at(-1)).toBe(100)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('özet ya da boyut tutmazsa dosyayı siler ve hata verir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-gunc-'))
    try {
      serve()
      await expect(downloadUpdate(dir, () => {}, asset({ sha256: '0'.repeat(64) }))).rejects.toThrow('bozuk')
      serve()
      await expect(downloadUpdate(dir, () => {}, asset({ size: 999, sha256: null }))).rejects.toThrow('bozuk')
      expect(existsSync(join(dir, 'atlas-update', 'Atlas Setup 0.2.0.exe'))).toBe(false)
      vi.stubGlobal('fetch', vi.fn(async () => new Response('yok', { status: 404 })))
      await expect(downloadUpdate(dir, () => {}, asset())).rejects.toThrow('indirilemedi')
      await expect(downloadUpdate(dir, () => {}, null)).rejects.toThrow('Kurulacak bir güncelleme yok')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('belge paneli', () => {
  it('düz metin belgede her satır ayrı paragraftır, yazar başlığı yazılmaz', () => {
    const cv = 'Kadir Örnek\nYazılım Geliştirici\n\n- Node.js\n- React\nİstanbul'
    expect(parseMarkdown(cv).map((b) => b.type)).toEqual(['paragraph', 'list', 'paragraph'])
    expect(parseMarkdown(cv, true).map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'list', 'paragraph'])
    const plain: ExportDocument = { title: 'CV', subtitle: '', lineParagraphs: true, messages: [{ role: 'assistant', author: '', content: cv }] }
    const html = toHtml(plain)
    expect(html).toContain('<p>Kadir Örnek</p><p>Yazılım Geliştirici</p>')
    expect(html).not.toContain('class="who"')
    expect(html).not.toContain('class="sub"')
    expect(docxBody(plain).xml).not.toContain('Heading1')
    expect(toMarkdown(plain)).toBe('# CV\n\n' + cv + '\n')
  })
})
