export type Tier = 'baslangic' | 'orta' | 'iyi' | 'guclu'

export interface GpuInfo {
  name: string
  vramGb: number
}

export interface HardwareInfo {
  os: string
  cpu: string
  cores: number
  ramGb: number
  gpus: GpuInfo[]
  /** En çok belleğe sahip ekran kartının VRAM'i; ekran kartı yoksa 0 */
  bestVramGb: number
  diskFreeGb: number
  tier: Tier
}

export interface CatalogModel {
  id: string
  name: string
  family: string
  params: string
  sizeGb: number
  /** Kalite sıralaması: büyük olan daha iyi */
  rank: number
  description: string
  /** Atlas ailesi modeli ise üzerine kurulduğu taban model */
  base?: string
  /** Belirli bir işe özel model; genel öneride yer almaz */
  specialty?: string
  /** Atlas-TR ölçümündeki genel puan (100 üzerinden) */
  score?: number
}

/** rahat: ekran kartına sığar. yavas: çalışır ama yavaş. sigmaz: bu bilgisayarda çalışmaz. */
export type Fit = 'rahat' | 'yavas' | 'sigmaz'

export interface RatedModel extends CatalogModel {
  fit: Fit
  installed: boolean
}

export interface Recommendation {
  recommended: RatedModel
  faster: RatedModel | null
  stronger: RatedModel | null
  /** Katalogdaki modeller, kaliteye göre sıralı */
  all: RatedModel[]
}

/** Güncelleme denetiminin sonucu */
export interface UpdateInfo {
  currentVersion: string
  /** Depoda yayımlanmış son sürüm; henüz yayın yoksa null */
  latestVersion: string | null
  hasUpdate: boolean
  /** İndirme sayfası */
  url: string
  /** Atlas model tarifleri yenilendi mi */
  modelsUpdated: boolean
  /** Yeni sürümün notları (Markdown); yoksa boş */
  notes: string
  /** Kurulum dosyası uygulamanın içinden indirilip kurulabiliyor mu */
  installable: boolean
  /** Kurulum dosyasının boyutu (MB) */
  sizeMb: number
}

export interface UpdateProgress {
  completedBytes: number
  totalBytes: number
  percent: number
}

/** Güncellemeden sonra bir kez gösterilen "bu sürümde neler değişti" notu */
export interface WhatsNew {
  version: string
  notes: string
}

/** Sohbetin dışa aktarılabildiği dosya türleri */
export type ExportFormat = 'docx' | 'pdf' | 'md'
export const EXPORT_FORMATS: ExportFormat[] = ['docx', 'pdf', 'md']

// --- Atlas paneli ---

/** Genel kısayol olarak seçilebilen tuşlar; boş değer kısayolu kapatır. */
export const SHORTCUT_CHOICES = ['', 'Alt+Space', 'Ctrl+Shift+Space', 'Ctrl+Alt+Space', 'Ctrl+Space', 'F8', 'F9']

/** Seçili metne uygulanabilen hazır işlemler */
export const PANEL_ACTIONS = ['fix', 'formal', 'shorter', 'translate', 'summarize', 'explain'] as const
export type PanelAction = (typeof PANEL_ACTIONS)[number] | 'custom' | 'ask'

/** Panel açılırken ne gösterileceği */
export interface PanelRequest {
  /** Her açılışta artar; aynı metinle art arda açılış ayırt edilebilsin diye */
  id: number
  mode: 'ask' | 'selection'
  text: string
  /** Sonuç, seçimin alındığı programa geri yazılabilir mi */
  canReplace: boolean
}

/** Genel kısayollar kaydedilebildi mi; başka bir program aynı tuşu aldıysa false */
export interface ShortcutStatus {
  quick: boolean
  selection: boolean
}

export interface OllamaStatus {
  installed: boolean
  running: boolean
  version: string | null
}

export interface InstalledModel {
  name: string
  sizeGb: number
  modifiedAt: string
  /** Ekranda gösterilecek ad ("Atlas Orta"); geçerli dile göre */
  label?: string
}

/** Ollama'nın o an bellekte tuttuğu model */
export interface LoadedModel {
  name: string
  /** Ekranda gösterilecek ad */
  label: string
  /** Bellekte kapladığı yer (GB) */
  sizeGb: number
  /** Ekran kartına sığan oranı (0-100) */
  gpuPercent: number
}

export interface PullProgress {
  model: string
  status: string
  completedBytes: number
  totalBytes: number
  /** 0–100 */
  percent: number
  bytesPerSec: number
}

export interface DownloadProgress {
  percent: number
  completedBytes: number
  totalBytes: number
}

