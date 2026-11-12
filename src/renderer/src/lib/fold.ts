/**
 * Aramada büyük-küçük harf farkını kaldırır: Türkçe kurallarıyla küçültür, sonra "ı"yı "i" sayar.
 * Böylece "api" araması "API"yi, "isik" araması "IŞIK"ı da bulur (Türkçe küçültmede "I" → "ı" olduğu için
 * yalnızca küçültmek yetmez). Uzunluk hiç değişmez; metindeki konumlar (vurgulama aralıkları) kaymaz.
 */
export function fold(text: string): string {
  let lower = text.toLocaleLowerCase('tr')
  if (lower.length !== text.length) {
    // Bazı harfler küçülünce iki karaktere açılır; onlar olduğu gibi bırakılır ki konumlar kaymasın.
    lower = Array.from(text, (ch) => {
      const l = ch.toLocaleLowerCase('tr')
      return l.length === ch.length ? l : ch
    }).join('')
  }
  return lower.replace(/ı/g, 'i')
}
