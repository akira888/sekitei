import { describe, expect, it } from 'vitest'
import type { Point } from '../sand/path'
import { stoneFootprint } from './footprint'
import type { Stone } from './stone'

const stone = (overrides: Partial<Stone> = {}): Stone => ({
  type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, moss: 0, seed: 1 }, position: { x: 1, y: 0.5 }, rotation: 0, ...overrides,
})

const extent = (points: Point[], key: 'x' | 'y') => Math.max(...points.map((p) => p[key])) - Math.min(...points.map((p) => p[key]))
const centroid = (points: Point[]) => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
})

describe('stoneFootprint', () => {
  it('砂の高さで切った石の輪郭を、石の位置を中心とする庭の座標[m] の多角形で返す', () => {
    const outline = stoneFootprint(stone())

    expect(outline.length).toBeGreaterThan(20)
    expect(centroid(outline).x).toBeCloseTo(1, 1)
    expect(centroid(outline).y).toBeCloseTo(0.5, 1)
  })

  it('砂の高さの断面は、石の差し渡し（大きさ）より少し小さい', () => {
    const width = extent(stoneFootprint(stone()), 'x')

    expect(width).toBeLessThanOrEqual(0.4)
    expect(width).toBeGreaterThan(0.4 * 0.5) // 石は下ほどすぼまり、高さの 15% を沈めているので、seed 1 では 6 割弱
  })

  it('石を 90° 回すと、長い方が庭の y の向きになる', () => {
    const plain = stoneFootprint(stone())
    const turned = stoneFootprint(stone({ rotation: 90 }))

    expect(extent(turned, 'y')).toBeCloseTo(extent(plain, 'x'), 6)
    expect(extent(turned, 'x')).toBeCloseTo(extent(plain, 'y'), 6)
  })

  it('点は中心の周りを一方向に回る順に並ぶ（塗りや内外の判定に使えるように）', () => {
    const outline = stoneFootprint(stone())
    const c = centroid(outline)
    const angles = outline.map((p) => Math.atan2(p.y - c.y, p.x - c.x))
    const turns = angles.slice(1).filter((a, i) => a < angles[i]).length

    expect(turns).toBeLessThanOrEqual(1) // -π から π へ1周するので、戻るのは1回だけ
  })
})