export interface BenchmarkResult {
  model: string
  tokensPerSec: number
  loadMs: number
  sample: string
}

// --- Kişilikler ---

export const PERSONA_ICONS = ['atlas', 'smile', 'briefcase', 'code', 'languages', 'heart', 'book', 'coffee'] as const
export type PersonaIcon = (typeof PERSONA_ICONS)[number]

/** 0, 1, 2: az, orta, çok */
export type Level = 0 | 1 | 2

export interface PersonaDraft {
  name: string
  /** Seçim ekranında adın altında görünen tek satır */
  tagline: string
  icon: PersonaIcon
  /** Karakter tanımı: kim olduğu, nasıl konuştuğu */
  prompt: string
  warmth: Level
  humor: Level
  /** Cevap uzunluğu */
  length: Level
  emoji: Level
  /** Tek uzun cevap yerine art arda kısa mesajlar yazar */
  multiMessage: boolean
}

export interface Persona extends PersonaDraft {
  id: string
  builtin: boolean
  /** WhatsApp yazışmalarından öğrenilmiş bir kişinin taklidi */
  whatsapp: boolean
}

// --- WhatsApp'tan kişi ---

export interface WaParticipant {
  name: string
  count: number
}

/** Dosya okunduktan sonra, kişi seçilmeden önceki özet. */
export interface WaPreview {
  importId: string
  fileName: string
  participants: WaParticipant[]
  total: number
  from: number
  to: number
}

/** Bir kişinin mesajlarından sayılarak çıkarılan yazım alışkanlıkları. Oranlar 0 ile 1 arasıdır. */
export interface WaStats {
  messages: number
  avgWords: number
  /** Art arda ortalama kaç mesaj attığı */
  avgBurst: number
  /** Cevaplarının çoğunun kaç mesajdan oluştuğu: [alt, üst]; eski kayıtlarda yoktur */
  burstTypical?: [number, number]
  lowercaseStart: number
  /** Cümle sonuna nokta ya da ünlem koyma oranı */
  endPunctuation: number
  /** Soru cümlelerinde soru işareti kullanma oranı; eski kayıtlarda yoktur */
  questionMark?: number
  /** ş, ğ, ı gibi Türkçe harfleri kullanma oranı */
  turkishChars: number
  emojiRate: number
  topEmojis: string[]
  /** "yaaa", "tamammm" gibi harf uzatma oranı */
  elongation: number
  /** Nasıl güldüğü: "sjsjsj", "ahahah" ... yoksa boş */
  laughter: string
  topWords: string[]
  topPhrases: string[]
  /** Karşısındakine nasıl seslendiği: "kanka", "abi" ... */
  address: string[]
  samples: string[]
}

export interface WaProfile {
  personaId: string
  /** Taklit edilen kişinin sohbetteki adı */
  sourceName: string
  /** Kullanıcının sohbetteki adı */
  selfName: string
  stats: WaStats
  /** Modelin yazdığı tarz özeti */
  summary: string
  /** 0: sadece üslup, 1: dengeli, 2: tam taklit */
  similarity: Level
  examples: number
  from: number
  to: number
}

export interface WaBuildRequest {
  importId: string
  /** Kimin gibi yazsın */
  target: string
  /** Kullanıcı sohbette hangisi */
  self: string
  /** Var olan bir WhatsApp kişiliğine eklenecekse onun kimliği */
  mergeInto?: string
}

export interface WaProgress {
  stage: 'analiz' | 'ornekler' | 'ozet'
  /** 0–100 */
  percent: number
}

export const DEFAULT_PERSONA_ID = 'builtin:atlas'

// --- Hafıza ---

export const MEMORY_CATEGORIES = ['Kişisel', 'İş', 'Tercih', 'Proje', 'Tarih', 'Diğer'] as const
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

export interface Memory {
  id: string
  text: string
  category: MemoryCategory
  /** Bilginin çıkarıldığı sohbet; elle eklendiyse null */
  conversationId: string | null
  createdAt: number
}

export interface MemoryStatus {
  count: number
  /** Anlamca arama için gömme modeli kurulu mu */
  semantic: boolean
  embeddingModel: string
  embeddingSizeGb: number
}

// --- Klasörlerle çalışma ---

export interface Folder {
  id: string
  path: string
  /** Klasörün yoldaki son adı */
  name: string
  /** İndekslenmiş metin parçası sayısı; indekslenmediyse 0 */
  chunks: number
  indexedAt: number | null
}

