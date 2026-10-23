import { describe, expect, it } from 'vitest'
import { CURB, curbBlocks } from './curb'

// 庭 4m × 2m。縁石は砂のすぐ外側（offset 0）と、砂利の溝の外側に置く
const garden = { width: 4, depth: 2 }
const blocks = curbBlocks(garden, 0)
// 石の範囲（庭の座標の矩形）
const rect = ({ x, y, length, along }: (typeof blocks)[number]) => along === 'x'
  ? { x0: x - length / 2, x1: x + length / 2, y0: y - CURB.width / 2, y1: y + CURB.width / 2 }
  : { x0: x - CURB.width / 2, x1: x + CURB.width / 2, y0: y - length / 2, y1: y + length / 2 }

describe('curbBlocks', () => {
  it('縁石は砂に掛からず、砂の外側の幅 8cm の帯の中に収まる', () => {
    for (const block of blocks) {
      const { x0, x1, y0, y1 } = rect(block)
      const overlapsSand = x1 > 0 && x0 < garden.width && y1 > 0 && y0 < garden.depth
      expect(overlapsSand).toBe(false)
      expect(x0).toBeGreaterThanOrEqual(-CURB.width - 1e-9)
      expect(x1).toBeLessThanOrEqual(garden.width + CURB.width + 1e-9)
      expect(y0).toBeGreaterThanOrEqual(-CURB.width - 1e-9)
      expect(y1).toBeLessThanOrEqual(garden.depth + CURB.width + 1e-9)
    }
  })

  it('長さ 60cm 前後の石を、継ぎ目を空けて外周にすき間なく並べる', () => {
    for (const { length } of blocks) {
      expect(length).toBeGreaterThan(0.45)
      expect(length).toBeLessThan(0.75)
    }
    // 4辺の石の長さと継ぎ目の合計が、帯の中心線の長さと同じ（奥・手前は角まで、左右は砂の奥行きだけ）
    const total = blocks.reduce((sum, b) => sum + b.length + CURB.joint, 0)
    expect(total).toBeCloseTo(2 * (garden.width + 2 * CURB.width) + 2 * garden.depth, 6)
  })

  it('外側の縁石は、渡した距離だけ外へずらした帯に並べる', () => {
    const outer = curbBlocks(garden, 0.3)
    for (const block of outer) {
      const { x0, y0 } = rect(block)
      expect(Math.min(x0, y0)).toBeGreaterThanOrEqual(-0.3 - CURB.width - 1e-9)
    }
    expect(outer.some((block) => rect(block).y0 < -0.3)).toBe(true)
  })

  it('石ごとの色の濃さはばらつき、毎回同じ（開き直しても縁の見た目が変わらない）', () => {
    expect(new Set(blocks.map((b) => b.shade)).size).toBeGreaterThan(blocks.length / 2)
    expect(curbBlocks(garden, 0)).toEqual(blocks)
  })
})
