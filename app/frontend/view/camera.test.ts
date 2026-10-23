import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, EDIT_LIMITS, clampView, positionToView, viewToPosition, viewingLimits } from './camera'

describe('視点と位置の変換', () => {
  it('既定の視点は、今の仕上がりの初期の位置（手前から斜めに見下ろす）', () => {
    const { x, y, z } = viewToPosition(DEFAULT_VIEW)

    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1.6)
    expect(z).toBeCloseTo(2.6)
  })

  it('左右の角度は、手前（+z）から右（+x）へ回る向きに増える（OrbitControls と同じ）', () => {
    const { x, z } = viewToPosition({ ...DEFAULT_VIEW, azimuth: 90 })

    expect(x).toBeGreaterThan(0)
    expect(z).toBeCloseTo(0)
  })

  it('位置から視点に戻すと元の視点になる', () => {
    const view = { azimuth: -120, polar: 40, distance: 2.5 }
    const back = positionToView(viewToPosition(view))

    expect(back.azimuth).toBeCloseTo(-120)
    expect(back.polar).toBeCloseTo(40)
    expect(back.distance).toBeCloseTo(2.5)
  })
})

describe('clampView', () => {
  it('上下の角度と距離は、編集中に回せる範囲に収める。左右の角度は -180〜180 に直す', () => {
    const view = clampView({ azimuth: 270, polar: 5, distance: 50 })

    expect(view.azimuth).toBeCloseTo(-90)
    expect(view.polar).toBe(EDIT_LIMITS.polar.min)
    expect(view.distance).toBe(EDIT_LIMITS.distance.max)
  })

  it('範囲の中の値は変えない', () => {
    expect(clampView(DEFAULT_VIEW)).toEqual(DEFAULT_VIEW)
  })
})

describe('viewingLimits', () => {
  it('完成した庭を見る人は、保存した視点から左右 ±90°・上下 ±10° だけ動ける', () => {
    const limits = viewingLimits({ azimuth: 20, polar: 50, distance: 3 })

    expect(limits.azimuth).toEqual({ min: -70, max: 110 })
    expect(limits.polar).toEqual({ min: 40, max: 60 })
  })

  it('寄る・離れるは少しだけ。上下は編集中に回せる範囲からはみ出さない', () => {
    const limits = viewingLimits({ azimuth: 0, polar: EDIT_LIMITS.polar.max - 2, distance: 3 })

    expect(limits.distance.min).toBeGreaterThan(3 * 0.7)
    expect(limits.distance.min).toBeLessThan(3)
    expect(limits.distance.max).toBeGreaterThan(3)
    expect(limits.distance.max).toBeLessThan(3 * 1.3)
    expect(limits.polar.max).toBe(EDIT_LIMITS.polar.max)
  })
})