/** Modelin bir aracı kullanması: dosya listeleme, okuma, yazma ... */
export interface ToolStep {
  id: string
  tool: string
  /** Kullanıcıya gösterilen kısa açıklama: "Okundu: rapor.pdf" */
  label: string
  status: 'ok' | 'error' | 'denied'
  /** Komut adımlarında çalıştırılan komut ve terminal çıktısı */
  terminal?: { command: string; output: string; code: number | null }
  /** update_plan adımında modelin iş planı */
  plan?: PlanItem[]
  /** Adım veriyi kalıcı olarak değiştirdi (ör. onaylanıp çalışan bir UPDATE) */
  changed?: boolean
}

export interface PlanItem {
  step: string
  status: 'pending' | 'in_progress' | 'done'
}

export type FileActionKind = 'write' | 'move' | 'delete' | 'mkdir' | 'command'

/** Dosyayı değiştiren bir işlem için kullanıcıdan istenen onay. */
export interface FileApproval {
  id: string
  conversationId: string
  kind: FileActionKind
  /** Klasöre göre göreli yol */
  path: string
  /** Taşımada hedef yol */
  target?: string
  /** Yazmada dosyanın şimdiki içeriği; yeni dosyaysa null */
  before?: string | null
  /** Yazmada yeni içerik */
  after?: string
  /**
   * Başka programların kendiliğinden çalıştırdığı bir dosya (package.json, .git, .vscode, .bat...):
   * "hep izin ver" bunu kapsamaz, kart her seferinde kırmızı uyarıyla sorulur.
   */
  protected?: boolean
}

export interface FileAction {
  id: string
  folderId: string
  kind: FileActionKind
  path: string
  detail: string
  createdAt: number
}

/** Bu bilgisayarda klasör araçlarının ne kadarı kullanılabilir. */
export interface FolderCapability {
  /** Klasör bağlanabilir mi */
  read: boolean
  /** Dosya yazma, taşıma, silme araçları açık mı */
  write: boolean
  /** Kapalıysa nedeni */
  reason: string
}

export interface IndexProgress {
  folderId: string
  /** 0–100 */
  percent: number
  file: string
}

/**
 * Henüz adı konmamış sohbetin veritabanındaki başlığı. Dile bağlı değildir:
 * arayüz bu değeri görünce geçerli dildeki "Yeni sohbet" metnini gösterir.
 */
export const UNTITLED_CONVERSATION = 'Yeni sohbet'

export interface Conversation {
  id: string
  title: string
  model: string | null
  /** Bağlı klasör; yoksa null */
  folderId: string | null
  /** Bağlı veritabanı bağlantısı; yoksa null */
  sqlId: string | null
  personaId: string
  /** Gizli sohbet: hafızayı okumaz, hafızaya yazmaz, uygulama kapanınca silinir */
  private: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type Role = 'user' | 'assistant' | 'system'

// ---------- Kod alanı ----------

/** Proje dosya ağacındaki bir satır */
export interface CodeEntry {
  name: string
  /** Proje klasörüne göre göreli yol ("src/app.ts") */
  path: string
  dir: boolean
  /** Gizli bilgi içerebilen dosya (.env, anahtarlar): içeriği gösterilmez */
  secret: boolean
}

/** Görüntülemek için okunan dosya */
export interface CodeFile {
  path: string
  text: string
  /** İçerik gösterilemiyorsa nedeni (ikili dosya, gizli bilgi dosyası) */
  note: string
  truncated: boolean
}

// ---------- Veritabanı bağlantıları (Kod alanı) ----------

export type SqlEngine = 'mssql' | 'postgres' | 'mysql' | 'sqlite'
export const SQL_ENGINES: SqlEngine[] = ['mssql', 'postgres', 'mysql', 'sqlite']

export interface SqlConnection {
  id: string
  name: string
  engine: SqlEngine
  host: string
  port: number
  database: string
  user: string
  /** Bağlantı şifrelensin mi (SQL Server) */
  encrypt: boolean
  /** Sunucunun sertifikasına doğrulamadan güvenilsin mi (yerel ve şirket içi sunucular için) */
  trustCert: boolean
  /** SQLite dosyasının yolu */
  file: string
  /** Parola kayıtlı mı; parolanın kendisi arayüze hiç gönderilmez */
  hasPassword: boolean
}

export interface SqlConnectionInput {
  name: string
  engine: SqlEngine
  host?: string
  port?: number
  database?: string
  user?: string
  /** Boş bırakılırsa kayıtlı parola korunur */
  password?: string
  encrypt?: boolean
  trustCert?: boolean
  file?: string
}

export interface SqlTable {
  schema: string
  name: string
  /** Tablo ve görünümlerin yanında programlanabilir nesneler: yordam, işlev, tetikleyici ve zamanlanmış iş (SQL Agent) */
  type: SqlObjectType
  /** Tetikleyicinin bağlı olduğu tablo; veritabanı düzeyindeki tetikleyicide boş */
  parent?: string
  columns: { name: string; type: string; nullable: boolean; key: boolean }[]
}

export type SqlObjectType = 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'job'

export type SqlValue = string | number | null

export interface SqlResult {
  columns: string[]
  rows: SqlValue[][]
  rowCount: number
  /** Satır sınırına takılıp kesildi mi */
  truncated: boolean
  /** Yazan sorgularda etkilenen satır sayısı */
  affected?: number
  ms: number
}

/** Atlas'ın veriyi ya da yapıyı değiştiren bir sorgu için istediği onay */
export interface SqlApproval {
  id: string
  conversationId: string
  connectionName: string
  sql: string
  /** Onay gerektiren anahtar kelimeler: "UPDATE", "INSERT" ... */
  keywords: string[]
}

export interface SqlResultEvent {
  conversationId: string
  sql: string
  result: SqlResult
}

export type AttachmentKind = 'text' | 'image'

export interface Attachment {
  id: string
  name: string
  kind: AttachmentKind
  size: number
  /** Dosyadan okunan metnin uzunluğu (resimlerde 0) */
  chars: number
  /** Metin modele sığmayacak kadar uzunsa yalnızca baş kısmı verilir */
  truncated: boolean
  /** Resimlerde önizleme için veri adresi */
  dataUrl: string | null
}

/** Belge panelinde açılan ek: metni ve düzenlenip düzenlenmediği */
export interface AttachmentDocument {
  id: string
  name: string
  /** Geçerli metin: düzenlendiyse düzenlenmiş hali */
  text: string
  edited: boolean
  /** Dosyanın özgün görünümü gösterilebilen türü; düz metin dosyalarında null */
  view: DocumentViewKind | null
  /** Özgün dosya saklı mı (bu özellikten önce eklenen dosyalarda saklı değildir) */
  hasOriginal: boolean
}

export type DocumentViewKind = 'pdf' | 'docx' | 'xlsx'

/** Dosya adına göre belge panelinde özgün görünümü gösterilebilen tür */
export function documentViewKind(name: string): DocumentViewKind | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase()
  return ext === 'pdf' || ext === 'docx' || ext === 'xlsx' ? ext : null
}

