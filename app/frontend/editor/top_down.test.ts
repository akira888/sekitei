import { describe, expect, it } from 'vitest'
import { gardenToScreen, screenToGarden, topDownFrustum } from './top_down'

const garden = { width: 4, depth: 2 }

describe('topDownFrustum', () => {
  it('画面が庭より横長なら、奥行きに余白を足した高さで合わせ、幅は画面の比率で広げる', () => {
    const f = topDownFrustum(garden, { width: 900, height: 300 }, 0.1)

    expect(f.top - f.bottom).toBeCloseTo(2 * 1.1)
    expect(f.right - f.left).toBeCloseTo(2 * 1.1 * 3)
  })

  it('画面が庭より縦長なら、幅に余白を足した幅で合わせ、高さは画面の比率で広げる', () => {
    const f = topDownFrustum(garden, { width: 400, height: 400 }, 0.1)

    expect(f.right - f.left).toBeCloseTo(4 * 1.1)
    expect(f.top - f.bottom).toBeCloseTo(4 * 1.1)
  })

  it('庭の中心が画面の中心に来る', () => {
    const f = topDownFrustum(garden, { width: 600, height: 400 }, 0.1)

    expect(f.left + f.right).toBeCloseTo(0)
    expect(f.top + f.bottom).toBeCloseTo(0)
  })

  describe('上の帯（パレットと操作ボタン）の高さぶん空けるとき', () => {
    const viewport = { width: 880, height: 500 }
    const insets = { top: 60 }
    const f = topDownFrustum(garden, viewport, 0.1, insets)
    const corners = [{ x: 0, y: 0 }, { x: 4, y: 2 }].map((p) => gardenToScreen(p, viewport, f, garden))

    it('庭（余白込み）を、空けた残りの範囲に収める', () => {
      // 残りは 880 × 440 px。庭 4.4m × 2.2m がちょうど収まり、1m = 200px
      expect(corners[1].x - corners[0].x).toBeCloseTo(4 * 200)
      expect(corners[0].y).toBeGreaterThanOrEqual(insets.top)
      expect(corners[1].y).toBeLessThanOrEqual(viewport.height)
    })

    it('庭の中心が、空けた残りの範囲の中心に来る', () => {
      const center = gardenToScreen({ x: 2, y: 1 }, viewport, f, garden)

      expect(center.x).toBeCloseTo(440)
      expect(center.y).toBeCloseTo(60 + 440 / 2)
    })
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
