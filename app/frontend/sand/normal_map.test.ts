import { describe, expect, it } from 'vitest'
import { SandField } from './rake'
import { normalMapPixels, updateNormals } from './normal_map'

const pixelAt = (pixels: Uint8Array, width: number, x: number, y: number) =>
  Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('normalMapPixels', () => {
  // マス単位の段差（同心円の境目のギザギザ、山の表面のまだら、小さな点）が陰影に出ないよう、
  // 斜めの隣も含めてならした高さの傾きで法線を決める
  describe('マス単位の段差をならす', () => {
    const spike = () => {
      const field = new SandField(11, 11)
      field.set(5, 5, 1)
      return normalMapPixels(field)
    }

    it('1マスだけ飛び出した点のすぐ隣は、左右の差だけで決めるより傾きが穏やか', () => {
      const [r] = pixelAt(spike(), 11, 6, 5)
      const sharp = Math.round((0.5 / Math.hypot(0.5, 1)) * 127 + 128) // 左右の差だけで決めたときの値

      expect(r).toBeGreaterThan(128)
      expect(r).toBeLessThan(sharp - 10)
    })

    it('斜めの隣にも、傾きがなだらかに広がる', () => {
      const [r, g] = pixelAt(spike(), 11, 6, 6)

      expect(r).toBeGreaterThan(128)
      expect(g).toBeGreaterThan(128)
    })
  })

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

// プレビューでは、レーキが進んで高さが変わった範囲だけ法線を書き直す
describe('updateNormals', () => {
  // 0.7 刻みの sin で凹凸を付けた 20 × 10 マスの砂
  const bumpyField = () => {
    const field = new SandField(20, 10)
    for (let k = 0; k < field.h.length; k++) field.h[k] = Math.sin(k * 0.7)
    return field
  }

  it('高さを変えた範囲を渡すと、全面を計算し直した結果と同じになる（隣のマスの法線も変わるので、1マス外側まで書き直す）', () => {
    const field = bumpyField()
    const pixels = normalMapPixels(field)
    for (let y = 3; y <= 5; y++) for (let x = 6; x <= 9; x++) field.set(x, y, field.at(x, y) + 2)

    updateNormals(pixels, field, { x0: 6, y0: 3, x1: 9, y1: 5 })

    expect(pixels).toEqual(normalMapPixels(field))
  })

  it('庭の隅を変えても、範囲の外側を書こうとして配列からはみ出さない', () => {
    const field = bumpyField()
    const pixels = normalMapPixels(field)
    field.set(0, 0, 5)
    field.set(19, 9, -5)

    updateNormals(pixels, field, { x0: 0, y0: 0, x1: 0, y1: 0 })
    updateNormals(pixels, field, { x0: 19, y0: 9, x1: 19, y1: 9 })

    expect(pixels).toEqual(normalMapPixels(field))
  })
})
