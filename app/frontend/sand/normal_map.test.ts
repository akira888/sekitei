import { describe, expect, it } from 'vitest'
import { SandField } from './rake'
import { normalMapPixels } from './normal_map'

const pixelAt = (pixels: Uint8Array, width: number, x: number, y: number) =>
  Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('normalMapPixels', () => {
  it('平らな砂は真上向き (128, 128, 255) になる', () => {
    const field = new SandField(4, 4)

    expect(pixelAt(normalMapPixels(field), 4, 1, 1)).toEqual([128, 128, 255, 255])
  })

  it('x が増えるほど高くなる斜面は、法線が -x に傾く', () => {
    const field = new SandField(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) field.set(x, y, x)

    const [r, g] = pixelAt(normalMapPixels(field), 4, 1, 1)
    expect(r).toBeLessThan(128)
    expect(g).toBe(128)
  })

  it('行が増える方向（テクスチャの +v）に高くなる斜面は、法線が -v に傾く', () => {
    // DataTexture は flipY が効かず、配列の 0 行目が v=0 になる。行の向きをそのまま v として扱う
    const field = new SandField(4, 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) field.set(x, y, y)

    const [r, g] = pixelAt(normalMapPixels(field), 4, 1, 1)
    expect(r).toBe(128)
    expect(g).toBeLessThan(128)
  })
})
