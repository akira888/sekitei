import { describe, expect, it } from 'vitest'
import { parseScene, toScene } from './scene'
import type { ConcentricShape, StraightShape } from '../sand/shapes'
import type { Stone } from '../stone/stone'

const straight: StraightShape = {
  type: 'straight', position: { x: 2, y: 1 }, angle: 0, rows: 8, rake: { tines: 5, spacing: 0.05 },
}
const concentric: ConcentricShape = {
  type: 'concentric', center: { x: 2.75, y: 1 }, innerRadius: 0.1, rings: 3, rake: { tines: 5, spacing: 0.05 },
}
const stone: Stone = {
  type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, seed: 12345 }, position: { x: 1, y: 0.5 }, rotation: 30,
}

describe('toScene', () => {
  it('図形と石の配列に version 1 を添えて、保存する形にする', () => {
    expect(toScene([straight, concentric], [stone])).toEqual({ version: 1, shapes: [straight, concentric], stones: [stone] })
  })
})

describe('parseScene', () => {
  it('version 1 の scene から、図形をレイヤー順のまま読む', () => {
    const data: unknown = JSON.parse(JSON.stringify({ version: 1, shapes: [straight, concentric] }))

    expect(parseScene(data).shapes).toEqual([straight, concentric])
  })

  it('石を保存したときの形のまま読む', () => {
    const data: unknown = JSON.parse(JSON.stringify({ version: 1, shapes: [], stones: [stone] }))

    expect(parseScene(data).stones).toEqual([stone])
  })

  it('石を足す前の scene（stones がない）は、石のない庭として読む', () => {
    expect(parseScene({ version: 1, shapes: [straight] }).stones).toEqual([])
  })

  it('石の配列が配列でない scene はエラーにする', () => {
    expect(() => parseScene({ version: 1, shapes: [], stones: {} })).toThrow()
  })

  it('知らない version の scene は、読み違えないよう読まずにエラーにする', () => {
    expect(() => parseScene({ version: 2, shapes: [] })).toThrow()
  })

  it('図形の配列がない scene はエラーにする', () => {
    expect(() => parseScene({ version: 1 })).toThrow()
    expect(() => parseScene(null)).toThrow()
  })
})
