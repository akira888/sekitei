import { describe, expect, it } from 'vitest'
import type { Stone } from '../stone/stone'
import { changeStoneParam, dragStone, hitStone, newStone, reshapeStone, STONE, stoneGrips } from './stones'

// 庭の中ほどに置いた、大きさ 40cm の石を基本に、テストごとに一部の値だけ変える
const stone = (overrides: Partial<Stone> = {}): Stone => ({
  type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, seed: 1 }, position: { x: 1, y: 1 }, rotation: 0, ...overrides,
})

describe('newStone', () => {
  it('置いた位置に、既定の大きさ・背の高さ・ゴツゴツ度と、渡された seed の石を作る', () => {
    expect(newStone({ x: 1.5, y: 0.5 }, 42)).toEqual({
      type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, seed: 42 }, position: { x: 1.5, y: 0.5 }, rotation: 0,
    })
  })
})

describe('reshapeStone', () => {
  it('seed だけを変え、大きさ・位置・向きは保つ', () => {
    const before = stone({ rotation: 30 })

    expect(reshapeStone(before, 7)).toEqual({ ...before, params: { ...before.params, seed: 7 } })
  })
})

describe('changeStoneParam', () => {
  it('スライダーの刻みに丸めて変える', () => {
    expect(changeStoneParam(stone(), 'size', 0.72).params.size).toBeCloseTo(0.7)
    expect(changeStoneParam(stone(), 'tallness', 1.03).params.tallness).toBeCloseTo(1.05)
  })

  it('範囲の外の値は範囲の端にする', () => {
    expect(changeStoneParam(stone(), 'size', 5).params.size).toBe(STONE.size.max)
    expect(changeStoneParam(stone(), 'roughness', -1).params.roughness).toBe(STONE.roughness.min)
  })

  it('ほかのパラメータと seed は変えない', () => {
    const changed = changeStoneParam(stone(), 'roughness', 0.8)

    expect(changed.params).toEqual({ size: 0.4, tallness: 0.6, roughness: 0.8, seed: 1 })
  })
})

describe('stoneGrips', () => {
  it('目印は石の中心、回転ハンドルは石の縁の外を、石の向きの先に置く', () => {
    const [move, rotate] = stoneGrips(stone({ rotation: 90 }))

    expect(move).toEqual({ kind: 'move', point: { x: 1, y: 1 } })
    expect(rotate.kind).toBe('rotate')
    // 90° は画面の下向き（庭の y が増える向き）
    expect(rotate.point.x).toBeCloseTo(1)
    expect(rotate.point.y).toBeGreaterThan(1 + 0.2)
  })
})

describe('hitStone', () => {
  it('真上から見た輪郭を、直径が大きさの円とみなして当てる', () => {
    expect(hitStone([stone()], { x: 1.19, y: 1 })).toBe(0)
    expect(hitStone([stone()], { x: 1.21, y: 1 })).toBeUndefined()
  })

  it('重なっていれば、後から置いた石を選ぶ', () => {
    const stones = [stone(), stone({ position: { x: 1.1, y: 1 } })]

    expect(hitStone(stones, { x: 1.05, y: 1 })).toBe(1)
  })
})

describe('dragStone', () => {
  it('目印をつかんで動かすと、つかんだ位置とのずれを保って石を動かす', () => {
    const before = stone()
    const [move] = stoneGrips(before)

    const moved = dragStone(before, move, { x: 1.02, y: 1.01 }, { x: 1.52, y: 0.81 })

    expect(moved.position.x).toBeCloseTo(1.5)
    expect(moved.position.y).toBeCloseTo(0.8)
  })

  it('回転ハンドルを回すと、ハンドルが動いた先を向く', () => {
    const before = stone()
    const [, rotate] = stoneGrips(before)

    // ハンドルを中心の真下（画面で下）まで回す
    const start = rotate.point
    const turned = dragStone(before, rotate, start, { x: 1, y: 1 + (start.x - 1) })

    expect(turned.rotation).toBeCloseTo(90)
    expect(turned.position).toEqual(before.position)
  })

  it('元の石は書き換えない', () => {
    const before = stone()
    const [move] = stoneGrips(before)

    dragStone(before, move, { x: 1, y: 1 }, { x: 2, y: 1 })

    expect(before.position).toEqual({ x: 1, y: 1 })
  })
})
