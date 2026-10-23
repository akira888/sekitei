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
  type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, moss: 0.3, seed: 12345 }, position: { x: 1, y: 0.5 }, rotation: 30,
}

describe('toScene', () => {
  it('図形と石の配列に version 1 を添えて、保存する形にする', () => {
    expect(toScene([straight, concentric], [stone], { edge: true }))
      .toEqual({ version: 1, shapes: [straight, concentric], stones: [stone], gravel: { edge: true } })
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

  it('苔の量を足す前に保存した石は、苔のない石として読む', () => {
    const { moss: _, ...withoutMoss } = stone.params
    const data = { version: 1, shapes: [], stones: [{ ...stone, params: withoutMoss }] }

    expect(parseScene(data).stones[0].params).toEqual({ ...withoutMoss, moss: 0 })
  })

  it('砂利の縁の設定を読む', () => {
    expect(parseScene({ version: 1, shapes: [], gravel: { edge: true } }).gravel).toEqual({ edge: true })
    expect(parseScene({ version: 1, shapes: [], gravel: { edge: false } }).gravel).toEqual({ edge: false })
  })

  it('砂利を足す前に保存した庭は、見た目を変えないよう砂利なしとして読む', () => {
    expect(parseScene({ version: 1, shapes: [] }).gravel).toEqual({ edge: false })
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

  // 共有された庭を開いた人の画面が固まらないよう、読むときに極端な値を範囲に収める
  describe('極端な値', () => {
    const read = (data: object) => parseScene({ version: 1, shapes: [], ...data })

    it('図形は 100個、石は 30個までを読む（後ろは捨てる）', () => {
      const scene = read({ shapes: Array(150).fill(straight), stones: Array(50).fill(stone) })

      expect(scene.shapes).toHaveLength(100)
      expect(scene.stones).toHaveLength(30)
    })

    it('帯・輪の数は 1〜60、歯の本数と間隔は編集画面と同じ範囲に収める', () => {
      const scene = read({
        shapes: [
          { ...straight, rows: 100000, rake: { tines: 500, spacing: 5 } },
          { ...concentric, rings: -3, rake: { tines: 0, spacing: 0 } },
        ],
      })

      expect(scene.shapes[0]).toMatchObject({ rows: 60, rake: { tines: 10, spacing: 0.1 } })
      expect(scene.shapes[1]).toMatchObject({ rings: 1, rake: { tines: 2, spacing: 0.03 } })
    })

    it('石の大きさ・背の高さ・ゴツゴツ度・苔は、編集画面のスライダーと同じ範囲に収める', () => {
      const scene = read({ stones: [{ ...stone, params: { size: 30, tallness: 0, roughness: 9, moss: -1, seed: 7 } }] })

      expect(scene.stones[0].params).toEqual({ size: 1.2, tallness: 0.25, roughness: 1, moss: 0, seed: 7 })
    })

    it('範囲の中の値は変えない', () => {
      expect(read({ shapes: [straight, concentric], stones: [stone] })).toMatchObject({ shapes: [straight, concentric], stones: [stone] })
    })
  })

  describe('鑑賞の始まりの視点', () => {
    it('完成したときに保存した視点を読む', () => {
      const camera = { azimuth: 30, polar: 50, distance: 3 }

      expect(parseScene({ version: 1, shapes: [], camera }).camera).toEqual(camera)
    })

    it('視点を持たない庭は、視点なしとして読む（既定の視点から見る）', () => {
      expect(parseScene({ version: 1, shapes: [] }).camera).toBeUndefined()
    })

    it('範囲の外の視点は範囲に収める', () => {
      expect(parseScene({ version: 1, shapes: [], camera: { azimuth: 0, polar: 0, distance: 100 } }).camera)
        .toMatchObject({ polar: 15, distance: 5 })
    })

    it('保存するときは、視点があれば添える', () => {
      const camera = { azimuth: 30, polar: 50, distance: 3 }

      expect(toScene([], [], { edge: true }, camera)).toMatchObject({ camera })
      expect(toScene([], [], { edge: true })).not.toHaveProperty('camera')
    })
  })
})
