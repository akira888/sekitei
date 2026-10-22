import { describe, expect, it } from 'vitest'
import { parseScene, toScene } from './scene'
import type { ConcentricShape, StraightShape } from '../sand/shapes'

const straight: StraightShape = {
  type: 'straight', position: { x: 2, y: 1 }, angle: 0, rows: 8, rake: { tines: 5, spacing: 0.05 },
}
const concentric: ConcentricShape = {
  type: 'concentric', center: { x: 2.75, y: 1 }, innerRadius: 0.1, rings: 3, rake: { tines: 5, spacing: 0.05 },
}

describe('toScene', () => {
  it('図形の配列に version 1 を添えて、保存する形にする', () => {
    expect(toScene([straight, concentric])).toEqual({ version: 1, shapes: [straight, concentric] })
  })
})

describe('parseScene', () => {
  it('version 1 の scene から、図形をレイヤー順のまま読む', () => {
    const data: unknown = JSON.parse(JSON.stringify({ version: 1, shapes: [straight, concentric] }))

    expect(parseScene(data).shapes).toEqual([straight, concentric])
  })

  it('知らない version の scene は、読み違えないよう読まずにエラーにする', () => {
    expect(() => parseScene({ version: 2, shapes: [] })).toThrow()
  })

  it('図形の配列がない scene はエラーにする', () => {
    expect(() => parseScene({ version: 1 })).toThrow()
    expect(() => parseScene(null)).toThrow()
  })
})
