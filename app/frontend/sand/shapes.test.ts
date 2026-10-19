import { describe, expect, it } from 'vitest'
import { shapeToStrokes, type Rake, type StraightShape } from './shapes'
import type { Point } from './path'

// 庭 4m × 2m、1m = 100マス → 400 × 200 マス
const garden = { width: 4, depth: 2 }
const cellsPerMeter = 100
// 歯 3本 × 間隔 10cm → 帯の幅 30cm = 30マス
const rake: Rake = { tines: 3, spacing: 0.1 }

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const gaps = (path: Point[]) => path.slice(1).map((p, i) => dist(path[i], p))
// 庭の中央を通る水平な帯 1本を基本に、テストごとに一部の値だけ変える
const straight = (overrides: Partial<StraightShape>): StraightShape => ({
  type: 'straight', position: { x: 2, y: 1 }, angle: 0, rows: 1, rake, ...overrides,
})

describe('shapeToStrokes', () => {
  it('レーキの寸法を m からマスに換算し、溝・盛り・深さは歯の間隔の比率で決める', () => {
    const [{ style }] = shapeToStrokes(straight({}), garden, cellsPerMeter)

    expect(style.tines).toBe(3)
    expect(style.spacing).toBeCloseTo(10)
    expect(style.grooveWidth).toBeCloseTo((10 * 5) / 12)
    expect(style.pileWidth).toBeCloseTo((10 * 7) / 12)
    expect(style.depth).toBeCloseTo((10 * 1.5) / 12)
  })

  describe('直線', () => {
    it('position を中心に、rows 本の帯を帯の幅ずつずらして並べる', () => {
      const ysOf = (rows: number) =>
        shapeToStrokes(straight({ rows }), garden, cellsPerMeter).map(({ path }) => path[0].y)

      expect(ysOf(3)).toEqual([70, 100, 130])
      expect(ysOf(2)).toEqual([85, 115])
      for (const { path } of shapeToStrokes(straight({ rows: 3 }), garden, cellsPerMeter)) {
        for (const p of path) expect(p.y).toBeCloseTo(path[0].y)
      }
    })

    it('帯は庭の端から端まで走り、行きと帰りで向きを交互に変える', () => {
      // 帯の半分が庭に掛かる線も掻けるよう、庭を帯の幅の半分（15マス）広げた範囲まで線を引く
      const [first, second] = shapeToStrokes(straight({ rows: 2 }), garden, cellsPerMeter)

      expect(first.path[0].x).toBeCloseTo(-15)
      expect(first.path.at(-1)!.x).toBeCloseTo(415)
      expect(second.path[0].x).toBeCloseTo(415)
      expect(second.path.at(-1)!.x).toBeCloseTo(-15)
    })

    it('斜めの線でも、点は庭を帯の幅の半分広げた範囲の外に出ない', () => {
      const strokes = shapeToStrokes(straight({ angle: 30, rows: 20 }), garden, cellsPerMeter)

      for (const p of strokes.flatMap(({ path }) => path)) {
        expect(p.x).toBeGreaterThanOrEqual(-15 - 1e-6)
        expect(p.x).toBeLessThanOrEqual(415 + 1e-6)
        expect(p.y).toBeGreaterThanOrEqual(-15 - 1e-6)
        expect(p.y).toBeLessThanOrEqual(215 + 1e-6)
      }
    })

    it('rows を十分に大きくすれば、斜めでも帯が庭の四隅まで届く（敷き詰めになる）', () => {
      const strokes = shapeToStrokes(straight({ angle: 30, rows: 20 }), garden, cellsPerMeter)

      const points = strokes.flatMap(({ path }) => path)
      for (const corner of [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 200 }, { x: 400, y: 200 }]) {
        const nearest = Math.min(...points.map((p) => dist(p, corner)))
        expect(nearest).toBeLessThanOrEqual(15 + 1) // 帯の半分以内に線が来ていれば隅も掻ける（+1 は点の間隔の誤差）
      }
    })

    it('庭に掛からない帯は出力しない', () => {
      // 帯の中心が y = 210 なら帯（195〜225）の一部が庭に掛かる。y = 220 なら掛からない
      expect(shapeToStrokes(straight({ position: { x: 2, y: 2.1 }, rows: 1 }), garden, cellsPerMeter)).toHaveLength(1)
      expect(shapeToStrokes(straight({ position: { x: 2, y: 2.2 }, rows: 1 }), garden, cellsPerMeter)).toHaveLength(0)
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
      ...shapeToStrokes(straight({ angle: 30, rows: 5 }), garden, cellsPerMeter),
      ...shapeToStrokes({ type: 'concentric', center: { x: 2, y: 1 }, innerRadius: 0.2, rings: 2, rake }, garden, cellsPerMeter),
    ]
    for (const { path } of strokes) {
      for (const gap of gaps(path)) expect(gap).toBeLessThanOrEqual(2 + 1e-6)
      for (const gap of gaps(path).slice(1, -1)) expect(gap).toBeGreaterThan(1.5)
    }
  })
})
