import { describe, expect, it } from 'vitest'
import { shapeToStrokes, type Rake } from './shapes'
import type { Point } from './path'

// 庭 4m × 2m、1m = 100マス → 400 × 200 マス
const garden = { width: 4, depth: 2 }
const cellsPerMeter = 100
// 歯 3本 × 間隔 10cm → 帯の幅 30cm = 30マス
const rake: Rake = { tines: 3, spacing: 0.1 }

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const gaps = (path: Point[]) => path.slice(1).map((p, i) => dist(path[i], p))

describe('shapeToStrokes', () => {
  it('レーキの寸法を m からマスに換算し、溝・盛り・深さは歯の間隔の比率で決める', () => {
    const [{ style }] = shapeToStrokes({ type: 'straight', angle: 0, rake }, garden, cellsPerMeter)

    expect(style.tines).toBe(3)
    expect(style.spacing).toBeCloseTo(10)
    expect(style.grooveWidth).toBeCloseTo((10 * 5) / 12)
    expect(style.pileWidth).toBeCloseTo((10 * 7) / 12)
    expect(style.depth).toBeCloseTo((10 * 1.5) / 12)
  })

  describe('直線', () => {
    it('角度 0 なら水平な線を、帯の幅ずつずらして庭全体に敷き詰める', () => {
      const strokes = shapeToStrokes({ type: 'straight', angle: 0, rake }, garden, cellsPerMeter)

      const ys = strokes.map(({ path }) => path[0].y)
      expect(ys).toEqual([15, 45, 75, 105, 135, 165, 195])
      for (const { path } of strokes) {
        for (const p of path) expect(p.y).toBeCloseTo(path[0].y)
      }
    })

    it('庭の端から端まで掻き、行きと帰りで向きを交互に変える', () => {
      const [first, second] = shapeToStrokes({ type: 'straight', angle: 0, rake }, garden, cellsPerMeter)

      expect(first.path[0].x).toBeCloseTo(0)
      expect(first.path.at(-1)!.x).toBeCloseTo(400)
      expect(second.path[0].x).toBeCloseTo(400)
      expect(second.path.at(-1)!.x).toBeCloseTo(0)
    })

    it('斜めの線でも点は庭の外に出ず、帯は庭の四隅まで届く', () => {
      const strokes = shapeToStrokes({ type: 'straight', angle: 30, rake }, garden, cellsPerMeter)

      const points = strokes.flatMap(({ path }) => path)
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6)
        expect(p.x).toBeLessThanOrEqual(400 + 1e-6)
        expect(p.y).toBeGreaterThanOrEqual(-1e-6)
        expect(p.y).toBeLessThanOrEqual(200 + 1e-6)
      }
      for (const corner of [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 200 }, { x: 400, y: 200 }]) {
        const nearest = Math.min(...points.map((p) => dist(p, corner)))
        expect(nearest).toBeLessThanOrEqual(30) // 帯の幅以内に線が来ていれば隅も掻ける
      }
    })
  })

  describe('同心円', () => {
    const concentric = { type: 'concentric' as const, center: { x: 2, y: 1 }, innerRadius: 0.2, rings: 3, rake }

    it('内側から外側の順に、輪の数だけ円を掻く', () => {
      const strokes = shapeToStrokes(concentric, garden, cellsPerMeter)

      // 一番内側の帯の内縁が innerRadius（20マス）。中心線はそこから帯の半分（15マス）外
      const radii = strokes.map(({ path }) => dist(path[0], { x: 200, y: 100 }))
      expect(radii.map((r) => Math.round(r))).toEqual([35, 65, 95])
      for (const [i, { path }] of strokes.entries()) {
        for (const p of path) expect(dist(p, { x: 200, y: 100 })).toBeCloseTo(radii[i])
      }
    })

    it('継ぎ目が残らないよう、一周を越えて始点に重ねて掻く', () => {
      const [{ path }] = shapeToStrokes(concentric, garden, cellsPerMeter)

      const length = gaps(path).reduce((a, b) => a + b, 0)
      expect(length).toBeGreaterThan(2 * Math.PI * 35)
    })
  })

  it('どの図形もパスの点は、両端の1区間を除いて 2マス間隔で並ぶ', () => {
    const strokes = [
      ...shapeToStrokes({ type: 'straight', angle: 30, rake }, garden, cellsPerMeter),
      ...shapeToStrokes({ type: 'concentric', center: { x: 2, y: 1 }, innerRadius: 0.2, rings: 2, rake }, garden, cellsPerMeter),
    ]
    for (const { path } of strokes) {
      for (const gap of gaps(path)) expect(gap).toBeLessThanOrEqual(2 + 1e-6)
      for (const gap of gaps(path).slice(1, -1)) expect(gap).toBeGreaterThan(1.5)
    }
  })
})
