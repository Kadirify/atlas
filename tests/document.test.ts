import { deflateRawSync } from 'node:zlib'
import JSZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'
import { setLanguage } from '../src/main/i18n'
import { extractText } from '../src/main/services/attachments'
import { stopDocumentWorker } from '../src/main/services/documentRunner'
import { zipUnpackedSize } from '../src/main/workers/document'

afterAll(() => stopDocumentWorker())

/** Tek dosyalı en küçük ZIP: içerik zlib ile sıkıştırılır, merkez dizin gerçek boyutları bildirir. */
function zipOf(name: string, content: Buffer): Buffer {
  const data = deflateRawSync(content, { level: 9 })
  const fileName = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(fileName.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(fileName.length, 28)
  const centralOffset = local.length + fileName.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + fileName.length, 12)
  end.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([local, fileName, data, central, fileName, end])
}

describe('belge okuma ayrı süreçte', () => {
  it('ZIP içeriğinin açılmış boyutunu merkez dizinden okur', async () => {
    const zip = new JSZip()
    zip.file('a.txt', 'x'.repeat(1000))
    zip.file('b/c.xml', 'y'.repeat(2500))
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(zipUnpackedSize(bytes)).toBe(3500)
    expect(zipUnpackedSize(Buffer.from('zip değil'))).toBeNull()
  })

  it('açılınca çok büyüyen belge (sıkıştırma bombası) açılmadan reddedilir, uygulama donmaz', async () => {
    setLanguage('tr')
    // 250 MB'lık içerik birkaç yüz KB'a sıkışır.
    const bomb = zipOf('word/document.xml', Buffer.alloc(250 * 1024 * 1024, 0x61))
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024)
    let ticks = 0
    const ticker = setInterval(() => ticks++, 20)
    const started = Date.now()
    const error = await extractText('rapor.docx', bomb).catch((e: unknown) => e)
    clearInterval(ticker)
    expect(String(error)).toMatch(/açıldığında 250 MB tutuyor/)
    expect(String(error)).toMatch(/en çok 200 MB/)
    expect(Date.now() - started).toBeLessThan(5000)
    // Ana süreç boş kaldı: zamanlayıcı aksamadan döndü.
    expect(ticks).toBeGreaterThan((Date.now() - started) / 20 / 3)
  }, 30_000)

  it('bozuk belge süreci düşürmez; sonraki belge yine okunur', async () => {
    setLanguage('tr')
    await expect(extractText('bozuk.docx', zipOf('word/document.xml', Buffer.from('<w:document><bozuk')))).rejects.toThrow(/okunamadı/)
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
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Sağlam belge</w:t></w:r></w:p></w:body></w:document>'
    )
    expect(await extractText('saglam.docx', await zip.generateAsync({ type: 'nodebuffer' }))).toContain('Sağlam belge')
  }, 30_000)
})
