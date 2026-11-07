// electron-builder her paketten önce lisans bildirimini yeniden üretir: hangi komutla derlenirse derlensin kurulum
// dosyasına güncel bildirim girer. Lisansı uygun olmayan bir paket varsa derleme durur.
const { main } = require('./make-notices.cjs')

exports.default = async function beforePack() {
  main()
}
