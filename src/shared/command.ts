/**
 * Komut güvenlik kuralı. Atlas bir proje klasöründe komut çalıştırmak isteyebilir (test, derleme, git durumu).
 * Her komut kullanıcı onayı ister; silen ya da geri alınamayacak biçimde yok eden komutlar ise hiç çalıştırılmaz.
 *
 * Bu bir yasak listesidir, kusursuz olamaz: onaylanan bir komutun çalıştırdığı dosyanın (bir test betiğinin) içinde
 * ne yaptığını bilemez. Asıl güvence onay kartıdır; bu kural bilinen silme yollarını ve onları gizleme hilelerini keser.
 */
export interface CommandVerdict {
  /** Atlas'ın çalıştıramayacağı bir komut mu */
  forbidden: boolean
  /** Yasak sayılmasına yol açan parça ("rm", "git reset --hard" ...) */
  reason: string
}

/** Bundan uzun komutlar incelenmeden reddedilir (uzun metinde kalıp aramak uygulamayı kilitleyebilir). */
/** Üstüne yazan yönlendirmenin (>) yasak nedeni; dosya araçları bu durumda modele başka bir yol gösterir */
export const OVERWRITE_REDIRECT = 'dosyanın üstüne yazan yönlendirme (>)'

const MAX_COMMAND_LENGTH = 2000

/** Tek başına bir kelime olarak geçtiğinde silme anlamına gelen komutlar */
const DELETE_WORDS = [
  'rm', 'rmdir', 'rd', 'del', 'erase', 'unlink', 'shred', 'mkfs', 'diskpart', 'fdisk', 'remove-item', 'ri',
  'clear-content', 'clc', 'clear-recyclebin', 'rimraf', 'trash', 'dropdb', 'cipher', 'sdelete', 'wipefs', 'truncate'
]

/**
 * Komut satırından kod çalıştıran ya da sistemi değiştiren araçlar. PowerShell de buradadır: takma adları ve kısaltılmış
 * parametreleri yüzünden güvenle süzülemez; Atlas komutları cmd.exe ile çalıştırır.
 */
