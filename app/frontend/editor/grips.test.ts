import { describe, expect, it } from 'vitest'
import { dragShape, gripsOf, hitShape, pickGrip, type Grip } from './grips'
import type { ConcentricShape, Rake, Shape, StraightShape } from '../sand/shapes'
import type { Point } from '../sand/path'

const garden = { width: 4, depth: 2 }
// 歯 3本 × 間隔 10cm → 帯の幅 30cm。掻く処理が届く範囲は中心から 10cm + 溝の半分 + 盛りの幅 ≒ 17.9cm
const rake: Rake = { tines: 3, spacing: 0.1 }
const straight = (overrides: Partial<StraightShape> = {}): StraightShape => ({
  type: 'straight', position: { x: 2, y: 1 }, angle: 0, rows: 3, rake, ...overrides,
})
const concentric = (overrides: Partial<ConcentricShape> = {}): ConcentricShape => ({
  type: 'concentric', center: { x: 2, y: 1 }, innerRadius: 0.1, rings: 2, rake, ...overrides,
})

const gripOf = (shape: Shape, match: (g: Grip) => boolean) => {
  const found = gripsOf(shape).find(match)
  if (!found) throw new Error('grip not found')
  return found
}
// つかみ所をつかんで delta だけ動かす
const drag = (shape: Shape, match: (g: Grip) => boolean, delta: Point) => {
  const grip = gripOf(shape, match)
  return dragShape(shape, grip, grip.point, { x: grip.point.x + delta.x, y: grip.point.y + delta.y })
}
const isKind = (kind: Grip['kind'], side?: 1 | -1) => (g: Grip) => g.kind === kind && (side === undefined || ('side' in g && g.side === side))

describe('hitShape', () => {
  it('直線は、束の外側の帯が掻く範囲（帯 + 土手）までを当たりにする', () => {
    // 3本の束の外側の中心線は y = 1 ± 0.3。そこから ±17.9cm まで
    expect(hitShape([straight()], { x: 1, y: 1.47 }, garden)).toBe(0)
    expect(hitShape([straight()], { x: 1, y: 1.49 }, garden)).toBeUndefined()
  })

  it('同心円は、内側の輪から外側の輪までが掻く範囲を当たりにする', () => {
    // 輪の中心線の半径は 0.25 と 0.55。範囲は半径 0.071〜0.729
    expect(hitShape([concentric()], { x: 2.72, y: 1 }, garden)).toBe(0)
    expect(hitShape([concentric()], { x: 2.74, y: 1 }, garden)).toBeUndefined()
    expect(hitShape([concentric()], { x: 2.06, y: 1 }, garden)).toBeUndefined()
  })

  it('重なっている地点では、後に置いた（上のレイヤーの）図形を選ぶ', () => {
    expect(hitShape([straight(), concentric()], { x: 2.3, y: 1 }, garden)).toBe(1)
    expect(hitShape([concentric(), straight()], { x: 2.3, y: 1 }, garden)).toBe(1)
  })

  it('庭の外は何も選ばない', () => {
    expect(hitShape([straight()], { x: -0.1, y: 1 }, garden)).toBeUndefined()
  })
})

describe('pickGrip', () => {
  it('許容範囲の中で一番近いつかみ所を選び、範囲の外なら選ばない', () => {
    const grips = [
      { kind: 'move', point: { x: 0, y: 0 } },
      { kind: 'angle', point: { x: 0.1, y: 0 } },
    ] as const

    expect(pickGrip(grips, { x: 0.07, y: 0 }, 0.05)?.kind).toBe('angle')
    expect(pickGrip(grips, { x: 0.3, y: 0 }, 0.05)).toBeUndefined()
  })

  it('同じ近さなら配列の後ろ（上に描かれた方）を選ぶ', () => {
    const lower = { kind: 'move', point: { x: 0, y: 0 } } as const
    const upper = { kind: 'move', point: { x: 0, y: 0 } } as const

    expect(pickGrip([lower, upper], { x: 0, y: 0 }, 0.05)).toBe(upper)
  })
})

