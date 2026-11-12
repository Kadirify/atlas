import JSZip from 'jszip'

/** Dışa aktarılacak bir mesaj */
export interface ExportMessage {
  /** Ekranda görünecek ad: "Sen", "Atlas" ya da kişiliğin adı */
  author: string
  role: 'user' | 'assistant'
  content: string
}

export interface ExportDocument {
  title: string
  /** Başlığın altındaki küçük satır: tarih ve model */
  subtitle: string
  messages: ExportMessage[]
  /**
   * Dosyadan okunmuş düz metin: her satır ayrı paragraftır (satırlar birleştirilmez).
   * Sohbet cevaplarında kapalıdır; orada art arda satırlar tek paragraf sayılır.
   */
  lineParagraphs?: boolean
}

// --- Markdown'ı bloklara ayırma ---

export interface Inline {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

export type Block =
  | { type: 'heading'; level: number; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'quote'; inlines: Inline[] }
  | { type: 'table'; rows: Inline[][][] }
  | { type: 'rule' }

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\([^)\s]+\))/

/** Satır içi biçimleri (kalın, italik, kod, bağlantı) ayırır. */
export function parseInline(text: string, inherited: Omit<Inline, 'text'> = {}): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const m = INLINE.exec(rest)
    if (!m) {
      out.push({ ...inherited, text: rest })
      break
    }
    if (m.index > 0) out.push({ ...inherited, text: rest.slice(0, m.index) })
    const token = m[0]
    if (m[1]) out.push({ ...inherited, text: token.slice(1, -1), code: true })
    else if (m[2]) out.push(...parseInline(token.slice(2, -2), { ...inherited, bold: true }))
    else if (m[3]) out.push(...parseInline(token.slice(1, -1), { ...inherited, italic: true }))
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!
      out.push({ ...inherited, text: link[1], href: /^https?:\/\//i.test(link[2]) ? link[2] : undefined })
    }
    rest = rest.slice(m.index + token.length)
  }
  return out.filter((i) => i.text)
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function tableCells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()))
}

/** Modelin yazdığı Markdown'ı basit bloklara ayırır: başlık, paragraf, liste, kod, alıntı, tablo. */
export function parseMarkdown(text: string, lineParagraphs = false): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inlines: parseInline(heading[2].replace(/\s+#+\s*$/, '')) })
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const rows = [tableCells(line)]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(tableCells(lines[i++]))
      blocks.push({ type: 'table', rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ type: 'quote', inlines: parseInline(body.join(' ')) })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      const ordered = !!item[2]
      const items: Inline[][] = []
      while (i < lines.length) {
        const next = LIST_ITEM.exec(lines[i])
        if (next && !!next[2] === ordered) items.push(parseInline(next[3]))
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          // Girintili devam satırı önceki maddeye eklenir.
          items[items.length - 1].push(...parseInline(' ' + lines[i].trim()))
        } else break
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const body: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]))
    ) {
      body.push(lines[i++].trim())
      if (lineParagraphs) break
    }
    blocks.push({ type: 'paragraph', inlines: parseInline(body.join(' ')) })
  }
  return blocks
}

// --- Markdown dosyası ---

export function toMarkdown(doc: ExportDocument): string {
  const parts = [`# ${doc.title}`, ...(doc.subtitle ? [`_${doc.subtitle}_`] : [])]
  for (const m of doc.messages) parts.push(...(m.author ? [`## ${m.author}`] : []), m.content.trim())
  return parts.join('\n\n') + '\n'
}

// --- HTML (PDF için) ---

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inlineHtml(inlines: Inline[]): string {
  return inlines
    .map((i) => {
      let html = escapeHtml(i.text)
      if (i.code) html = `<code>${html}</code>`
      if (i.bold) html = `<strong>${html}</strong>`
      if (i.italic) html = `<em>${html}</em>`
      if (i.href) html = `<a href="${escapeHtml(i.href)}">${html}</a>`
      return html
    })
    .join('')
}

