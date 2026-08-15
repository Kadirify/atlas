import type { CatalogModel, Fit, HardwareInfo, InstalledModel, RatedModel, Recommendation, Tier } from '@shared/types'
import type { Lang } from '@shared/i18n'
import { getLanguage } from '../i18n'
import atlasRaw from '../../../resources/atlas-models.json'

/** Atlas ailesinden bir modelin kurulum tarifi */
export interface AtlasRecipe {
  id: string
  base: string
  /** İnce ayarlı ağırlıkların Ollama'daki adı. Bilgisayarda kuruluysa taban yerine bu kullanılır. */
  tuned?: string
  system?: { tr: string; en: string }
  parameters: Record<string, number>
}

/** Atlas model tarifleri dosyasının biçimi (resources/atlas-models.json) */
export type AtlasModelsFile = typeof atlasRaw

/** Geçerli tarifler: uygulamayla gelenler ya da depodan indirilen daha yeni sürüm. */
let atlasModels: AtlasModelsFile = atlasRaw

/** Uygulamayla gelen tariflerin sürümü */
export const BUNDLED_RECIPES_VERSION: number = atlasRaw.version

export function setAtlasModels(file: AtlasModelsFile): void {
  atlasModels = file
}

export function recipesVersion(): number {
  return atlasModels.version
}

/** Verilen ad bir Atlas ailesi modeliyse tarifini döner. */
export function atlasRecipe(id: string): AtlasRecipe | null {
  return (atlasModels.models as AtlasRecipe[]).find((m) => m.id === id) ?? null
}

/** Atlas yalnızca kendi model ailesiyle çalışır; başka modeller listelenmez ve kullanılmaz. */
export function isAtlasModel(name: string | null | undefined): name is string {
  return !!name && atlasRecipe(name) !== null
}

/**
 * Katalog yalnızca Atlas ailesinden oluşur.
 * Verilen dile göre düzleştirilir: ad ve açıklama o dildeki düz metin olur.
 */
export function catalog(lang: Lang): CatalogModel[] {
  return atlasModels.models.map((m) => ({
    id: m.id,
    name: m.name[lang] ?? m.name.tr,
    family: m.family,
    params: m.params,
    sizeGb: m.sizeGb,
    rank: m.rank,
    description: m.description[lang] ?? m.description.tr,
    base: m.base,
    score: m.score,
    ...('specialty' in m && m.specialty ? { specialty: m.specialty } : {})
  }))
}

/** Türkçe katalog. Dile göre katalog için catalog(lang) kullanılır. */
export const CATALOG: CatalogModel[] = catalog('tr')

/** Modelin kendisi + bağlam belleği için gereken yaklaşık ekran kartı belleği */
export function vramNeededGb(sizeGb: number): number {
  return sizeGb * 1.15 + 1
}

export function tierOf(ramGb: number, bestVramGb: number): Tier {
  if (bestVramGb >= 16) return 'guclu'
  if (bestVramGb >= 8) return 'iyi'
  if (bestVramGb >= 4 || ramGb >= 16) return 'orta'
  return 'baslangic'
}

export function fitOf(model: Pick<CatalogModel, 'sizeGb'>, hw: Pick<HardwareInfo, 'ramGb' | 'bestVramGb'>): Fit {
  if (hw.bestVramGb >= vramNeededGb(model.sizeGb)) return 'rahat'
  // Ekran kartına sığmayan kısım sistem belleğine taşar: çalışır ama yavaştır.
  if (hw.ramGb + hw.bestVramGb >= model.sizeGb * 1.3 + 4) return 'yavas'
  return 'sigmaz'
}

/**
 * Ekran kartı olmayan (ya da hiçbir modelin sığmadığı) bilgisayarda
 * işlemciyle kabul edilebilir hızda çalışacak en büyük model boyutu.
 */
function cpuBudgetGb(ramGb: number): number {
  return Math.min(ramGb * 0.35, 7)
}

export function recommend(
  hw: Pick<HardwareInfo, 'ramGb' | 'bestVramGb'>,
  installed: Pick<InstalledModel, 'name' | 'sizeGb'>[] = [],
  models: CatalogModel[] = catalog(getLanguage())
): Recommendation {
  const installedIds = new Set(installed.map((m) => m.name))
  const rated: RatedModel[] = models
    .map((m) => ({ ...m, fit: fitOf(m, hw), installed: installedIds.has(m.id) }))
    .sort((a, b) => a.rank - b.rank)

  // Belirli bir işe özel modeller (ör. Atlas Code) listede görünür ama genel öneri olmaz.
  const general = rated.filter((m) => !m.specialty)
  const smallest = general[0]
  const comfortable = general.filter((m) => m.fit === 'rahat')
  const cpuOk = general.filter((m) => m.fit !== 'sigmaz' && m.sizeGb <= cpuBudgetGb(hw.ramGb))

  const recommended = comfortable.at(-1) ?? cpuOk.at(-1) ?? smallest

  const faster = general.filter((m) => m.rank < recommended.rank && m.sizeGb < recommended.sizeGb).at(-1) ?? null
  const stronger = general.find((m) => m.rank > recommended.rank && m.fit !== 'sigmaz') ?? null

  return { recommended, faster, stronger, all: rated }
}
