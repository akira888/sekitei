import { describe, expect, it } from 'vitest'
import { stoneShape, type StoneParams } from './generator'

// 中くらいの石を基本に、テストごとに一部の値だけ変える
const params = (overrides: Partial<StoneParams> = {}): StoneParams => ({
  size: 0.5, tallness: 0.6, roughness: 0.5, moss: 0, seed: 1, ...overrides,
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

  it('同じ位置に頂点を重ねない（重なった頂点は別々に動いて、面の継ぎ目が割れて見えるため）', () => {
    const keys = vertices(stoneShape(params({ moss: 1 }))).map((v) => v.map((x) => x.toFixed(6)).join(','))

    expect(new Set(keys).size).toBe(keys.length)
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
    // 面の向きを約 15° 刻みのます目に分け、一番多います目が表面積に占める割合を見る。
    // 割れ面のない丸い石では 1.3% 以下、割れ面があると 4.5% 以上になる（頂点 4412 個、seed 1〜5 で確かめた値）。
    // 細かいざらつきで面の向きが散るので、ます目は粗めにしている
    for (const seed of [1, 2, 3, 4, 5]) {
      const shape = stoneShape(params({ seed }))
      const vs = vertices(shape)
      const areas = new Map<string, number>()
      let total = 0
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [vs[shape.indices[i]], vs[shape.indices[i + 1]], vs[shape.indices[i + 2]]]
        const normal = cross(sub(b, a), sub(c, a))
        const length = Math.hypot(...normal)
        const key = normal.map((x) => Math.round((x / length) * 4)).join(',')
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

  it('ゴツゴツ度・苔を最大にしても、平石・立ち石でも、面が裏返らない（どの面も石の中心から外を向く）', () => {
    // 苔は盛り上げるので、くぼみで向かい合う面が折れ重なると、割れのような暗い筋に見える
    for (const [seed, tallness] of [[1, 0.3], [2, 0.3], [3, 1.6], [4, 1.6], [5, 0.8], [952966431, 0.35]]) {
      const shape = stoneShape(params({ roughness: 1, tallness, seed, moss: 1 }))
      const vs = vertices(shape)
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [vs[shape.indices[i]], vs[shape.indices[i + 1]], vs[shape.indices[i + 2]]]
        const normal = cross(sub(b, a), sub(c, a))
        const centroid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
        expect(dot(normal, sub(centroid, shape.center))).toBeGreaterThan(0)
      }
    }
  })

  describe('苔', () => {
    // 頂点の法線の上向きの成分。テストの側でも面の法線を足し合わせて求める
    const upness = (shape: ReturnType<typeof stoneShape>) => {
      const vs = vertices(shape)
      const sums: Vec[] = vs.map(() => [0, 0, 0])
      for (let i = 0; i < shape.indices.length; i += 3) {
        const [a, b, c] = [shape.indices[i], shape.indices[i + 1], shape.indices[i + 2]]
        const n = cross(sub(vs[b], vs[a]), sub(vs[c], vs[a]))
        for (const v of [a, b, c]) sums[v] = [sums[v][0] + n[0], sums[v][1] + n[1], sums[v][2] + n[2]]
      }
      return sums.map((n) => n[1] / Math.hypot(...n))
    }
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length)
    const total = (moss: number) => mean(Array.from(stoneShape(params({ moss })).moss))

    it('苔の量が 0 なら、どこにも付けない', () => {
      expect(stoneShape(params({ moss: 0 })).moss.every((m) => m === 0)).toBe(true)
    })

    it('上を向いた所ほど多く付け、下を向いた所には付けない', () => {
      const shape = stoneShape(params({ moss: 0.6 }))
      const up = upness(shape)
      const at = (pick: (u: number) => boolean) => mean(Array.from(shape.moss).filter((_, i) => pick(up[i])))

      expect(at((u) => u > 0.85)).toBeGreaterThan(at((u) => Math.abs(u) < 0.3))
      expect(at((u) => u < -0.3)).toBe(0)
    })

    it('苔の量を増やすと、付く苔も増える', () => {
      expect(total(0.3)).toBeGreaterThan(total(0))
      expect(total(0.7)).toBeGreaterThan(total(0.3))
      expect(total(1)).toBeGreaterThan(total(0.7))
    })

    it('苔の色のムラ（明るい緑〜暗い緑）を、頂点ごとに -1〜1 の細かく変わる値で持つ', () => {
      const { mossTones, indices } = stoneShape(params({ moss: 0.6 }))
      const steps = Array.from({ length: indices.length / 3 }, (_, f) => Math.abs(mossTones[indices[f * 3]] - mossTones[indices[f * 3 + 1]]))

      expect(Math.min(...mossTones)).toBeGreaterThanOrEqual(-1)
      expect(Math.max(...mossTones)).toBeLessThanOrEqual(1)
      expect(mean(steps)).toBeGreaterThan(0.05) // 隣り合う頂点でも違う
    })

    it('苔の付いた所だけ表面を外へ盛り上げてざらつかせ、苔のない所は動かさない', () => {
      const bare = stoneShape(params({ moss: 0 }))
      const mossy = stoneShape(params({ moss: 0.8 }))
      const [vb, vm] = [vertices(bare), vertices(mossy)]
      const lift = (i: number) => Math.hypot(...sub(vm[i], mossy.center)) - Math.hypot(...sub(vb[i], bare.center))
      const thick = vm.map((_, i) => i).filter((i) => mossy.moss[i] > 0.9)
      const none = vm.map((_, i) => i).filter((i) => mossy.moss[i] === 0)
      const lifts = thick.map(lift)

      expect(mean(lifts)).toBeGreaterThan(0)
      expect(Math.max(...lifts) - Math.min(...lifts)).toBeGreaterThan(0.001) // 盛り上がり方がばらつく
      for (const i of none) expect(vm[i]).toEqual(vb[i])
    })

    it('苔は細かいくぼみで途切れない（くぼみの斜面だけ抜けると、灰色の筋が割れのように見えるため）', () => {
      // 苔の縁の近くで、隣り合う頂点の苔の濃さの差の平均。大きな面の向きで決めると小さくなる。
      // 細かいくぼみの向きで決めていたときは 0.19、なだらかにした向きで決めると 0.13（4つの seed の平均）
      const seeds = [1, 2, 3, 952966431]
      const diffs = seeds.map((seed) => {
        const shape = stoneShape(params({ size: 0.5, tallness: 0.35, roughness: 0.6, moss: 0.3, seed }))
        const steps: number[] = []
        for (let f = 0; f < shape.indices.length; f += 3) {
          const [a, b, c] = [shape.indices[f], shape.indices[f + 1], shape.indices[f + 2]]
          for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            if (shape.moss[p] > 0 || shape.moss[q] > 0) steps.push(Math.abs(shape.moss[p] - shape.moss[q]))
          }
        }
        return mean(steps)
      })

      expect(mean(diffs)).toBeLessThan(0.16)
    })

    it('苔の濃さは 0〜1', () => {
      const { moss } = stoneShape(params({ moss: 1 }))

      expect(Math.min(...moss)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...moss)).toBeLessThanOrEqual(1)
    })
  })
})