function blockHtml(block: Block): string {
  switch (block.type) {
    case 'heading': {
      // Mesaj içindeki başlıklar belge başlığının altında kalsın.
      const level = Math.min(6, block.level + 2)
      return `<h${level}>${inlineHtml(block.inlines)}</h${level}>`
    }
    case 'paragraph':
      return `<p>${inlineHtml(block.inlines)}</p>`
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`
    }
    case 'code':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`
    case 'quote':
      return `<blockquote>${inlineHtml(block.inlines)}</blockquote>`
    case 'table':
      return `<table>${block.rows
        .map((row, r) => `<tr>${row.map((cell) => `<${r === 0 ? 'th' : 'td'}>${inlineHtml(cell)}</${r === 0 ? 'th' : 'td'}>`).join('')}</tr>`)
        .join('')}</table>`
    case 'rule':
      return '<hr>'
  }
}

const PRINT_CSS = `
  @page { margin: 20mm 18mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a2030; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  .sub { color: #5d667a; font-size: 9.5pt; margin: 0 0 18pt; }
  .msg { margin: 0 0 14pt; }
  .who { font-weight: 600; font-size: 9.5pt; color: #2443b8; margin: 0 0 3pt; break-after: avoid; }
  .user .who { color: #5d667a; }
  .user .body { background: #f1f3f8; border-radius: 6pt; padding: 6pt 9pt; }
  p { margin: 0 0 7pt; }
  h3, h4, h5, h6 { margin: 10pt 0 4pt; break-after: avoid; }
  h3 { font-size: 13pt; } h4 { font-size: 12pt; } h5, h6 { font-size: 11pt; }
  ul, ol { margin: 0 0 7pt; padding-left: 18pt; }
  pre { background: #f1f3f8; border-radius: 5pt; padding: 7pt 9pt; font-size: 9.5pt; white-space: pre-wrap; word-break: break-word; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 0.92em; background: #f1f3f8; padding: 0 2pt; border-radius: 2pt; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0 0 7pt; padding-left: 9pt; border-left: 2.5pt solid #c9d1e3; color: #3a4256; }
  table { border-collapse: collapse; margin: 0 0 8pt; font-size: 10pt; }
  th, td { border: 0.75pt solid #c9d1e3; padding: 3pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f1f3f8; }
  a { color: #2443b8; }
  hr { border: 0; border-top: 0.75pt solid #c9d1e3; margin: 9pt 0; }
`

