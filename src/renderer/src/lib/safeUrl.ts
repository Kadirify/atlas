import { defaultUrlTransform } from 'react-markdown'

/**
 * Model çıktısındaki resimler yalnızca bilgisayardaki veriden (data:, blob:) gösterilir. Uzak adresli bir resim
 * (http, //sunucu, \\sunucu, file:) çizilseydi, model ya da belge içeriği uygulamaya dışarıya istek attırabilir,
 * Windows paylaşım adresinde oturum özeti gönderebilirdi.
 */
export function isSafeImage(src: unknown): src is string {
  return typeof src === 'string' && /^(?:data:image\/|blob:)/i.test(src)
}

/** Bağlantılar yalnızca web ve e-posta adreslerine gider; dosya ve paylaşım adresleri düz metin kalır. */
export function isSafeLink(href: unknown): href is string {
  return typeof href === 'string' && /^(?:https?:\/\/|mailto:|#)/i.test(href)
}

/** react-markdown'ın adres süzgeci: resimlerde yalnızca yerel veri, öteki adreslerde kütüphanenin kendi kuralı. */
export function markdownUrlTransform(url: string, key: string, node: { tagName?: string }): string {
  if (key === 'src' && node.tagName === 'img') return isSafeImage(url) ? url : ''
  return defaultUrlTransform(url)
}
