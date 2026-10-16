import { describe, expect, it } from 'vitest'
import { formatDiagnostics, type DiagnosticsInput } from '../src/main/services/diagnostics'

const base: DiagnosticsInput = {
  version: '0.1.0',
  packaged: true,
  versions: { electron: '45.1.0', chrome: '140.0.7339.0', node: '22.19.0' },
  arch: 'x64',
  hardware: {
    os: 'Windows_NT 10.0.26300',
    cpu: 'AMD Ryzen 7 5800X 8-Core Processor',
    cores: 16,
    ramGb: 32,
    gpus: [{ name: 'NVIDIA GeForce RTX 3060', vramGb: 12 }],
    bestVramGb: 12,
    diskFreeGb: 120.5,
    tier: 'guclu'
  },
  ollama: { installed: true, running: true, version: '0.34.2' },
  installed: [
    { name: 'atlas-guclu:latest', sizeGb: 9.2, modifiedAt: '' },
    { name: 'atlas-code:latest', sizeGb: 9, modifiedAt: '' },
    { name: 'nomic-embed-text:latest', sizeGb: 0.27, modifiedAt: '' },
    { name: 'kisisel-model:son', sizeGb: 4, modifiedAt: '' },
    { name: 'gemma4:12b', sizeGb: 8, modifiedAt: '' }
  ],
  loaded: [{ name: 'atlas-guclu:latest', sizeGb: 10.1, gpuPercent: 100 }],
  isAtlas: (name) => name.startsWith('atlas-'),
  embeddingModel: 'nomic-embed-text',
  settings: { language: 'tr', defaultModel: 'atlas-guclu:latest', think: false, memoryEnabled: true, corporateMode: false },
  lockEnabled: true,
  log: { errors: 2, warnings: 5 }
}

describe('tanılama bilgisi', () => {
  it('sürümleri, donanımı, Atlas modellerini ve ayarları yazar', () => {
    const text = formatDiagnostics(base)
    expect(text).toContain('Atlas: 0.1.0 (installed)')
    expect(text).toContain('GPU: NVIDIA GeForce RTX 3060 (12 GB)')
    expect(text).toContain('Ollama: 0.34.2, running')
    expect(text).toContain('Atlas models: atlas-guclu:latest (9.2 GB), atlas-code:latest (9 GB)')
    expect(text).toContain('Embedding model: installed')
    expect(text).toContain('In memory: atlas-guclu:latest (10.1 GB, 100% GPU)')
    expect(text).toContain('app lock on')
    expect(text).toContain('Log (last 7 days): 2 errors, 5 warnings')
  })

  it('Atlas dışındaki modellerin adlarını yazmaz, yalnızca sayar', () => {
    const text = formatDiagnostics(base)
    expect(text).toContain('Other models: 2')
    expect(text).not.toContain('kisisel-model')
    expect(text).not.toContain('gemma4')
  })

  it('Ollama ve ekran kartı yoksa bunu açıkça söyler', () => {
    const text = formatDiagnostics({
      ...base,
      hardware: { ...base.hardware, gpus: [] },
      ollama: { installed: true, running: false, version: null },
      installed: [],
      loaded: []
    })
    expect(text).toContain('GPU: none detected')
    expect(text).toContain('Ollama: installed, not running')
    expect(text).toContain('Atlas models: none')
    expect(text).toContain('Embedding model: missing')
    expect(text).toContain('Other models: 0')
  })
})
