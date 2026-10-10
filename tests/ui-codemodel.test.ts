import { describe, expect, it } from 'vitest'
import { hasCodeModel, pickCodeModel } from '../src/renderer/src/lib/codeModel'

describe('kod alanının modeli', () => {
  it('Atlas Strong önce gelir, yoksa Atlas Code, o da yoksa Medium', () => {
    expect(pickCodeModel(['atlas-code:latest', 'atlas-guclu:latest', 'atlas-orta:latest'])).toBe('atlas-guclu:latest')
    expect(pickCodeModel(['kadirify/atlas-code:latest', 'kadirify/atlas-strong:latest'])).toBe('kadirify/atlas-strong:latest')
    expect(pickCodeModel(['atlas-code:latest', 'atlas-orta:latest'])).toBe('atlas-code:latest')
    expect(pickCodeModel(['kadirify/atlas-medium:latest', 'qwen3.5:2b'])).toBe('kadirify/atlas-medium:latest')
    expect(pickCodeModel(['qwen3.5:2b'])).toBeNull()
  })

  it('Strong ya da Code kuruluysa uyarı gerekmez', () => {
    expect(hasCodeModel(['atlas-guclu:latest'])).toBe(true)
    expect(hasCodeModel(['kadirify/atlas-code:latest'])).toBe(true)
    expect(hasCodeModel(['atlas-orta:latest', 'atlas-hafif:latest'])).toBe(false)
  })
})
