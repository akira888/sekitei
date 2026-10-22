import { describe, expect, it } from 'vitest'
import { RakePlayback, planPreview } from './playback'
import { SandField, rakeField } from '../sand/rake'
import { seatedField } from '../sand/seating'
import { shapeToStrokes, type Shape } from '../sand/shapes'

// 庭 2m × 1m を 1m = 100 マス（200 × 100 マス）で掻く。歯 3本・間隔 6cm（帯の幅 18 マス）
const GARDEN = { width: 2, depth: 1 }
const rake = { tines: 3, spacing: 0.06 }
const circleA: Shape = { type: 'concentric', center: { x: 0.4, y: 0.5 }, innerRadius: 0.05, rings: 1, rake } // 左の輪（x = 15〜65 マスを掻く）
const circleC: Shape = { type: 'concentric', center: { x: 1.6, y: 0.5 }, innerRadius: 0.05, rings: 1, rake } // 右の輪（x = 135〜185 マス）
const bandB: Shape = { type: 'straight', position: { x: 0.4, y: 0.5 }, angle: 90, rows: 1, rake } // 左の輪を縦に横切る帯
const fill: Shape = { type: 'straight', position: { x: 1, y: 0.5 }, angle: 0, rows: 6, rake } // 庭全体の敷き詰め
const twoRows: Shape = { type: 'straight', position: { x: 1, y: 0.5 }, angle: 0, rows: 2, rake } // y = 41 を右へ、y = 59 を左へ掻く2本

// 巡航 1 m/s、加速と減速 0.2 秒、まとまりの間 0.5 秒、最初の間なし
const options = { speed: 1, ramp: 0.2, pause: 0.5, leadIn: 0 }

const strokesOf = (shapes: Shape[]) => shapes.map((shape) => shapeToStrokes(shape, GARDEN, 100))
const plan = (shapes: Shape[], base = new SandField(200, 100)) => planPreview(strokesOf(shapes), base, 100, options)

// 配列の順に1本ずつ掻いた砂
const raked = (shapes: Shape[], base = new SandField(200, 100)) => {
  const field = base.clone()
  for (const strokes of strokesOf(shapes)) for (const { path, style } of strokes) rakeField(field, path, style)
  return field
}

describe('planPreview', () => {
  it('掻く範囲が重ならない図形は同じまとまりに、重なる図形は下のレイヤーから順に別のまとまりにする', () => {
    expect(plan([circleA, circleC]).steps).toEqual([[0, 1]])
    expect(plan([fill, circleA]).steps).toEqual([[0], [1]])
    // C は最後に置いたが、A にも B にも重ならないので A と一緒に先に掻く
    expect(plan([circleA, bandB, circleC]).steps).toEqual([[0, 2], [1]])
  })
})

describe('RakePlayback', () => {
  it('最初のまとまりを掻き終えた時点では、敷き詰めは終わっていて、上に重ねる同心円にはまだ手を付けない', () => {
    const preview = plan([fill, circleA])
    const field = new SandField(200, 100)
    const player = new RakePlayback(field, preview)

    const step = preview.timeline.steps[0]
    player.advance(step.start + step.duration + 0.25) // まとまりの間の休み

    expect(field.h).toEqual(raked([fill]).h)
  })

  // 見せる時刻は Float32 で持つので、丸めで最後の刻みに届かずに残らないよう、掻き終えた時刻で残りをすべて書き込む
  it('まとまりをちょうど掻き終えた時刻には、そのまとまりのマスをすべて書き込んでいる', () => {
    const preview = plan([fill, circleA])
    const atFirstEnd = new SandField(200, 100)
    const atLastEnd = new SandField(200, 100)
    const step = preview.timeline.steps[0]

    new RakePlayback(atFirstEnd, preview).advance(step.start + step.duration)
    new RakePlayback(atLastEnd, preview).advance(preview.timeline.duration)

    expect(atFirstEnd.h).toEqual(raked([fill]).h)
    expect(atLastEnd.h).toEqual(raked([fill, circleA]).h)
  })

  it('最後まで書き込むと、配列の順に1本ずつ掻いた砂と同じになる（順番が入れ替わるときも、隣り合う帯があるときも）', () => {
    const shapes = [circleA, bandB, circleC, twoRows]
    const preview = plan(shapes)
    const advanced = new SandField(200, 100)
    new RakePlayback(advanced, preview).advance(preview.timeline.duration + 1)
    const finished = new SandField(200, 100)
    const player = new RakePlayback(finished, preview)
    player.advance(1)

    player.finish()

    expect(advanced.h).toEqual(raked(shapes).h)
    expect(finished.h).toEqual(raked(shapes).h)
  })

  it('石を据えた砂から掻くと、最後は石を据えた砂に1本ずつ掻いた砂と同じになり、石の周りは盛りのまま残る', () => {
    // 敷き詰めの真ん中に石を据える（輪郭は 0.9〜1.1m × 0.4〜0.6m の正方形）
    const base = () => seatedField([[{ x: 0.9, y: 0.4 }, { x: 1.1, y: 0.4 }, { x: 1.1, y: 0.6 }, { x: 0.9, y: 0.6 }]], 200, 100, 100)
    const preview = plan([fill], base())
    const field = base()
    new RakePlayback(field, preview).advance(preview.timeline.duration + 1)

    expect(field.h).toEqual(raked([fill], base()).h)
    expect(field.at(100, 50)).toEqual(base().at(100, 50))
    expect(field.at(30, 50)).not.toEqual(0) // 石から離れた所は掻いている
  })

  it('同じまとまりのストロークは同時に進む（途中で、平行な2本の始点側はどちらも書き込まれていて、先はまだ）', () => {
    const preview = plan([twoRows])
    const field = new SandField(200, 100)
    const step = preview.timeline.steps[0]

    new RakePlayback(field, preview).advance(step.start + step.duration / 2) // どちらのレーキも x = 100 付近

    expect(field.at(20, 41)).toBeCloseTo(-0.75) // 右へ掻く帯の始点側（真ん中の歯の溝）
    expect(field.at(180, 59)).toBeCloseTo(-0.75) // 左へ掻く帯の始点側
    expect(field.at(180, 41)).toBe(0) // 右へ掻く帯の先
    expect(field.at(20, 59)).toBe(0) // 左へ掻く帯の先
  })

  it('書き込んだマスを含む区画ごとの範囲を返し、離れた2か所を同時に掻いても間の区画は含めない', () => {
    const preview = plan([twoRows])
    const field = new SandField(200, 100)
    const player = new RakePlayback(field, preview)
    player.advance(0.3)
    const before = Float32Array.from(field.h)

    const rects = player.advance(0.4) // 左端と右端の近くを同時に掻いている
    const inside = (x: number, y: number) => rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)

    for (let k = 0; k < field.h.length; k++) {
      if (field.h[k] !== before[k]) expect(inside(k % 200, Math.floor(k / 200))).toBe(true)
    }
    expect(inside(100, 41)).toBe(false)
    expect(inside(100, 59)).toBe(false)
  })

  it('同じ時刻のままなら何も書き込まない', () => {
    const player = new RakePlayback(new SandField(200, 100), plan([twoRows]))
    player.advance(0.5)

    expect(player.advance(0.5)).toEqual([])
  })
})
