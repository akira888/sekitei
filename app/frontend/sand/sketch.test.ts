import { describe, expect, it } from 'vitest'
import { sketchOps } from './sketch'
import type { Stroke } from './shapes'
import type { RakeStyle } from './rake'

// 歯 3本・間隔 12 → 中心から外側の歯まで 12。溝の半分 2.5、盛り 7
const style: RakeStyle = { tines: 3, spacing: 12, grooveWidth: 5, pileWidth: 7, depth: 1.5 }
// x 方向に進む水平なパス。左向きの法線は +y
const horizontal = (y: number): Stroke => ({ path: [{ x: 0, y }, { x: 50, y }, { x: 100, y }], style })

describe('sketchOps', () => {
  it('パスごとに「消す → 歯の線」の順で、パスの順番どおりに並べる', () => {
    const ops = sketchOps([horizontal(20), horizontal(60)])

    expect(ops.map((op) => op.kind)).toEqual(['erase', 'line', 'line', 'line', 'erase', 'line', 'line', 'line'])
    expect(ops[0].path[0].y).toBe(20)
    expect(ops[4].path[0].y).toBe(60)
  })

  it('消す幅は、掻く処理が届く範囲（外側の歯まで + 溝の半分 + 盛りの幅）の両側ぶん', () => {
    const [erase] = sketchOps([horizontal(20)])

    expect(erase.width).toBeCloseTo(2 * (12 + 2.5 + 7))
  })

  it('歯の線は、歯の本数ぶん、パスを歯の位置まで横にずらして引く', () => {
    const lines = sketchOps([horizontal(20)], undefined, 1.5).filter((op) => op.kind === 'line')

    expect(lines.map(({ path }) => path.map((p) => p.y))).toEqual([
      [8, 8, 8],
      [20, 20, 20],
      [32, 32, 32],
    ])
    for (const line of lines) {
      expect(line.width).toBe(1.5)
      expect(line.path.map((p) => p.x)).toEqual([0, 50, 100])
    }
  })

  it('隣に並ぶ帯の外側の歯の線は、次の帯の消す範囲に入らない', () => {
    // 帯の幅 = 歯 3本 × 間隔 12 = 36。隣の帯の外側の歯は中心から 36 - 12 = 24 離れる
    const [erase] = sketchOps([horizontal(20)])

    expect(erase.width / 2).toBeLessThan(24)
  })
})

describe('sketchOps の石', () => {
  const outline = [{ x: 40, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 30 }, { x: 40, y: 30 }]

  it('すべての線の後に、石の輪郭を余白の幅ぶん太らせて塗り、下の線を消す（掻かずに残す範囲と同じ）', () => {
    const ops = sketchOps([horizontal(20)], { outlines: [outline], margin: 3 })

    expect(ops.map((op) => op.kind)).toEqual(['erase', 'line', 'line', 'line', 'cover'])
    expect(ops.at(-1)).toEqual({ kind: 'cover', path: outline, width: 6 })
  })
})