describe('dragShape', () => {
  describe('直線', () => {
    it('目印を動かすと、束が同じだけ動く', () => {
      expect(drag(straight(), isKind('move'), { x: 0.5, y: -0.2 })).toMatchObject({ position: { x: 2.5, y: 0.8 } })
    })

    it('角度ハンドルを回すと、position を軸に向きが変わる（画面上で時計回りに増える）', () => {
      const shape = straight()
      const grip = gripOf(shape, isKind('angle'))
      const rotated = dragShape(shape, grip, grip.point, { x: 2, y: 1.5 }) as StraightShape

      expect(rotated.angle).toBeCloseTo(90)
      expect(rotated.position).toEqual({ x: 2, y: 1 })
    })

    it('本数ハンドルを外へ引くと、帯の幅単位で本数が増え、引いた側へ帯の幅の半分ずつずれる', () => {
      // 帯 3本の + 側の縁は y = 1.45。1本ぶん（30cm）引くと 4本、反対側の縁は動かない
      const widened = drag(straight(), isKind('rows', 1), { x: 0, y: 0.3 }) as StraightShape

      expect(widened.rows).toBe(4)
      expect(widened.position.y).toBeCloseTo(1.15)
    })

    it('反対側の本数ハンドルは反対側へ広げる', () => {
      const widened = drag(straight(), isKind('rows', -1), { x: 0, y: -0.3 }) as StraightShape

      expect(widened.rows).toBe(4)
      expect(widened.position.y).toBeCloseTo(0.85)
    })

    it('帯の幅の半分に満たない動きでは本数は変わらない', () => {
      expect(drag(straight(), isKind('rows', 1), { x: 0, y: 0.14 })).toMatchObject({ rows: 3, position: { y: 1 } })
    })

    it('内へ押しても 1本より減らさない', () => {
      const shape = straight({ rows: 2 })
      const narrowed = drag(shape, isKind('rows', 1), { x: 0, y: -0.6 }) as StraightShape

      expect(narrowed.rows).toBe(1)
      // - 側の縁（y = 1 - 0.3）は動かない
      expect(narrowed.position.y).toBeCloseTo(0.7 + 0.15)
    })

    it('反対側の縁を越えて押し込んでも、反対側へ広がらない', () => {
      const narrowed = drag(straight(), isKind('rows', 1), { x: 0, y: -1.5 }) as StraightShape

      expect(narrowed.rows).toBe(1)
      expect(narrowed.position.y).toBeCloseTo(0.55 + 0.15)
    })

    it('斜めの束でも、本数ハンドルは束の向きに垂直な成分だけを見る', () => {
      // 90° の束の + 側は -x 方向。束に沿った y の動きは無視する
      const widened = drag(straight({ angle: 90 }), isKind('rows', 1), { x: -0.3, y: 0.5 }) as StraightShape

      expect(widened.rows).toBe(4)
      expect(widened.position.x).toBeCloseTo(1.85)
      expect(widened.position.y).toBeCloseTo(1)
    })
  })

  describe('同心円', () => {
    it('目印を動かすと、中心が同じだけ動く', () => {
      expect(drag(concentric(), isKind('move'), { x: -0.5, y: 0.2 })).toMatchObject({ center: { x: 1.5, y: 1.2 } })
    })

    it('外側のハンドルを引くと、帯の幅単位で輪が増える', () => {
      expect(drag(concentric(), isKind('rings'), { x: 0.3, y: 0 })).toMatchObject({ rings: 3 })
      expect(drag(concentric(), isKind('rings'), { x: 0.14, y: 0 })).toMatchObject({ rings: 2 })
    })

    it('外側のハンドルを内へ押しても 1つより減らさない', () => {
      expect(drag(concentric(), isKind('rings'), { x: -0.6, y: 0 })).toMatchObject({ rings: 1 })
    })

    it('内側のハンドルは、中心からの距離を内側の余白にする（輪の数は変えない）', () => {
      const shape = concentric()
      const grip = gripOf(shape, isKind('inner'))
      const resized = dragShape(shape, grip, grip.point, { x: 2, y: 1.3 }) as ConcentricShape

      expect(resized.innerRadius).toBeCloseTo(0.3)
      expect(resized.rings).toBe(2)
    })
  })

  it('元の図形は書き換えない', () => {
    const shape = straight()
    drag(shape, isKind('move'), { x: 1, y: 0 })

    expect(shape.position).toEqual({ x: 2, y: 1 })
  })
})
