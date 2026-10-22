import { describe, expect, it } from 'vitest'
import { RakePlayback, planRake } from './playback'
import { buildTimeline } from './timeline'
import { SandField, applyEffect, rakeField, type RakeStyle } from '../sand/rake'
import type { Stroke } from '../sand/shapes'

const style: RakeStyle = { tines: 3, spacing: 12, depth: 1.5, grooveWidth: 5, pileWidth: 7 }
// 100 × 100 マスの砂に、横（y=50 を x=10→90）と縦（x=50 を y=10→90）の順に掻く。点は 2 マス間隔
const strokes: Stroke[] = [
  { path: Array.from({ length: 41 }, (_, i) => ({ x: 10 + i * 2, y: 50 })), style },
  { path: Array.from({ length: 41 }, (_, i) => ({ x: 50, y: 10 + i * 2 })), style },
]

// 1m = 100 マスなので各ストロークは 0.8m。巡航 1 m/s・加速と減速 0.2 秒で 0.8 + 0.2 = 1.0 秒かかる。
// 横を 0〜1.0 秒、0.5 秒休んで縦を 1.5〜2.5 秒に掻く
const timeline = buildTimeline(strokes.map(({ path }) => path), 100, { speed: 1, ramp: 0.2, pause: 0.5, leadIn: 0 })

// 横・縦の順に一度に掻いた砂
const raked = () => {
  const field = new SandField(100, 100)
  for (const { path, style } of strokes) rakeField(field, path, style)
  return field
}

const playback = () => {
  const field = new SandField(100, 100)
  return { field, player: new RakePlayback(field, planRake(strokes, 100, 100), timeline) }
}

describe('planRake', () => {
  it('ストロークごとの結果を最後まで書き込むと、順に掻いた砂と同じになる', () => {
    const field = new SandField(100, 100)
    for (const effect of planRake(strokes, 100, 100)) applyEffect(field, effect)

    expect(field.h).toEqual(raked().h)
  })
})

describe('RakePlayback', () => {
  it('その時刻までにレーキが通った所だけを書き込む', () => {
    const { field, player } = playback()

    // 0.5 秒は横の途中。加速で 0.1m、巡航 0.3 秒で 0.3m 進み、0.4m（40 マス）先の x = 50 まで来ている
    player.advance(0.5)

    expect(field.at(30, 50)).toBeCloseTo(-1.5) // 通り過ぎた所は溝
    expect(field.at(70, 50)).toBe(0) // 先はまだ平ら
  })

  it('時刻を飛ばしても途中のストロークを書き漏らさず、書き込んだマスを囲む範囲を返す', () => {
    const { field, player } = playback()
    player.advance(0.2)
    const before = Float32Array.from(field.h)

    const rect = player.advance(2.0) // 縦の途中まで一気に進める

    expect(field.at(85, 50)).toBeCloseTo(raked().at(85, 50)) // 横の終わり近く（縦の影響を受けない所）は掻き終わっている
    const changed = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (let k = 0; k < field.h.length; k++) {
      if (field.h[k] === before[k]) continue
      const x = k % 100, y = Math.floor(k / 100)
      Object.assign(changed, { x0: Math.min(changed.x0, x), y0: Math.min(changed.y0, y), x1: Math.max(changed.x1, x), y1: Math.max(changed.y1, y) })
    }
    expect(rect).toEqual(changed)
  })

  it('同じ時刻のままなら何も書き込まない', () => {
    const { player } = playback()
    player.advance(0.5)

    expect(player.advance(0.5)).toBeUndefined()
  })

  it('finish で残りをすべて書き込み、順に掻いた砂と同じになる', () => {
    const { field, player } = playback()
    player.advance(0.5)

    player.finish()

    expect(field.h).toEqual(raked().h)
  })
})