export function toHtml(doc: ExportDocument): string {
  const body = doc.messages
    .map(
      (m) =>
        `<section class="msg ${m.author ? m.role : 'plain'}">${m.author ? `<p class="who">${escapeHtml(m.author)}</p>` : ''}<div class="body">${parseMarkdown(m.content, doc.lineParagraphs).map(blockHtml).join('')}</div></section>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>${PRINT_CSS}</style></head><body><h1>${escapeHtml(doc.title)}</h1>${doc.subtitle ? `<p class="sub">${escapeHtml(doc.subtitle)}</p>` : ''}${body}</body></html>`
}

// --- Word (.docx) ---

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // XML'de geçersiz denetim karakterleri Word'ün dosyayı açmasını engeller.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

interface RunStyle {
  bold?: boolean
  color?: string
  size?: number
}

function run(inline: Inline, style: RunStyle = {}): string {
  const props = [
    inline.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
    inline.bold || style.bold ? '<w:b/>' : '',
    inline.italic ? '<w:i/>' : '',
    inline.href ? '<w:color w:val="2443B8"/><w:u w:val="single"/>' : style.color ? `<w:color w:val="${style.color}"/>` : '',
    style.size ? `<w:sz w:val="${style.size}"/>` : ''
  ].join('')
  // Satır sonları Word'de ayrı öğedir.
  const text = inline.text
    .split('\n')
    .map((part) => `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
    .join('<w:br/>')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${text}</w:r>`
}

function paragraph(inlines: Inline[], props = '', style: RunStyle = {}): string {
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inlines.map((i) => run(i, style)).join('')}</w:p>`
}

const SHADE = '<w:shd w:val="clear" w:color="auto" w:fill="F1F3F8"/>'

function blockDocx(block: Block): string {
  switch (block.type) {
    case 'heading':
      return paragraph(block.inlines, `<w:pStyle w:val="Heading${Math.min(4, block.level + 1)}"/>`)
    case 'paragraph':
      return paragraph(block.inlines)
    case 'list':
      return block.items
        .map((item) => paragraph(item, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${block.ordered ? 2 : 1}"/></w:numPr>`))
        .join('')
    case 'code':
      return paragraph([{ text: block.text, code: true }], `${SHADE}<w:spacing w:after="120"/>`, { size: 19 })
    case 'quote':
      return paragraph(block.inlines, '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9D1E3"/></w:pBdr><w:ind w:left="240"/>', {
        color: '3A4256'
      })
    case 'table': {
      const border = (side: string): string => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9D1E3"/>`
      const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')
      const rows = block.rows
        .map(
          (row, r) =>
            `<w:tr>${row
              .map((cell) => `<w:tc><w:tcPr>${r === 0 ? SHADE : ''}</w:tcPr>${paragraph(cell, '<w:spacing w:after="0"/>', { bold: r === 0 })}</w:tc>`)
              .join('')}</w:tr>`
        )
        .join('')
      return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${rows}</w:tbl><w:p/>`
    }
    case 'rule':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9D1E3"/></w:pBdr></w:pPr></w:p>'
  }
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="tr-TR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2443B8"/><w:sz w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="60"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style>
</w:styles>`

const level = (format: string, text: string): string =>
  `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="300"/></w:pPr></w:lvl>`

/** Numaralı listeler her seferinde 1'den başlasın diye her liste kendi numaralandırmasını alır. */
function numbering(orderedLists: number): string {
  const nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>', '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>']
  for (let n = 0; n < orderedLists; n++) {
    nums.push(
      `<w:num w:numId="${n + 3}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`
    )
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${level('bullet', '•')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${level('decimal', '%1.')}</w:abstractNum>${nums.join('')}</w:numbering>`
}

/** Belgenin gövdesi (document.xml). Ayrı tutulur ki testler zip açmadan içeriğe bakabilsin. */
export function docxBody(doc: ExportDocument): { xml: string; orderedLists: number } {
  let orderedLists = 0
  const parts = [
    paragraph([{ text: doc.title }], '<w:pStyle w:val="Title"/>'),
    ...(doc.subtitle ? [paragraph([{ text: doc.subtitle }], '<w:spacing w:after="240"/>', { color: '5D667A', size: 19 })] : [])
  ]
  for (const m of doc.messages) {
    if (m.author) parts.push(paragraph([{ text: m.author }], '<w:pStyle w:val="Heading1"/>', m.role === 'user' ? { color: '5D667A' } : {}))
    for (const block of parseMarkdown(m.content, doc.lineParagraphs)) {
      let xml = blockDocx(block)
      if (block.type === 'list' && block.ordered) {
        xml = xml.replaceAll('<w:numId w:val="2"/>', `<w:numId w:val="${orderedLists + 3}"/>`)
        orderedLists++
      }
      parts.push(xml)
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1304" w:bottom="1417" w:left="1304" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  return { xml, orderedLists }
}

export async function toDocx(doc: ExportDocument): Promise<Buffer> {
  const { xml, orderedLists } = docxBody(doc)
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`
  )
  zip.file('word/document.xml', xml)
  zip.file('word/styles.xml', STYLES)
  zip.file('word/numbering.xml', numbering(orderedLists))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** Dosya adında kullanılamayan karakterleri temizler. */
export function safeFileName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned.slice(0, 80) || 'Atlas'
}
