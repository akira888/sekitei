import { describe, expect, it } from 'vitest'
import { stoneShape, type StoneParams } from './generator'

// 中くらいの石を基本に、テストごとに一部の値だけ変える
const params = (overrides: Partial<StoneParams> = {}): StoneParams => ({
  size: 0.5, tallness: 0.6, roughness: 0.5, seed: 1, ...overrides,
})

type Vec = [number, number, number]
const vertices = ({ positions }: { positions: Float32Array }): Vec[] =>
  Array.from({ length: positions.length / 3 }, (_, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]])
const extent = (vs: Vec[], axis: 0 | 1 | 2) => {
  const values = vs.map((v) => v[axis])
  return { min: Math.min(...values), max: Math.max(...values), size: Math.max(...values) - Math.min(...values) }
}
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('stoneShape', () => {
  it('同じパラメータと seed からは、毎回同じ形を作る（形は保存せず seed から作り直すため）', () => {
    expect(stoneShape(params())).toEqual(stoneShape(params()))
  })

  it('seed が違えば形が違う', () => {
    expect(stoneShape(params({ seed: 2 })).positions).not.toEqual(stoneShape(params({ seed: 1 })).positions)
  })

  it('長い方の差し渡し（x）を size[m] に揃え、奥行き（z）はそれ以下にする', () => {
    for (const size of [0.3, 1.2]) {
      const vs = vertices(stoneShape(params({ size })))
      expect(extent(vs, 0).size).toBeCloseTo(size, 6)
      expect(extent(vs, 2).size).toBeLessThanOrEqual(size)
    }
  })

  it('砂から出ている高さを、差し渡しの tallness 倍にする（平石から立ち石まで）', () => {
    for (const tallness of [0.3, 1.6]) {
      const vs = vertices(stoneShape(params({ tallness })))
      expect(extent(vs, 1).max).toBeCloseTo(0.5 * tallness, 6)
    }
  })

  it('底を砂に沈める（浮いて見えないように）', () => {
    expect(extent(vertices(stoneShape(params())), 1).min).toBeLessThan(0)
  })

  it('割れ面がある: 同じ向きを向いた平らな面がまとまって残る', () => {
    // 面の向きを約 10° 刻みのます目に分け、一番多います目が表面積に占める割合を見る。
    // 割れ面のない丸い石では 1.5% 以下、割れ面があると 3% 以上になる（seed 1〜5 で確かめた値）
    for (const seed of [1, 2, 3, 4, 5]) {
      const shape = stoneShape(params({ seed }))
      const vs = vertices(shape)
      const areas = new Map<string, number>()
      let total = 0
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [vs[shape.indices[i]], vs[shape.indices[i + 1]], vs[shape.indices[i + 2]]]
        const normal = cross(sub(b, a), sub(c, a))
        const length = Math.hypot(...normal)
        const key = normal.map((x) => Math.round((x / length) * 6)).join(',')
        areas.set(key, (areas.get(key) ?? 0) + length / 2)
        total += length / 2
      }
      expect(Math.max(...areas.values()) / total).toBeGreaterThan(0.025)
    }
  })

  it('ゴツゴツ度を上げると、表面の凹凸が大きくなる', () => {
    // 凹凸の大きさ = 隣り合う頂点どうしの、中心からの距離の差の平均
    const bumpiness = (roughness: number) => {
      const shape = stoneShape(params({ roughness }))
      const vs = vertices(shape)
      const center = vs.reduce((c, v) => [c[0] + v[0] / vs.length, c[1] + v[1] / vs.length, c[2] + v[2] / vs.length], [0, 0, 0] as Vec)
      const radius = (i: number) => Math.hypot(...sub(vs[i], center))
      let total = 0
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [shape.indices[i], shape.indices[i + 1], shape.indices[i + 2]]
        total += Math.abs(radius(a) - radius(b)) + Math.abs(radius(b) - radius(c)) + Math.abs(radius(c) - radius(a))
      }
      return total / shape.indices.length
    }

    expect(bumpiness(1)).toBeGreaterThan(bumpiness(0.5))
    expect(bumpiness(0.5)).toBeGreaterThan(bumpiness(0))
  })

  it('ゴツゴツ度を最大にしても、平石・立ち石でも、面が裏返らない（どの面も石の中心から外を向く）', () => {
    for (const [seed, tallness] of [[1, 0.3], [2, 0.3], [3, 1.6], [4, 1.6], [5, 0.8]]) {
      const shape = stoneShape(params({ roughness: 1, tallness, seed }))
      const vs = vertices(shape)
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [vs[shape.indices[i]], vs[shape.indices[i + 1]], vs[shape.indices[i + 2]]]
        const normal = cross(sub(b, a), sub(c, a))
        const centroid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
        expect(dot(normal, sub(centroid, shape.center))).toBeGreaterThan(0)
      }
    }
  })
})
