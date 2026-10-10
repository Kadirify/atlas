/**
 * Kod alanında tercih edilen modeller, sırayla. Ajan test setinde (eval/ajan) Atlas Strong kod alanında en başarılı
 * ve en hızlı model çıktı; Atlas Code araçları sık düz metin olarak yazıyor ve 12 GB karta tam sığmıyor.
 * Adlar yayımlanmış ("kadirify/atlas-strong") ya da yerel ("atlas-guclu:latest") olabilir.
 */
export const CODE_MODEL_ORDER = [/(?:^|\/)atlas-(?:strong|guclu)\b/, /(?:^|\/)atlas-code\b/, /(?:^|\/)atlas-(?:medium|orta)\b/]

/** Kurulu modellerden kod alanında kullanılacak olan; hiçbiri yoksa null (sohbet varsayılan modelle açılır) */
export function pickCodeModel(installed: string[]): string | null {
  for (const pattern of CODE_MODEL_ORDER) {
    const found = installed.find((name) => pattern.test(name))
    if (found) return found
  }
  return null
}

/** Kod işleri için önerilen modellerden (Atlas Strong ya da Atlas Code) biri kurulu mu */
export function hasCodeModel(installed: string[]): boolean {
  return installed.some((name) => CODE_MODEL_ORDER[0].test(name) || CODE_MODEL_ORDER[1].test(name))
}
