import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// Betik düz Node ile çalışır (CommonJS); testte doğrudan yüklenir.
const { chooseLicense, closure, importsOf, licenseExpression, packageName, resolveDependency } = createRequire(import.meta.url)('../scripts/make-notices.cjs') as {
  chooseLicense(expression: unknown): { license: string; chosenFrom: string | null } | null
  closure(packages: Record<string, unknown>, roots: string[]): Set<string>
  importsOf(source: string): string[]
  licenseExpression(pkg: Record<string, unknown>): string
  packageName(specifier: string): string | null
  resolveDependency(packages: Record<string, unknown>, from: string, name: string): string | null
}

describe('lisans seçimi', () => {
  it('copyleft olmayan lisansları kabul eder, seçenek sunulmuşsa uygun olanı seçer', () => {
    expect(chooseLicense('MIT')).toEqual({ license: 'MIT', chosenFrom: null })
    expect(chooseLicense('(MIT OR GPL-3.0-or-later)')).toEqual({ license: 'MIT', chosenFrom: 'MIT OR GPL-3.0-or-later' })
    expect(chooseLicense('LGPL-2.1-only OR Apache-2.0')?.license).toBe('Apache-2.0')
    expect(chooseLicense('(MIT AND Zlib)')).toEqual({ license: 'MIT AND Zlib', chosenFrom: null })
    for (const ok of ['ISC', 'BSD-3-Clause', 'Apache-2.0', 'OFL-1.1', '0BSD', 'Unlicense']) expect(chooseLicense(ok)?.license, ok).toBe(ok)
  })

  it('yalnızca copyleft olan, belirsiz ya da belirtilmemiş lisansı reddeder', () => {
    for (const bad of ['GPL-2.0-only AND (MIT OR Apache-2.0)', '(MIT OR Apache-2.0) AND BSD-3-Clause', 'Apache-2.0 WITH LLVM-exception', 'GPL-3.0-only', 'AGPL-3.0', 'LGPL-2.1', 'MIT AND GPL-2.0', 'GPL-2.0 OR GPL-3.0', 'UNLICENSED', 'SEE LICENSE IN LICENSE.txt', '', undefined, null]) {
      expect(chooseLicense(bad), String(bad)).toBeNull()
    }
  })

  it('package.json\'daki eski ve yeni lisans biçimlerini okur', () => {
    expect(licenseExpression({ license: 'MIT' })).toBe('MIT')
    expect(licenseExpression({ license: { type: 'ISC', url: 'x' } })).toBe('ISC')
    expect(licenseExpression({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0')
    expect(licenseExpression({})).toBe('')
  })
})

describe('içe aktarılan paketler', () => {
  it('paket adını çıkarır; göreli yolu, takma adı, Node modülünü ve electron\'u atlar', () => {
    expect(packageName('react-dom/client')).toBe('react-dom')
    expect(packageName('@fontsource-variable/onest/index.css')).toBe('@fontsource-variable/onest')
    expect(packageName('zustand')).toBe('zustand')
    for (const skipped of ['./a', '../b', '/c', '@/lib/format', '@shared/types', 'node:fs', 'fs', 'path/posix', 'electron', '']) {
      expect(packageName(skipped), skipped).toBeNull()
    }
  })

  it('TypeScript, dinamik import, require ve CSS içe aktarmalarını bulur', () => {
    const source = [
      "import { create } from 'zustand'",
      "import type { X } from '@shared/types'",
      "import './styles.css'",
      "const pdf = await import('pdfjs-dist/build/pdf.mjs')",
      "const zip = require('jszip')",
      "@import '@fontsource-variable/onest';",
      '@plugin "@tailwindcss/typography";',
      "import fs from 'node:fs'"
    ].join('\n')
    expect(importsOf(source).sort()).toEqual(['@fontsource-variable/onest', '@tailwindcss/typography', 'jszip', 'pdfjs-dist', 'zustand'])
  })
})

describe('bağımlılık kapanışı', () => {
  const packages = {
    'node_modules/a': { dependencies: { b: '^1', c: '^1' } },
    'node_modules/a/node_modules/c': { dependencies: { d: '^1' } },
    'node_modules/b': {},
    'node_modules/c': { dependencies: { yok: '^1' } },
    'node_modules/d': { optionalDependencies: { e: '^1' } },
    'node_modules/e': {},
    'node_modules/ilgisiz': {}
  }

  it('iç içe kurulu sürümü önce bulur, yoksa köke çıkar', () => {
    expect(resolveDependency(packages, 'node_modules/a', 'c')).toBe('node_modules/a/node_modules/c')
    expect(resolveDependency(packages, 'node_modules/a/node_modules/c', 'd')).toBe('node_modules/d')
    expect(resolveDependency(packages, 'node_modules/b', 'yok')).toBeNull()
  })

  it('bir paketin bütün bağımlılıklarını toplar, ilgisiz paketi almaz', () => {
    expect([...closure(packages, ['node_modules/a'])].sort()).toEqual(['node_modules/a', 'node_modules/a/node_modules/c', 'node_modules/b', 'node_modules/d', 'node_modules/e'])
  })
})
