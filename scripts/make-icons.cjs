// resources/logo.svg dosyasından uygulama ikonlarını üretir.
// Çalıştırma: npm run icons
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'resources', 'logo.svg'), 'utf8')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ALL_SIZES = [...ICO_SIZES, 512]

/** PNG'leri tek bir .ico dosyasında toplar (Windows PNG gömülü ikonları destekler). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')

  const dataUrls = await win.webContents.executeJavaScript(`
    (async () => {
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
      await img.decode()
      return ${JSON.stringify(ALL_SIZES)}.map((size) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        canvas.getContext('2d').drawImage(img, 0, 0, size, size)
        return canvas.toDataURL('image/png')
      })
    })()
  `)

  const images = ALL_SIZES.map((size, i) => ({
    size,
    png: Buffer.from(dataUrls[i].split(',')[1], 'base64')
  }))
  const bySize = (size) => images.find((i) => i.size === size).png

  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), bySize(512))
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), buildIco(images.filter((i) => ICO_SIZES.includes(i.size))))
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), bySize(256))
  console.log('İkonlar üretildi: build/icon.png, build/icon.ico, resources/icon.png')
  app.quit()
})