export interface SheetView {
  name: string
  widths: number[]
  rows: { text: string; bold: boolean; align: 'left' | 'center' | 'right' }[][]
}

/** Belge panelinin özgün görünüm için aldığı içerik */
export type DocumentOriginal =
  | { kind: 'pdf' | 'docx'; bytes: Uint8Array }
  | { kind: 'xlsx'; sheets: SheetView[] }

/** Belgenin kaydedilebildiği dosya türleri */
export type DocumentFormat = ExportFormat | 'txt'
export const DOCUMENT_FORMATS: DocumentFormat[] = ['docx', 'pdf', 'md', 'txt']

export interface Message {
  id: string
  conversationId: string
  role: Role
  content: string
  createdAt: number
  model: string | null
  durationMs: number | null
  tokens: number | null
  /** Cevap kullanıcı tarafından durdurulduysa ya da hata ile kesildiyse true */
  partial: boolean
  attachments: Attachment[]
  /** Cevabı yazarken kullanılan dosya araçları */
  steps: ToolStep[]
  /** Düşünme açıkken modelin düşüncesi; yoksa boş */
  thinking: string
  /** Bu cevapta Atlas'ın değiştirdiği dosya sayısı; "geri al" ile önceki hallerine döner (0: geri alınacak bir şey yok) */
  undoCount: number
}

/** Geri alma kaydı: Atlas bir dosyayı değiştirmeden önceki hali */
export interface UndoEntry {
  folderId: string
  path: string
  /** Önceki içerik; dosya Atlas tarafından oluşturulduysa null */
  before: string | null
  /** Dosya Atlas tarafından buradan taşındıysa eski yolu; geri alırken dosya eski yerine taşınır */
  movedFrom?: string
  /** Atlas'ın yazdığı son içeriğin özeti; dosya sonradan değiştiyse geri alma onu ezmez */
  afterHash?: string
}

export interface SearchHit {
  conversationId: string
  title: string
  snippet: string
}

export type Theme = 'system' | 'light' | 'dark'

export type { Lang } from './i18n'

