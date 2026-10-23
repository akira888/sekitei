import { describe, expect, it } from 'vitest'
import { CURB } from './curb'
import { GRAVEL, scatterGravel } from './scatter'

// 庭 4m × 2m。砂のすぐ外の縁石の外側から、幅 15cm の溝に砂利を敷く
const garden = { width: 4, depth: 2 }
const pebbles = scatterGravel(garden)
const c = CURB.width
const inside = (x: number, y: number) => x >= -c && y >= -c && x <= garden.width + c && y <= garden.depth + c
const outer = c + GRAVEL.width

describe('scatterGravel', () => {
  it('小石は内側の縁石の外側、幅 15cm の溝の中にだけ置く', () => {
    for (const { x, y } of pebbles) {
      expect(inside(x, y)).toBe(false)
      expect(x).toBeGreaterThanOrEqual(-outer)
      expect(x).toBeLessThanOrEqual(garden.width + outer)
      expect(y).toBeGreaterThanOrEqual(-outer)
      expect(y).toBeLessThanOrEqual(garden.depth + outer)
    }
  })

  it('小石は縁石の上にはみ出さない（内側・外側の縁石から小石の半径ぶん以上離す）', () => {
    for (const { x, y, size } of pebbles) {
      const r = size / 2
      expect(x > -c - r && y > -c - r && x < garden.width + c + r && y < garden.depth + c + r).toBe(false)
      expect(x < -outer + r || y < -outer + r || x > garden.width + outer - r || y > garden.depth + outer - r).toBe(false)
    }
  })

  it('縁の面積に密度を掛けたくらいの数を、縁全体にむらなく置く', () => {
    const area = (garden.width + 2 * outer) * (garden.depth + 2 * outer) - (garden.width + 2 * c) * (garden.depth + 2 * c)
    expect(pebbles.length).toBeGreaterThan(area * GRAVEL.density * 0.6) // 縁石の際の、小石の半径ぶんは置かない
    expect(pebbles.length).toBeLessThan(area * GRAVEL.density * 1.1)

    // 奥の帯と左の帯で、1m あたりの数がほぼ同じ（どの辺にも同じ密度で置く）
    const top = pebbles.filter(({ y }) => y < -c).length / (garden.width + 2 * outer)
    const left = pebbles.filter(({ x, y }) => x < -c && y >= -c && y <= garden.depth + c).length / (garden.depth + 2 * c)
    expect(top / left).toBeGreaterThan(0.85)
    expect(top / left).toBeLessThan(1.15)
  })

  it('大きさ・向き・色の濃さは、決めた範囲の中でばらつく', () => {
    const sizes = pebbles.map((p) => p.size)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(GRAVEL.size.min)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(GRAVEL.size.max)
    expect(new Set(pebbles.map((p) => p.rotation)).size).toBeGreaterThan(pebbles.length / 2)
    for (const { shade } of pebbles) {
      expect(shade).toBeGreaterThan(0.8)
      expect(shade).toBeLessThan(1.2)
    }
  })

  it('毎回同じ並びにする（開き直しても縁の見た目が変わらない）', () => {
    expect(scatterGravel(garden)).toEqual(pebbles)
  })
})
