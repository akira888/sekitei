import { describe, expect, it } from 'vitest'
import { buildTimeline, sampleTimeline } from './timeline'
import type { Point } from '../sand/path'

// 1m = 100 マス。点は 2 マス（0.02m）間隔で x 方向へ並べる
const CELLS_PER_METER = 100
const straight = (meters: number): Point[] =>
  Array.from({ length: Math.round(meters * 50) + 1 }, (_, i) => ({ x: i * 2, y: 0 }))

// 巡航 1 m/s、加速・減速 0.5 秒、休み 1 秒、最初の間 0.5 秒
const options = { speed: 1, ramp: 0.5, pause: 1, leadIn: 0.5 }

// 1本ずつの2まとまり。3m（151 点）は 3 / 1 + 0.5 = 3.5 秒、2m（101 点）は 2.5 秒。
// 0.5 秒待って 0.5〜4.0 秒に1つ目、1 秒休んで 5.0〜7.5 秒に2つ目を掻く
const oneByOne = () => buildTimeline([[straight(3)], [straight(2)]], CELLS_PER_METER, options)

describe('buildTimeline / sampleTimeline', () => {
  it('まとまりを順に掻き、まとまりの間にレーキを持ち上げる休みを入れる', () => {
    expect(oneByOne().duration).toBeCloseTo(7.5)

    const resting = sampleTimeline(oneByOne(), 4.5)
    expect(resting).toMatchObject({ step: 0, speed: 0, moving: 0, done: false })
    expect(resting.elapsed).toBeCloseTo(3.5) // 1つ目を掻き終えた所で止まっている

    const second = sampleTimeline(oneByOne(), 5.75)
    expect(second).toMatchObject({ step: 1, done: false })
    expect(second.elapsed).toBeCloseTo(0.75)
  })

  it('最初のまとまりまでは何も掻かない', () => {
    const waiting = sampleTimeline(oneByOne(), 0.25)

    expect(waiting).toMatchObject({ step: 0, speed: 0, moving: 0, done: false })
    expect(waiting.elapsed).toBeLessThan(0) // どの点に届く時刻（0 以上）にもならない
  })

  it('掻き始めはなめらかに加速し、途中は一定の速さで、終わりは減速して止まる', () => {
    const speedAt = (t: number) => sampleTimeline(oneByOne(), t).speed

    expect(speedAt(0.5)).toBeCloseTo(0) // 掻き始め
    expect(speedAt(0.55)).toBeCloseTo(0.024, 3) // 動き出しはゆっくり（(1 - cos) / 2 なので、加速の 1/10 で巡航の 2.4%）
    expect(speedAt(0.75)).toBeCloseTo(0.5) // 加速の途中
    expect(speedAt(1.0)).toBeCloseTo(1) // 巡航に乗った
    expect(speedAt(2.0)).toBeCloseTo(1)
    expect(speedAt(3.75)).toBeCloseTo(0.5) // 減速の途中
    expect(speedAt(4.0)).toBeCloseTo(0) // 掻き終わり
  })

  it('ストロークの各点にレーキが届く時刻を、まとまりの始まりから数えて持つ', () => {
    const timeline = oneByOne()
    const [stroke] = timeline.steps[0].strokes

    expect(stroke.pointTimes[0]).toBe(0)
    expect(stroke.pointTimes[5]).toBeCloseTo(0.3363, 3) // 加速中に 0.1m。式を別に二分法で解いた値
    expect(stroke.pointTimes[50]).toBeCloseTo(1.25) // 巡航中に 1m。加速の 0.5 秒で 0.25m 進み、残り 0.75m を 1 m/s で
    expect(stroke.pointTimes[150]).toBe(timeline.steps[0].duration) // 最後の点はちょうど掻き終わりに届く
    for (let j = 1; j < stroke.pointTimes.length; j++) expect(stroke.pointTimes[j]).toBeGreaterThan(stroke.pointTimes[j - 1])
  })

  it('加速と減速の距離に足りない短いストロークは、最高速度を下げて加速と減速だけで掻く', () => {
    // 0.2m は 1 m/s × 0.5 秒 = 0.5m に足りないので、最高 0.2 / 0.5 = 0.4 m/s で 0.5 秒加速し 0.5 秒減速する
    const short = buildTimeline([[straight(0.2)]], CELLS_PER_METER, options)

    expect(short.duration).toBeCloseTo(1.5)
    expect(sampleTimeline(short, 1.0).speed).toBeCloseTo(0.4)
    expect(short.steps[0].strokes[0].pointTimes.at(-1)).toBeCloseTo(1.0)
  })

  it('同じまとまりのストロークは揃って始まり、一番長いストロークと同じ時間で揃って掻き終わる', () => {
    // 3m は 3 / 1 + 0.5 = 3.5 秒。1.5m も 3.5 秒で掻くので、最高 1.5 / (3.5 - 0.5) = 0.5 m/s で進む。
    // 長さは配列の先頭ではなく一番長いストロークで決まることを見るため、短い方を先に置く
    const together = buildTimeline([[straight(1.5), straight(3)]], CELLS_PER_METER, options)
    const [short] = together.steps[0].strokes

    expect(together.duration).toBeCloseTo(4.0) // 最初の間 0.5 秒 + 3.5 秒。休みはまとまりの間にだけ入る
    expect(short.pointTimes.at(-1)).toBeCloseTo(3.5)
    expect(short.pointTimes[5]).toBeCloseTo(0.4496, 3) // 最高 0.5 m/s で加速中に 0.1m。式を別に二分法で解いた値
    expect(sampleTimeline(together, 2.0)).toMatchObject({ step: 0, speed: 1, moving: 2 }) // 速さは一番速いレーキ
  })

  it('時間が進むほど、掻いた所は増え、戻らない', () => {
    let previous = { step: 0, elapsed: -Infinity }
    for (let t = 0; t <= 7.6; t += 0.01) {
      const { step, elapsed } = sampleTimeline(oneByOne(), t)
      expect(step > previous.step || (step === previous.step && elapsed >= previous.elapsed)).toBe(true)
      previous = { step, elapsed }
    }
  })

  it('最後のまとまりを掻き終えたら終わる', () => {
    expect(sampleTimeline(oneByOne(), 7.4).done).toBe(false)
    // 掻き終わり（7.5 秒）の直後。距離の足し算の丸めで終わりがわずかにずれるので、ちょうどの時刻は避ける
    const finished = sampleTimeline(oneByOne(), 7.51)
    expect(finished).toMatchObject({ step: 1, speed: 0, moving: 0, done: true })
    expect(finished.elapsed).toBeCloseTo(2.5)
    expect(sampleTimeline(oneByOne(), 100)).toMatchObject({ step: 1, done: true })
  })

  it('まとまりがなければ、すぐに終わる', () => {
    const empty = buildTimeline([], CELLS_PER_METER, options)

    expect(empty.duration).toBe(0)
    expect(sampleTimeline(empty, 0)).toMatchObject({ step: 0, speed: 0, moving: 0, done: true })
  })
})