export interface Settings {
  setupDone: boolean
  theme: Theme
  /** Arayüzün ve modele giden talimatların dili. İlk açılışta sistem diline göre seçilir. */
  language: import('./i18n').Lang
  defaultModel: string | null
  userName: string
  /** Kurumsal kullanım açıksa unvan, şirket ve imza kullanılır; kurumsal uygulamalar görünür. */
  corporateMode: boolean
  company: string
  jobTitle: string
  signature: string
  /** Atlas sohbette kullanıcıya nasıl hitap eder */
  addressUser: 'sen' | 'siz'
  /** Yazdırılan e-posta ve mektupların başındaki hitap: "Sayın", "Merhaba" ... */
  salutation: string
  /** Yazdırılan e-posta ve mektupların kapanışı: "Saygılarımla", "İyi çalışmalar" ... */
  closing: string
  /** Atlas sohbetlerden kullanıcı hakkında kalıcı bilgiler öğrenir ve hatırlar */
  memoryEnabled: boolean
  /** Pencere kapatılınca Atlas sistem tepsisinde çalışmaya devam eder */
  closeToTray: boolean
  /** Bilgisayar açılınca Atlas arka planda başlar */
  launchAtLogin: boolean
  /** Kilit açıkken bilgisayar bu kadar dakika boş kalınca Atlas kilitlenir; 0 ise kendiliğinden kilitlenmez */
  lockAfterMinutes: number
  /** Atlas penceresi önde değilken biten cevaplar için Windows bildirimi */
  notifyWhenDone: boolean
  /** Soru panelini her yerden açan kısayol; boşsa kapalı */
  quickShortcut: string
  /** Öndeki programda seçili metni panele getiren kısayol; boşsa kapalı */
  selectionShortcut: string
  /** Mesaj kutusunda "/" ile çağrılan, kullanıcının kendi eklediği hazır istemler */
  slashPrompts: SlashPrompt[]
  /** Model cevap vermeden önce düşünsün mü (daha yavaş, daha dikkatli); mesaj kutusundaki düğmeyle değişir */
  think: boolean
}

export interface SlashPrompt {
  name: string
  text: string
}

/** Kendiliğinden kilitlenme için seçilebilen süreler (dakika); 0 kapalı demektir. */
export const LOCK_MINUTES = [0, 1, 5, 15, 30, 60]

/** Uygulama kilidinin durumu. Kilitliyken arayüz yalnızca bunu görebilir. */
export interface LockState {
  /** Bir şifre belirlenmiş mi */
  enabled: boolean
  locked: boolean
  /** Çok yanlış denemeden sonra yeni deneme için beklenecek süre (saniye) */
  retryAfterSec: number
  /** Kilit ekranı doğru dilde ve temada çizilsin diye */
  language: import('./i18n').Lang
  theme: Theme
}

export const SALUTATIONS = ['Sayın', 'Merhaba', 'Merhabalar', 'Değerli', 'İyi günler']
export const CLOSINGS = ['Saygılarımla', 'İyi çalışmalar', 'Teşekkür ederim', 'Selamlar', 'Sevgiler']

export const DEFAULT_SETTINGS: Settings = {
  setupDone: false,
  theme: 'system',
  language: 'tr',
  defaultModel: null,
  userName: '',
  corporateMode: false,
  company: '',
  jobTitle: '',
  signature: '',
  addressUser: 'sen',
  salutation: 'Sayın',
  closing: 'Saygılarımla',
  memoryEnabled: true,
  closeToTray: true,
  launchAtLogin: false,
  lockAfterMinutes: 5,
  notifyWhenDone: true,
  quickShortcut: 'Alt+Space',
  selectionShortcut: 'Ctrl+Shift+Space',
  slashPrompts: [],
  think: false
}

// --- Mini uygulamalar ---

export type FieldType = 'text' | 'textarea' | 'select' | 'toggle'

export interface AppField {
  key: string
  label: string
  type: FieldType
  placeholder: string
  /** Sadece 'select' türünde */
  options: string[]
  required: boolean
}

export const APP_CATEGORIES = ['E-posta', 'Toplantı', 'Belge', 'Metin', 'IT', 'İK', 'Diğer'] as const
export type AppCategory = (typeof APP_CATEGORIES)[number]

export const APP_ICONS = [
  'mail', 'reply', 'file', 'users', 'checklist', 'megaphone', 'languages', 'wand', 'shield', 'server',
  'briefcase', 'pen', 'clipboard', 'calendar', 'message', 'sparkles', 'scissors', 'userplus', 'scroll',
  'spell', 'bell', 'lightbulb', 'handshake', 'wrench'
] as const
export type AppIcon = (typeof APP_ICONS)[number]

/** Kaydedilmeden önceki hali: düzenleyicide ve içe aktarmada kullanılır. */
export interface MiniAppDraft {
  name: string
  description: string
  icon: AppIcon
  category: AppCategory
  /** Modele verilen talimat */
  prompt: string
  fields: AppField[]
}