const SCRIPT_HOSTS = ['powershell', 'pwsh', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32', 'certutil', 'bitsadmin', 'wmic', 'forfiles']

/** Birden çok kelimeden oluşan, veriyi ya da geçmişi yok eden kalıplar */
const DELETE_PATTERNS: [RegExp, string][] = [
  [/(?:^|[&|;]\s*)format(?:\.com)?\s+[a-z]:/i, 'format'],
  [/\bgit\b[^&|;\n]*\sclean\b/i, 'git clean'],
  [/\bgit\b[^&|;\n]*\sreset\b[^&|;\n]*\s--hard\b/i, 'git reset --hard'],
  [/\bgit\b[^&|;\n]*\spush\b[^&|;\n]*\s(?:--force\b|-f\b|--force-with-lease\b|--delete\b|-d\b|--mirror\b|--prune\b|\S+\s+\+?:)/i, 'git push (zorla ya da silerek)'],
  [/\bgit\b[^&|;\n]*\s(?:rm\b|branch\b[^&|;\n]*\s-[dD]\b|tag\b[^&|;\n]*\s-d\b|stash\s+(?:drop|clear)\b|checkout\b[^&|;\n]*\s(?:--(?:\s|$)|\.(?:\s|$)|-f\b|--force\b)|switch\b[^&|;\n]*\s(?:-f\b|--force\b|--discard-changes\b)|restore\b|reflog\s+(?:expire|delete)\b|gc\b[^&|;\n]*--prune|filter-branch\b|filter-repo\b|update-ref\b[^&|;\n]*\s-d\b|worktree\s+remove\b)/i, 'git (silen ya da değişiklikleri atan)'],
  [/\b(?:npm|pnpm|yarn)\b[^&|;\n]*\s(?:uninstall|remove|rm|un|prune|cache\s+clean)\b/i, 'paket kaldırma'],
  [/\b(?:pip|pip3)\s+uninstall\b/i, 'pip uninstall'],
  [/\b(?:docker|podman)\b[^&|;\n]*\s(?:rm|rmi|prune|down\b[^&|;\n]*\s-v)\b/i, 'docker (silen)'],
  [/\b(?:drop|truncate)\s+(?:table|database|schema|index|view)\b/i, 'DROP / TRUNCATE'],
  [/\bdelete\s+from\b/i, 'DELETE FROM'],
  // Satır içi kodda (node -e, python -c) dosya silen ya da üstüne yazan çağrılar
  [/\.(?:delete|deletefile|deletedirectory|unlink|unlinksync|rm|rmsync|rmdir|rmdirsync|rmtree|removedirs|remove|truncate|truncatesync|writefile|writefilesync|copyfile|copyfilesync|rename|renamesync)\s*\(/i, 'dosya silen ya da üstüne yazan kod'],
  [/\b(?:os\.remove|os\.unlink|os\.rmdir|shutil\.rmtree|shutil\.move)\b|\bopen\s*\([^)]*,\s*['"][wx]/i, 'dosya silen ya da üstüne yazan kod'],
  [/\[(?:system\.)?io\.(?:file|directory)\]::delete/i, 'dosya silen kod'],
  // Dosyanın üstüne yazan yönlendirme: "> dosya", "1>dosya", "nul>dosya". Ekleme (>>), "2>&1" ve "> nul" serbest.
  [/(?<![>\d&])\d?>(?![>&])\s*(?!(?:nul|\/dev\/null|\$null)\b)[^\s>&|]/i, OVERWRITE_REDIRECT],
  [/\b(?:mv|move|move-item|ren|rename|rename-item|cp|copy|copy-item|xcopy|robocopy)\b[^&|;\n]*\s(?:\/mir\b|\/purge\b|\/mov\b|\/move\b|-force\b|-f\b|\/y\b)/i, 'üstüne yazan taşıma ya da kopyalama'],
  [/\b(?:shutdown|reboot|restart-computer|stop-computer|taskkill|stop-process|kill|pkill|killall|reg\s+(?:delete|add|import)|sc\s+(?:delete|config|create)|net\s+(?:user|localgroup)|schtasks|vssadmin|bcdedit|takeown|icacls|attrib|chmod|chown|fsutil|setx)\b/i, 'sistemi değiştiren komut'],
  [/\b(?:iex|invoke-expression)\b/i, 'Invoke-Expression'],
  [/\b(?:curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^&|;\n]*\|\s*(?:sh|bash|cmd|powershell|pwsh|iex|node|python)/i, 'internetten indirip çalıştırma'],
  // cmd'nin değişken açma hileleri: "%windir:~0,0%rd", "set x=d && call r%x%", "!x!"
  [/%[^%\s]*:[~*][^%]*%|%[^%\s]*:[^%]*=[^%]*%/, 'gizlenmiş komut (değişken kırpma)'],
  [/\bcall\b[^&|;\n]*%|\bset\s+\w+=[^&|;\n]*(?:&|\|)[\s\S]*%\w+%|![a-z_][\w]*!|\/v:on\b|enabledelayedexpansion/i, 'gizlenmiş komut (değişkenle kurulan)']
]

/** Komut adlarının yazılışından cmd'nin yok saydığı kaçış işaretleri atılır: "r^d" → "rd", "r""d" → "rd". */
function plain(text: string): string {
  return text.replace(/\^(.)/g, '$1').replace(/""/g, '')
}

/** Bir komutun Atlas tarafından (onayla) çalıştırılabilir mi, yoksa yasak mı olduğuna karar verir. */
export function classifyCommand(command: string): CommandVerdict {
  const raw = command.trim()
  if (!raw) return { forbidden: true, reason: '' }
  if (raw.length > MAX_COMMAND_LENGTH) return { forbidden: true, reason: 'çok uzun komut' }
  const text = plain(raw)
  // Komut adları: satır başı, boru, && / ||, noktalı virgül ya da parantezden sonra gelen ilk kelimeler ve bunların
  // "cmd /c", "sudo", "npx" gibi sarmalayıcılardan sonraki halleri.
  const words = text
    .toLowerCase()
    .split(/[\s"'`;&|()<>{}=,]+/)
    .filter(Boolean)
    .map((w) => w.replace(/^.*[\\/]/, '').replace(/\.(?:exe|com|cmd|bat|ps1|sh)$/, ''))
  for (const word of words) {
    if (DELETE_WORDS.includes(word)) return { forbidden: true, reason: word }
    if (SCRIPT_HOSTS.includes(word)) return { forbidden: true, reason: word }
  }
  for (const [pattern, reason] of DELETE_PATTERNS) {
    if (pattern.test(text) || pattern.test(raw)) return { forbidden: true, reason }
  }
  return { forbidden: false, reason: '' }
}
