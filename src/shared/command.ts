/**
 * Komut güvenlik kuralı. Atlas bir proje klasöründe komut çalıştırmak isteyebilir (test, derleme, git durumu).
 * Her komut kullanıcı onayı ister; silen ya da geri alınamayacak biçimde yok eden komutlar ise hiç çalıştırılmaz.
 */
export interface CommandVerdict {
  /** Atlas'ın çalıştıramayacağı bir komut mu */
  forbidden: boolean
  /** Yasak sayılmasına yol açan parça ("rm", "git reset --hard" ...) */
  reason: string
}

/** Tek başına bir kelime olarak geçtiğinde silme anlamına gelen komutlar */
const DELETE_WORDS = [
  'rm', 'rmdir', 'rd', 'del', 'erase', 'unlink', 'shred', 'mkfs', 'diskpart', 'fdisk', 'remove-item', 'ri',
  'clear-content', 'clear-recyclebin', 'rimraf', 'trash', 'dropdb', 'cipher', 'sdelete', 'wipefs', 'truncate'
]

/** Birden çok kelimeden oluşan, veriyi ya da geçmişi yok eden kalıplar */
const DELETE_PATTERNS: [RegExp, string][] = [
  [/(?:^|[&|;]\s*)format(?:\.com)?\s+[a-z]:/i, 'format'],
  [/\bgit\s+(?:[^\s&|;]+\s+)*?clean\b/i, 'git clean'],
  [/\bgit\s+(?:[^\s&|;]+\s+)*?reset\s+(?:[^&|;]*\s)?--hard\b/i, 'git reset --hard'],
  [/\bgit\s+(?:[^\s&|;]+\s+)*?push\s+(?:[^&|;]*\s)?(?:--force\b|-f\b|--force-with-lease\b|--delete\b|-d\b)/i, 'git push --force'],
  [/\bgit\s+(?:[^\s&|;]+\s+)*?(?:rm|branch\s+(?:[^&|;]*\s)?-[dD]\b|tag\s+(?:[^&|;]*\s)?-d\b|stash\s+(?:drop|clear)|checkout\s+(?:[^&|;]*\s)?(?:--|\.)(?:\s|$)|restore\b)/i, 'git (silen ya da değişiklikleri atan)'],
  [/\b(?:npm|pnpm|yarn)\s+(?:[^&|;]*\s)?(?:uninstall|remove|rm|prune|cache\s+clean)\b/i, 'paket kaldırma'],
  [/\b(?:pip|pip3)\s+uninstall\b/i, 'pip uninstall'],
  [/\b(?:docker|podman)\s+(?:[^&|;]*\s)?(?:rm|rmi|prune|down\s+(?:[^&|;]*\s)?-v)\b/i, 'docker (silen)'],
  [/\b(?:drop|truncate)\s+(?:table|database|schema|index|view)\b/i, 'DROP / TRUNCATE'],
  [/\bdelete\s+from\b/i, 'DELETE FROM'],
  [/\.(?:delete|deletefile|deletedirectory|unlink|unlinksync|rmsync|rmdirsync|rmtree|removedirs)\s*\(/i, 'dosya silen kod'],
  [/\[(?:system\.)?io\.(?:file|directory)\]::delete/i, 'dosya silen kod'],
  [/(?:^|[\s&|;(])>\s*(?!>|&|\s*(?:nul|\/dev\/null|\$null)\b)\S/i, 'dosyanın üstüne yazan yönlendirme (>)'],
  [/\b(?:mv|move|move-item|ren|rename|rename-item|cp|copy|copy-item|xcopy|robocopy)\b[^&|;]*\s(?:\/mir\b|\/purge\b|-force\b|-f\b|\/y\b)/i, 'üstüne yazan taşıma ya da kopyalama'],
  [/\b(?:shutdown|reboot|restart-computer|stop-computer|taskkill|stop-process|kill|pkill|killall|reg\s+delete|sc\s+delete|net\s+user|schtasks\s+\/delete|vssadmin|bcdedit|takeown|icacls|chmod|chown)\b/i, 'sistemi değiştiren komut'],
  [/\b(?:powershell|pwsh)\b[^&|;]*\s-(?:e|ec|enc|encodedcommand)\b/i, 'kodlanmış PowerShell komutu'],
  [/\b(?:iex|invoke-expression)\b/i, 'Invoke-Expression'],
  [/\b(?:curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^&|;]*\|\s*(?:sh|bash|cmd|powershell|pwsh|iex|node|python)/i, 'internetten indirip çalıştırma']
]

/** Bir komutun Atlas tarafından (onayla) çalıştırılabilir mi, yoksa yasak mı olduğuna karar verir. */
export function classifyCommand(command: string): CommandVerdict {
  const text = command.trim()
  if (!text) return { forbidden: true, reason: '' }
  // Komut adları: satır başı, boru, && / ||, noktalı virgül ya da parantezden sonra gelen ilk kelimeler ve bunların
  // "cmd /c", "powershell -Command", "sudo", "npx" gibi sarmalayıcılardan sonraki halleri.
  const words = text
    .toLowerCase()
    .split(/[\s"'`;&|()<>{}=,]+/)
    .filter(Boolean)
    .map((w) => w.replace(/^.*[\\/]/, '').replace(/\.(?:exe|cmd|bat|ps1|sh)$/, ''))
  for (const word of words) {
    if (DELETE_WORDS.includes(word)) return { forbidden: true, reason: word }
  }
  for (const [pattern, reason] of DELETE_PATTERNS) {
    if (pattern.test(text)) return { forbidden: true, reason }
  }
  return { forbidden: false, reason: '' }
}
