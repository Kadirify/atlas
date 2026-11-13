import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOllamaSignature, lastSignatureError, readSignature, subjectFields } from '../src/main/services/signature'

/** Ollama'nın Windows programlarındaki gerçek sertifika sahibi biçimi */
const OLLAMA_SUBJECT = 'CN=Ollama Inc., O=Ollama Inc., L=Toronto, S=Ontario, C=CA, SERIALNUMBER=2713355, OID.2.5.4.15=Private Organization'

describe('subjectFields', () => {
  it('sertifika sahibini alanlarına ayırır; tırnak içindeki virgül alanı bölmez', () => {
    const fields = subjectFields('CN="Örnek, Ltd.", O="Örnek ""Yazılım"", A.Ş.", L=Ankara, C=TR')
    expect(fields.get('CN')).toBe('Örnek, Ltd.')
    expect(fields.get('O')).toBe('Örnek "Yazılım", A.Ş.')
    expect(fields.get('L')).toBe('Ankara')
    expect(subjectFields('').size).toBe(0)
    // Aynı alan iki kez geçerse ilki geçerlidir.
    expect(subjectFields('O=Bir, O=İki').get('O')).toBe('Bir')
  })
})

describe('isOllamaSignature', () => {
  it("geçerli ve Ollama'ya ait imzayı kabul eder", () => {
    expect(isOllamaSignature({ status: 'Valid', subject: OLLAMA_SUBJECT })).toBe(true)
    expect(isOllamaSignature({ status: 'Valid', subject: 'CN=Ollama, O="Ollama, Inc.", C=US' })).toBe(true)
  })

  it('geçersiz imzayı, imzasız dosyayı ve başka kuruluşu reddeder', () => {
    expect(isOllamaSignature(null)).toBe(false)
    for (const status of ['NotSigned', 'HashMismatch', 'NotTrusted', 'UnknownError', 'valid', '']) {
      expect(isOllamaSignature({ status, subject: OLLAMA_SUBJECT }), status).toBe(false)
    }
    for (const subject of [
      '',
      'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
      'CN=Ollama Inc., O=Baska Sirket Ltd., C=US',
      'CN=Ollama Inc.',
      'O=Ollama Incorporated Fake',
      // Adının içine ", O=Ollama Inc." yazılmış sertifika Ollama sayılmaz.
      'CN="Sahte, O=Ollama Inc.", O=Sahte Ltd., C=US',
      'O=Sahte Ltd., O=Ollama Inc.'
    ]) {
      expect(isOllamaSignature({ status: 'Valid', subject }), subject).toBe(false)
    }
  })
})

describe.skipIf(process.platform !== 'win32')('readSignature (Windows)', () => {
  it("Windows'un kendi programının imzasını geçerli okur ama Ollama saymaz", async () => {
    const signature = await readSignature(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'notepad.exe'))
    expect(signature?.status, lastSignatureError()).toBe('Valid')
    expect(signature?.subject).toContain('Microsoft')
    expect(isOllamaSignature(signature)).toBe(false)
  }, 60_000)

  it('imzasız dosyayı, adında tırnak ve boşluk olsa da geçerli saymaz; olmayan dosyada null döner', async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-imza-'deneme -"))
    try {
      const file = join(dir, "kurulum 'sahte'.exe")
      await writeFile(file, Buffer.from('MZ bu gerçek bir program değil'))
      const signature = await readSignature(file)
      // Windows bozuk ya da imzasız dosya için "NotSigned" ya da "UnknownError" der; önemli olan "Valid" dememesi.
      expect(signature, lastSignatureError()).not.toBeNull()
      expect(signature?.status).not.toBe('Valid')
      expect(signature?.subject).toBe('')
      expect(isOllamaSignature(signature)).toBe(false)
      expect(await readSignature(join(dir, 'yok.exe'))).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
