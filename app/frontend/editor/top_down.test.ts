import { describe, expect, it } from 'vitest'
import { gardenToScreen, screenToGarden, topDownFrustum } from './top_down'

const garden = { width: 4, depth: 2 }

describe('topDownFrustum', () => {
  it('画面が庭より横長なら、奥行きに余白を足した高さで合わせ、幅は画面の比率で広げる', () => {
    const f = topDownFrustum(garden, 3, 0.1)

    expect(f.top - f.bottom).toBeCloseTo(2 * 1.1)
    expect(f.right - f.left).toBeCloseTo(2 * 1.1 * 3)
  })

  it('画面が庭より縦長なら、幅に余白を足した幅で合わせ、高さは画面の比率で広げる', () => {
    const f = topDownFrustum(garden, 1, 0.1)

    expect(f.right - f.left).toBeCloseTo(4 * 1.1)
    expect(f.top - f.bottom).toBeCloseTo(4 * 1.1)
  })

  it('庭の中心が画面の中心に来る', () => {
    const f = topDownFrustum(garden, 1.5, 0.1)

    expect(f.left + f.right).toBeCloseTo(0)
    expect(f.top + f.bottom).toBeCloseTo(0)
  })
})

describe('画面と庭の座標の変換', () => {
  // 600 × 300 px の画面に 6m × 3m を映す → 1m = 100px。庭 4m × 2m が中央に来る
  const frustum = { left: -3, right: 3, top: 1.5, bottom: -1.5 }
  const viewport = { width: 600, height: 300 }

  it('画面の中心は庭の中心、画面の左上は庭の左上から余白ぶん外に出た点になる', () => {
    expect(screenToGarden({ x: 300, y: 150 }, viewport, frustum, garden)).toEqual({ x: 2, y: 1 })
    expect(screenToGarden({ x: 0, y: 0 }, viewport, frustum, garden)).toEqual({ x: -1, y: -0.5 })
  })

  it('庭から画面へ戻すと元の画面の座標になる', () => {
    const pixel = { x: 123, y: 45 }
    const back = gardenToScreen(screenToGarden(pixel, viewport, frustum, garden), viewport, frustum, garden)

    expect(back.x).toBeCloseTo(pixel.x)
    expect(back.y).toBeCloseTo(pixel.y)
  })
})
