import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ATTACHMENT_CHAR_BUDGET, Db } from '../src/main/db'
import { setLanguage } from '../src/main/i18n'
import { addAttachment, attachmentsBlock, extractText } from '../src/main/services/attachments'

afterEach(() => setLanguage('tr'))

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

/** İçinde tek satır yazı olan en küçük geçerli PDF. */
function tinyPdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    (() => {
      const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    })(),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

async function tinyDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function tinyXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Bütçe')
  sheet.addRow(['Kalem', 'Tutar'])
  sheet.addRow(['Sunucu', 12500])
  sheet.addRow(['Lisans', 4300])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('extractText', () => {
  it('düz metin ve kod dosyalarını okur', async () => {
    expect(await extractText('not.txt', Buffer.from('Merhaba dünya, şöyle böyle'))).toBe('Merhaba dünya, şöyle böyle')
    expect(await extractText('veri.csv', Buffer.from('ad;yaş\nAli;30'))).toContain('Ali;30')
    expect(await extractText('uzantisiz', Buffer.from('uzantısı olmayan metin'))).toContain('uzantısı olmayan')
  })

  it('UTF-16 ve eski Türkçe Windows kodlamasını çözer', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Çağrı İğde', 'utf16le')])
    expect(await extractText('a.txt', utf16)).toContain('Çağrı İğde')
    // "şğı" harfleri windows-1254 ile: ş=0xFE ğ=0xF0 ı=0xFD
    expect(await extractText('b.txt', Buffer.from([0xfe, 0xf0, 0xfd]))).toBe('şğı')
  })

  it('PDF, Word ve Excel dosyalarının metnini çıkarır', async () => {
    expect(await extractText('belge.pdf', tinyPdf('Merhaba PDF'))).toContain('Merhaba PDF')
    expect(await extractText('belge.docx', await tinyDocx(['Birinci paragraf', 'İkinci paragraf']))).toMatch(
      /Birinci paragraf\s+İkinci paragraf/
    )
    const sheet = await extractText('tablo.xlsx', await tinyXlsx())
    expect(sheet).toContain('Sayfa: Bütçe')
    expect(sheet).toContain('Sunucu | 12500')
  })

  it('okunamayan dosyalarda anlaşılır hata verir', async () => {
    const binary = Buffer.alloc(2048, 0)
    await expect(extractText('program.exe', binary)).rejects.toThrow(/desteklenmiyor/)
    await expect(extractText('eski.doc', binary)).rejects.toThrow(/docx/)
    await expect(extractText('bozuk.pdf', Buffer.from('bu bir pdf değil'))).rejects.toThrow(/okunamadı/)
  })
})

