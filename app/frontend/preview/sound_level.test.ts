import { describe, expect, it } from 'vitest'
import { grainBoost, synthSpeed } from './sound_level'

describe('synthSpeed', () => {
  it('実寸 1.7 m/s を 1 とする目盛りで、レーキの速さをシンセの速度にする', () => {
    expect(synthSpeed(0.85)).toBeCloseTo(0.5)
    expect(synthSpeed(1)).toBeCloseTo(0.588, 3)
  })

  it('止まっていれば 0、速すぎても 1 にとどめる', () => {
    expect(synthSpeed(0)).toBe(0)
    expect(synthSpeed(5)).toBe(1)
  })
})

describe('grainBoost', () => {
  it('同時に動くレーキが多いほど粒を少しだけ増やし、2本で 1.05 倍、8本で 1.15 倍、それより多くても 1.15 倍にとどめる', () => {
    expect(grainBoost(1)).toBe(1)
    expect(grainBoost(2)).toBeCloseTo(1.05)
    expect(grainBoost(8)).toBeCloseTo(1.15)
    expect(grainBoost(32)).toBeCloseTo(1.15)
  })
})
