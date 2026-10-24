/**
 * Tablo sonucunu ayraçla ayrılmış metne çevirir: CSV için "," ya da ";", panoya kopyalamak için sekme.
 *
 * decimalComma: sayılar ondalık virgülle yazılır. Türkçe Excel "12.5" değerini tarih sanar; ";" ayraçlı dosyada
 * ondalık virgül bekler.
 *
 * Excel'in formül diye çalıştıracağı metin hücrelerinin (=, + ya da @ ile, ya da ardından sayı gelmeyen - ile
 * başlayanlar) başına tek tırnak konur: veritabanından gelen bir metin açılınca formül olarak çalışmasın.
 */
export function toDelimited(columns: string[], rows: (string | number | null)[][], separator: string, decimalComma = false): string {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return ''
    let text = typeof value === 'number' && decimalComma ? String(value).replace('.', ',') : String(value)
    if (typeof value !== 'number' && /^(?:[=+@\t\r]|-(?![\d.,]))/.test(text)) text = `'${text}`
    return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [columns, ...rows].map((row) => row.map(cell).join(separator)).join('\r\n')
}
