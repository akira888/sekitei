import { describe, expect, it } from 'vitest'
import { topDownFrustum } from './top_down'

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
