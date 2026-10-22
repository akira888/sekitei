import { describe, expect, it } from 'vitest'
import { rakeLevels } from './levels'

describe('rakeLevels', () => {
  it('止まっているときは無音', () => {
    expect(rakeLevels(0)).toEqual({ noise: 0, grains: 0, grainSpeed: 0 })
  })

  it('ノイズの音量は速さの平方根に比例し、速くても頭打ちにしない', () => {
    // 速さが4倍なら音量は2倍。速いときにノイズを頭打ちにすると、1 と 0.25 の比が 2 より小さくなる
    expect(rakeLevels(1).noise / rakeLevels(0.25).noise).toBeCloseTo(2)
    expect(rakeLevels(0.04).noise / rakeLevels(0.01).noise).toBeCloseTo(2)
  })

  it('粒全体の音量は、動いていれば速さによらず同じ', () => {
    expect(rakeLevels(0.2).grains).toBeGreaterThan(0)
    expect(rakeLevels(0.9).grains).toBe(rakeLevels(0.2).grains)
  })

  it('粒の速さ（粒の数と1粒の大きさ）は、同時に動くレーキの分だけ増やし、1 を超えない', () => {
    expect(rakeLevels(0.5).grainSpeed).toBeCloseTo(0.5)
    expect(rakeLevels(0.5, 1.15).grainSpeed).toBeCloseTo(0.575)
    expect(rakeLevels(0.95, 1.15).grainSpeed).toBe(1)
  })
})