describe('addAttachment', () => {
  let db: Db
  beforeEach(() => {
    db = new Db(':memory:')
  })

  it('metin dosyasını saklar ve uzun dosyayı kısaltılacak diye işaretler', async () => {
    const short = await addAttachment(db, 'kisa.txt', 'text/plain', toArrayBuffer(Buffer.from('kısa not')))
    expect(short).toMatchObject({ kind: 'text', name: 'kisa.txt', truncated: false, dataUrl: null })
    const long = await addAttachment(db, 'uzun.txt', 'text/plain', toArrayBuffer(Buffer.from('a'.repeat(ATTACHMENT_CHAR_BUDGET + 50))))
    expect(long.truncated).toBe(true)
  })

  it('resmi önizleme adresiyle saklar', async () => {
    const image = await addAttachment(db, 'foto.png', 'image/png', toArrayBuffer(Buffer.from([1, 2, 3, 4])))
    expect(image.kind).toBe('image')
    expect(image.dataUrl).toBe('data:image/png;base64,AQIDBA==')
  })

  it('boş ve metinsiz dosyaları reddeder', async () => {
    await expect(addAttachment(db, 'bos.txt', 'text/plain', new ArrayBuffer(0))).rejects.toThrow(/boş/)
    await expect(addAttachment(db, 'bosluk.txt', 'text/plain', toArrayBuffer(Buffer.from('   \n  ')))).rejects.toThrow(
      /okunabilir metin/
    )
  })

  it('ek mesaja bağlanır, mesajla listelenir, düzenlemede korunur, mesajla silinir', async () => {
    const c = db.createConversation(null)
    const file = await addAttachment(db, 'not.txt', 'text/plain', toArrayBuffer(Buffer.from('içerik')))
    const message = db.addMessage({ conversationId: c.id, role: 'user', content: 'bak' })
    db.attachToMessage([file.id], message.id)
    expect(db.listMessages(c.id)[0].attachments.map((a) => a.name)).toEqual(['not.txt'])

    const ids = db.detachFromMessage(message.id)
    db.deleteFrom(c.id, message.createdAt)
    const edited = db.addMessage({ conversationId: c.id, role: 'user', content: 'düzenlendi' })
    db.attachToMessage(ids, edited.id)
    expect(db.getMessage(edited.id)?.attachments).toHaveLength(1)

    db.deleteConversation(c.id)
    expect(db.getAttachment(file.id)).toBeNull()
  })

  it('gönderilmemiş ekleri temizler, gönderilmişlere dokunmaz', async () => {
    const c = db.createConversation(null)
    const sent = await addAttachment(db, 'a.txt', 'text/plain', toArrayBuffer(Buffer.from('a')))
    const pending = await addAttachment(db, 'b.txt', 'text/plain', toArrayBuffer(Buffer.from('b')))
    db.attachToMessage([sent.id], db.addMessage({ conversationId: c.id, role: 'user', content: 'x' }).id)
    db.deletePendingAttachment(sent.id)
    expect(db.getAttachment(sent.id)).not.toBeNull()
    db.purgePendingAttachments()
    expect(db.getAttachment(pending.id)).toBeNull()
    expect(db.getAttachment(sent.id)).not.toBeNull()
  })
})

describe('attachmentsBlock', () => {
  it('dosyaları adlarıyla verir, bütçeyi aşanı kısaltır ve bunu belirtir', () => {
    const block = attachmentsBlock(
      [
        { name: 'a.txt', kind: 'text', text: 'x'.repeat(80) },
        { name: 'foto.png', kind: 'image', text: '' },
        { name: 'b.txt', kind: 'text', text: 'y'.repeat(80) },
        { name: 'c.txt', kind: 'text', text: 'z'.repeat(80) }
      ],
      100
    )
    expect(block).toContain('[Ek dosya: a.txt]\n' + 'x'.repeat(80))
    expect(block).toContain('y'.repeat(20) + '\n(dosya uzun olduğu için yalnızca baş kısmı verildi)')
    expect(block).not.toContain('y'.repeat(21))
    expect(block).toContain('[Ek dosya: c.txt] (yer kalmadığı için içeriği verilmedi)')
    expect(block).not.toContain('foto.png')
  })
})

describe('İngilizce', () => {
  it('modele giden dosya notlarını İngilizce yazar', () => {
    setLanguage('en')
    const block = attachmentsBlock(
      [
        { name: 'a.txt', kind: 'text', text: 'x'.repeat(80) },
        { name: 'b.txt', kind: 'text', text: 'y'.repeat(80) },
        { name: 'c.txt', kind: 'text', text: 'z'.repeat(80) }
      ],
      100
    )
    expect(block).toContain('[Attached file: a.txt]\n' + 'x'.repeat(80) + '\n[End of file: a.txt]')
    expect(block).toContain('y'.repeat(20) + '\n(the file is long, so only the beginning is included)')
    expect(block).toContain('[Attached file: c.txt] (contents not included because there was no room left)')
    expect(block).not.toContain('Ek dosya')
  })

  it('dosya hatalarını İngilizce verir', async () => {
    setLanguage('en')
    const db = new Db(':memory:')
    await expect(addAttachment(db, 'bos.txt', 'text/plain', new ArrayBuffer(0))).rejects.toThrow('"bos.txt" is empty.')
    await expect(extractText('eski.doc', Buffer.from('abc'))).rejects.toThrow(/Save the file as \.docx/)
  })
})
