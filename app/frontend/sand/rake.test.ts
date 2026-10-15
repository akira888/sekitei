import { describe, expect, it } from 'vitest'
import { SandField, rakeField, type RakeStyle } from './rake'

const style: RakeStyle = { tines: 3, spacing: 12, depth: 1.5, grooveWidth: 5, pileWidth: 7 }

// 横一直線に x=10..90 を 2px 間隔で進むパス
const horizontal = (y: number) => Array.from({ length: 41 }, (_, i) => ({ x: 10 + i * 2, y }))
const vertical = (x: number) => Array.from({ length: 41 }, (_, i) => ({ x, y: 10 + i * 2 }))

describe('rakeField', () => {
  it('各歯の中心に深さ depth の溝を掘る', () => {
    const field = new SandField(100, 100)
    rakeField(field, horizontal(50), style)

    for (const y of [38, 50, 62]) expect(field.at(50, y)).toBeCloseTo(-1.5)
  })

  it('歯と歯の間は掘った砂が盛られて山になる', () => {
    const field = new SandField(100, 100)
    rakeField(field, horizontal(50), style)

    expect(field.at(50, 44)).toBeGreaterThan(0)
  })

  it('レーキが届かない場所の高さは変えない', () => {
    const field = new SandField(100, 100)
    rakeField(field, horizontal(50), style)

    expect(field.at(50, 10)).toBe(0)
    expect(field.at(50, 90)).toBe(0)
  })

  it('後から掻いた砂紋が交差点の古い溝を消す', () => {
    const field = new SandField(100, 100)
    rakeField(field, vertical(50), style)
    rakeField(field, horizontal(50), style)

    // 古い縦の溝（x=38）は、新しい横の歯の間（y=44）では山に埋まっている
    expect(field.at(38, 44)).toBeGreaterThan(0)
  })
})
