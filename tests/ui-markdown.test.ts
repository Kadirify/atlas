import { createElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { isSafeImage, isSafeLink, markdownUrlTransform } from '../src/renderer/src/lib/safeUrl'

/** Sohbetteki Markdown bileşeniyle aynı adres süzgeci; resimler süzgeçten geçemezse src boş kalır. */
const html = (text: string): string => renderToStaticMarkup(createElement(ReactMarkdown, { urlTransform: markdownUrlTransform }, text))

describe('model çıktısındaki resimler ve bağlantılar', () => {
  it('uzak adresli resimlere izin verilmez', () => {
    for (const src of ['http://example.com/a.png', 'https://example.com/a.png', '//sunucu/pay/a.png', '\\\\sunucu\\pay\\a.png', 'file:///C:/a.png']) {
      expect(isSafeImage(src), src).toBe(false)
      expect(markdownUrlTransform(src, 'src', { tagName: 'img' }), src).toBe('')
    }
    expect(html('![gizli](https://example.com/a.png)')).not.toContain('example.com')
  })

  it('bilgisayardaki veriden gelen resimler çizilir', () => {
    expect(isSafeImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeImage('blob:file:///4f1c')).toBe(true)
    expect(html('![nokta](data:image/png;base64,iVBORw0KGgo=)')).toContain('src="data:image/png;base64,iVBORw0KGgo="')
  })

  it('yalnızca web ve e-posta bağlantıları tıklanabilir', () => {
    expect(isSafeLink('https://example.com')).toBe(true)
    expect(isSafeLink('mailto:a@example.com')).toBe(true)
    for (const href of ['file:///C:/Windows', '//sunucu/pay', '\\\\sunucu\\pay', 'javascript:alert(1)', undefined]) {
      expect(isSafeLink(href), String(href)).toBe(false)
    }
  })
})