export interface MiniApp extends MiniAppDraft {
  id: string
  /** Uygulamayla birlikte gelen hazır uygulama */
  builtin: boolean
  /** Bu uygulama için seçilen model; null ise varsayılan model kullanılır */
  model: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface AppRun {
  id: string
  appId: string
  values: Record<string, string>
  output: string
  model: string | null
  createdAt: number
}

/** Arka planda akan bir üretim işi (mini uygulama çalıştırma, prompt geliştirme). */
export interface JobChunk {
  jobId: string
  delta: string
}

export interface JobDone {
  jobId: string
  text: string
  /** Tekrar döngüsü ya da uzunluk sınırı yüzünden kesildiyse açıklaması */
  notice: string | null
  /** Mini uygulama çalıştırıldıysa kaydedilen sonuç */
  run: AppRun | null
}

export interface JobError {
  jobId: string
  error: string
}

export interface RunRequest {
  appId: string
  values: Record<string, string>
  attachmentIds: string[]
  /** Önceki sonucu "kısalt", "daha resmi yap" gibi bir talimatla yeniden yazdırmak için */
  refine?: { previous: string; instruction: string }
}

export interface ImproveRequest {
  /** Kullanıcının kısa isteği */
  request: string
  /** Var olan promptu bir talimatla yeniden geliştirmek için */
  refine?: { previous: string; instruction: string }
  /** Kullanılacak model; verilmezse varsayılan */
  model?: string
}

export interface ChatChunk {
  conversationId: string
  delta: string
}

export interface ChatDone {
  conversationId: string
  message: Message
}

export interface ChatError {
  conversationId: string
  error: string
  /** Hata anına kadar yazılan kısım kaydedildiyse o mesaj */
  message: Message | null
}

/** Arayüzün ana süreçle konuştuğu tüm uç noktalar */
export interface Api {
  hardware: {
    scan(): Promise<HardwareInfo>
  }
  ollama: {
    status(): Promise<OllamaStatus>
    start(): Promise<OllamaStatus>
    install(): Promise<OllamaStatus>
    onInstallProgress(cb: (p: DownloadProgress) => void): () => void
  }
  models: {
    recommend(): Promise<Recommendation>
    installed(): Promise<InstalledModel[]>
    /** Model dosya araçlarını kullanabiliyor mu */
    supportsTools(model: string): Promise<boolean>
    /** Model dosya araçlarını kullanabiliyor mu */
    supportsTools(model: string): Promise<boolean>
    /** Model resim anlayabiliyor mu */
    supportsVision(model: string): Promise<boolean>
    pull(model: string): Promise<void>
    cancelPull(model: string): Promise<void>
    remove(model: string): Promise<void>
    benchmark(model: string): Promise<BenchmarkResult>
    /** O an bellekte duran modeller */
    loaded(): Promise<LoadedModel[]>
    /** Modeli bellekten boşaltır; ad verilmezse hepsini */
    unload(model?: string): Promise<void>
    onPullProgress(cb: (p: PullProgress) => void): () => void
  }
  conversations: {
    list(): Promise<Conversation[]>
    create(options?: { personaId?: string; private?: boolean; folderId?: string | null; sqlId?: string | null }): Promise<Conversation>
    setFolder(id: string, folderId: string | null): Promise<void>
    setSql(id: string, sqlId: string | null): Promise<void>
    rename(id: string, title: string): Promise<void>
    setPinned(id: string, pinned: boolean): Promise<void>
    setModel(id: string, model: string): Promise<void>
    remove(id: string): Promise<void>
    messages(id: string): Promise<Message[]>
    search(query: string): Promise<SearchHit[]>
    /** Sohbeti dosyaya kaydeder; kullanıcı vazgeçerse null döner. */
    export(id: string, format: ExportFormat): Promise<string | null>
    onUpdated(cb: (c: Conversation) => void): () => void
  }
  chat: {
    send(conversationId: string, content: string, attachmentIds?: string[]): Promise<Message>
    regenerate(conversationId: string): Promise<void>
    edit(messageId: string, content: string): Promise<Message>
    stop(conversationId: string): Promise<void>
    onChunk(cb: (c: ChatChunk) => void): () => void
    /** Model düşünürken düşüncesinin parçaları (kaydedilmez) */
    onThinking(cb: (c: ChatChunk) => void): () => void
    /** Model bir dosya aracı kullandığında */
    onStep(cb: (e: { conversationId: string; step: ToolStep }) => void): () => void
    onDone(cb: (d: ChatDone) => void): () => void
    onError(cb: (e: ChatError) => void): () => void
  }
  folders: {
    list(): Promise<Folder[]>
    capability(): Promise<FolderCapability>
    /** Klasör seçme penceresini açar; kullanıcı vazgeçerse null döner. */
    add(): Promise<Folder | null>
    remove(id: string): Promise<void>
    /** İçeriği anlamca aranabilir hale getirir; ilerleme onIndexProgress ile gelir. */
    index(id: string): Promise<Folder>
    actions(folderId: string): Promise<FileAction[]>
    onIndexProgress(cb: (p: IndexProgress) => void): () => void
    onApproval(cb: (a: FileApproval) => void): () => void
    /** Bekleyen bir dosya işlemini onaylar ya da reddeder. */
    /** remember: bu sohbette aynı türdeki işlemlere bir daha sorma (dosya düzenlemeleri ya da birebir aynı komut) */
    respond(approvalId: string, approved: boolean, remember?: boolean): Promise<void>
    /** Bu sohbette verilen kalıcı izinler */
    trust(conversationId: string): Promise<{ edits: boolean; commands: string[] }>
    revokeTrust(conversationId: string): Promise<void>
    /** Bir cevaptaki dosya değişikliklerini geri alır; geri alınan dosya sayısını döndürür */
    undo(messageId: string): Promise<number>
    /** Çalışan komutun canlı çıktısı */
    onCommandOutput(cb: (e: { conversationId: string; command: string; chunk: string }) => void): () => void
  }
  personas: {
    list(): Promise<Persona[]>
    save(draft: PersonaDraft, id?: string): Promise<Persona>
    remove(id: string): Promise<void>
  }
  whatsapp: {
    /** Dışa aktarım dosyasını (.txt ya da .zip) okur ve katılımcıları döndürür. */
    parse(name: string, bytes: ArrayBuffer): Promise<WaPreview>
    /** Seçilen kişinin tarzını öğrenir ve kişiliği oluşturur ya da günceller. */
    build(request: WaBuildRequest): Promise<Persona>
    profile(personaId: string): Promise<WaProfile | null>
    setSimilarity(personaId: string, level: Level): Promise<void>
    onProgress(cb: (p: WaProgress) => void): () => void
  }
  memory: {
    list(): Promise<Memory[]>
    status(): Promise<MemoryStatus>
    add(text: string, category: MemoryCategory): Promise<Memory>
    update(id: string, text: string, category: MemoryCategory): Promise<void>
    remove(id: string): Promise<void>
    clear(): Promise<void>
    /** Anlamca arama modelini indirir; ilerleme models.onPullProgress ile gelir. */
    enableSemantic(): Promise<void>
    /** Sohbetten yeni bir bilgi öğrenildiğinde */
    onLearned(cb: (e: { conversationId: string; memories: Memory[] }) => void): () => void
  }
  documents: {
    /** Dosyanın özgün görünümü için içerik; özgün dosya saklı değilse null */
    original(id: string): Promise<DocumentOriginal | null>
    get(attachmentId: string): Promise<AttachmentDocument | null>
    /** Düzenlenmiş metni saklar; sonraki sorularda Atlas bu hali görür. */
    save(attachmentId: string, text: string): Promise<void>
    /** Düzenlemeleri atar, dosyadan okunan özgün metne döner. */
    reset(attachmentId: string): Promise<AttachmentDocument | null>
    /** Belgenin geçerli halini dosyaya kaydeder; kullanıcı vazgeçerse null döner. */
    export(attachmentId: string, format: DocumentFormat): Promise<string | null>
  }
  attachments: {
    /** Dosyayı okur, metnini çıkarır ve gönderilmeye hazır bekletir. */
    add(name: string, mime: string, bytes: ArrayBuffer): Promise<Attachment>
    remove(id: string): Promise<void>
  }
  apps: {
    list(): Promise<MiniApp[]>
    save(draft: MiniAppDraft, id?: string): Promise<MiniApp>
    remove(id: string): Promise<void>
    setFavorite(id: string, favorite: boolean): Promise<void>
    /** Uygulamanın kullanacağı modeli seçer; null varsayılana döndürür. */
    setModel(id: string, model: string | null): Promise<void>
    /** Çalıştırmayı başlatır, iş numarasını döndürür; sonuç jobs olaylarıyla gelir. */
    run(request: RunRequest): Promise<string>
    runs(appId: string): Promise<AppRun[]>
    removeRun(id: string): Promise<void>
    /** Sonucu yeni bir sohbete taşır. */
    toConversation(runId: string): Promise<Conversation>
    /** Dosyaya kaydeder; kullanıcı vazgeçerse false döner. */
    exportFile(id: string): Promise<boolean>
    /** Dosyadan okur; kaydetmez. Kullanıcı vazgeçerse null döner. */
    importFile(): Promise<MiniAppDraft | null>
  }
  studio: {
    /** Kısa isteği profesyonel bir prompta çevirir; iş numarasını döndürür. */
    improve(request: ImproveRequest): Promise<string>
    /** Prompttan ad, ikon ve form alanları önerir. */
    buildApp(prompt: string, model?: string): Promise<MiniAppDraft>
  }
  jobs: {
    stop(jobId: string): Promise<void>
    onChunk(cb: (c: JobChunk) => void): () => void
    onDone(cb: (d: JobDone) => void): () => void
    onError(cb: (e: JobError) => void): () => void
  }
  code: {
    /** Proje klasörünün bir alt klasöründeki dosyalar; rel boşsa kök */
    list(folderId: string, rel: string): Promise<CodeEntry[]>
    read(folderId: string, rel: string): Promise<CodeFile>
    /** Dosyayı Windows'ta varsayılan programıyla açar (çalıştırılabilir dosyalar açılmaz, klasörde gösterilir) */
    open(folderId: string, rel: string): Promise<'opened' | 'revealed'>
    /** Dosyayı Gezgin'de gösterir */
    reveal(folderId: string, rel: string): Promise<void>
  }
  sql: {
    list(): Promise<SqlConnection[]>
    save(input: SqlConnectionInput, id?: string): Promise<SqlConnection>
    remove(id: string): Promise<void>
    /** Bağlantıyı dener; tablo sayısını döndürür */
    test(id: string): Promise<number>
    /** SQLite dosyası seçme penceresi; vazgeçilirse null */
    pickFile(): Promise<string | null>
    schema(id: string): Promise<SqlTable[]>
    /** Görünüm, yordam, işlev, tetikleyici ya da işin kaynak kodu */
    definition(id: string, object: { schema: string; name: string; type: SqlObjectType }): Promise<string>
    /** Panelden elle çalıştırılan sorgu: yalnızca okuma kabul edilir */
    run(id: string, sql: string): Promise<SqlResult>
    respond(approvalId: string, approved: boolean): Promise<void>
    onApproval(cb: (a: SqlApproval) => void): () => void
    onResult(cb: (e: SqlResultEvent) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  app: {
    version(): Promise<string>
    /** Sohbetlerin ve ayarların saklandığı klasör */
    dataPath(): Promise<string>
    setTitleBarTheme(dark: boolean): Promise<void>
    /** Depodan yeni sürüme ve yeni model tariflerine bakar. Yalnızca kullanıcı isteyince çağrılır. */
    checkUpdates(): Promise<UpdateInfo>
    /** Kurulum dosyasıyla kurulmuş sürüm mü (geliştirme modunda false) */
    isPackaged(): Promise<boolean>
    /** Sistem tepsisinden "Yeni sohbet" seçildiğinde çağrılır. */
    onNewChat(cb: () => void): () => void
    /** Bildirime tıklanınca ya da panelden sohbete geçilince açılacak sohbet */
    onOpenConversation(cb: (conversationId: string) => void): () => void
    /** Son denetimde bulunan kurulum dosyasını indirir. */
    downloadUpdate(): Promise<void>
    onUpdateProgress(cb: (p: UpdateProgress) => void): () => void
    /** İndirilen kurulum dosyasını başlatır ve Atlas'ı kapatır. */
    installUpdate(): Promise<void>
    /** Güncellemeden sonraki ilk açılışta gösterilecek sürüm notları; yoksa null */
    whatsNew(): Promise<WhatsNew | null>
    dismissWhatsNew(): Promise<void>
    /** Ana pencereyi öne getirir (panelden çağrılır). */
    showMain(): Promise<void>
  }
  panel: {
    request(): Promise<PanelRequest>
    onOpen(cb: (request: PanelRequest) => void): () => void
    /** Metin üzerinde işlemi başlatır; cevap jobs olaylarıyla akar. */
    run(action: PanelAction, text: string, instruction?: string): Promise<string>
    /** Sonucu seçimin alındığı programa yazar; yazılamazsa panoya kopyalar ve false döner. */
    replace(text: string): Promise<boolean>
    copy(text: string): Promise<void>
    hide(): Promise<void>
    /** Soruyu ve cevabı yeni bir sohbete taşır, ana pencerede açar. */
    toChat(question: string, answer: string): Promise<void>
    shortcutStatus(): Promise<ShortcutStatus>
  }
  lock: {
    state(): Promise<LockState>
    /** Kilidi kurar ya da şifreyi değiştirir; kilit zaten varsa eski şifre gerekir. */
    setPin(pin: string, current?: string): Promise<LockState>
    disable(current: string): Promise<LockState>
    lock(): Promise<LockState>
    unlock(pin: string): Promise<LockState>
    onChanged(cb: (state: LockState) => void): () => void
  }
}
