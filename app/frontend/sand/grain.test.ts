import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'
import { GRAIN, GRAIN_NORMAL_HOOK, grainNormalPixels, grainPixels } from './grain'

const size = GRAIN.size
const pixels = grainPixels()
const values = Array.from({ length: size * size }, (_, i) => pixels[i * 4])
const mean = values.reduce((sum, v) => sum + v, 0) / values.length

describe('grainPixels', () => {
  it('灰色の RGBA を、繰り返し貼る大きさのぶん作る', () => {
    expect(pixels).toHaveLength(size * size * 4)
    for (let i = 0; i < 50; i++) {
      expect(pixels[i * 4 + 1]).toBe(pixels[i * 4])
      expect(pixels[i * 4 + 2]).toBe(pixels[i * 4])
      expect(pixels[i * 4 + 3]).toBe(255)
    }
  })

  it('平均の明るさは決めた値（砂の色に掛けて、全体の明るさを変えないため）', () => {
    expect(mean / 255).toBeCloseTo(GRAIN.mean, 1)
  })

  it('粒ごとに明暗がばらつき、暗い粒と明るい粒が混ざる', () => {
    const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length) / 255
    expect(sd).toBeGreaterThan(0.03)
    expect(Math.min(...values) / 255).toBeLessThan(GRAIN.mean - 0.15)
    expect(Math.max(...values) / 255).toBeGreaterThan(GRAIN.mean + 0.05)
  })

  it('毎回同じ模様にする（開き直しても砂の見た目が変わらない）', () => {
    expect(grainPixels()).toEqual(pixels)
  })
})

describe('grainNormalPixels', () => {
  const normals = grainNormalPixels()
  const at = (x: number, y: number) => {
    const i = (y * GRAIN.size + x) * 4
    return [normals[i], normals[i + 1], normals[i + 2]].map((v) => v / 127.5 - 1)
  }

  it('粒の明るさを高さとみなした、細かい凹凸の法線（接空間、RGBA）を作る', () => {
    expect(normals).toHaveLength(GRAIN.size * GRAIN.size * 4)
    for (let i = 0; i < 100; i++) {
      const [x, y, z] = at(i, 7)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1)
      expect(z).toBeGreaterThan(0.5) // 凹凸はごく浅い
    }
  })

  it('明るい粒の縁では、法線が粒の外へ傾く（粒が盛り上がって見える）', () => {
    // 一番明るい画素を探し、その右隣の法線は +x へ、左隣は -x へ傾く
    const gray = grainPixels()
    const light = Array.from({ length: GRAIN.size * GRAIN.size }, (_, i) => gray[i * 4])
    const peak = light.indexOf(Math.max(...light))
    const x = peak % GRAIN.size, y = Math.floor(peak / GRAIN.size)
    if (x < 2 || x > GRAIN.size - 3) return
    expect(at(x + 1, y)[0] + at(x + 2, y)[0]).toBeGreaterThan(0)
    expect(at(x - 1, y)[0] + at(x - 2, y)[0]).toBeLessThan(0)
  })

  it('毎回同じにする', () => {
    expect(grainNormalPixels()).toEqual(normals)
  })

  // 砂の材質のシェーダーの1行を書き換えて、砂紋の法線に細かい凹凸を重ねる。three を上げて行が変わったら気づけるように
  it('重ねる場所の行が、three の法線のシェーダーにある', () => {
    expect(ShaderChunk.normal_fragment_maps).toContain(GRAIN_NORMAL_HOOK)
  })
})
