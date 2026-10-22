import { describe, expect, it } from 'vitest'
import { buildTimeline, sampleTimeline } from './timeline'
import type { Point } from '../sand/path'

// 1m = 100 マス。点は 2 マス（0.02m）間隔で x 方向へ並べる
const CELLS_PER_METER = 100
const straight = (meters: number): Point[] =>
  Array.from({ length: Math.round(meters * 50) + 1 }, (_, i) => ({ x: i * 2, y: 0 }))

// 巡航 1 m/s、加速・減速 0.5 秒、休み 1 秒、最初の間 0.5 秒
const options = { speed: 1, ramp: 0.5, pause: 1, leadIn: 0.5 }

// 3m のストローク（151 点）は 3 / 1 + 0.5 = 3.5 秒、2m（101 点）は 2.5 秒。
// 0.5 秒待って 0.5〜4.0 秒に1本目、1 秒休んで 5.0〜7.5 秒に2本目を掻く
const timeline = () => buildTimeline([straight(3), straight(2)], CELLS_PER_METER, options)

describe('buildTimeline / sampleTimeline', () => {
  it('ストロークを順に掻き、間にレーキを持ち上げる休みを入れる', () => {
    expect(timeline().duration).toBeCloseTo(7.5)
    expect(sampleTimeline(timeline(), 4.5)).toEqual({ stroke: 0, point: 151, speed: 0, done: false })
    expect(sampleTimeline(timeline(), 5.75)).toMatchObject({ stroke: 1, done: false })
  })

  it('最初のストロークまでは何も掻かない', () => {
    expect(sampleTimeline(timeline(), 0.25)).toEqual({ stroke: 0, point: 0, speed: 0, done: false })
  })

  it('掻き始めはなめらかに加速し、途中は一定の速さで、終わりは減速して止まる', () => {
    const speedAt = (t: number) => sampleTimeline(timeline(), t).speed

    expect(speedAt(0.5)).toBeCloseTo(0) // 掻き始め
    expect(speedAt(0.55)).toBeCloseTo(0.024, 3) // 動き出しはゆっくり（(1 - cos) / 2 なので、加速の 1/10 で巡航の 2.4%）
    expect(speedAt(0.75)).toBeCloseTo(0.5) // 加速の途中
    expect(speedAt(1.0)).toBeCloseTo(1) // 巡航に乗った
    expect(speedAt(2.0)).toBeCloseTo(1)
    expect(speedAt(3.75)).toBeCloseTo(0.5) // 減速の途中
    expect(speedAt(4.0)).toBeCloseTo(0) // 掻き終わり
  })

  it('進んだ距離までの点を見せ、ストロークの終わりにちょうど最後の点まで届く', () => {
    // 2.0 秒は1本目の 1.5 秒目。加速で 0.25m、巡航 1 秒で 1m 進み、1.25m まで。0〜62 番目（1.24m）の 63 点
    expect(sampleTimeline(timeline(), 2.0).point).toBe(63)
    expect(sampleTimeline(timeline(), 4.0).point).toBe(151)
  })

  it('時間が進むほど掻いた所は増え、戻らない', () => {
    let previous = { stroke: 0, point: 0 }
    for (let t = 0; t <= 7.6; t += 0.01) {
      const { stroke, point } = sampleTimeline(timeline(), t)
      expect(stroke > previous.stroke || (stroke === previous.stroke && point >= previous.point)).toBe(true)
      previous = { stroke, point }
    }
  })

  it('加速と減速の距離に足りない短いストロークは、最高速度を下げて加速と減速だけで掻く', () => {
    // 0.2m は 1 m/s × 0.5 秒 = 0.5m に足りないので、最高 0.2 / 0.5 = 0.4 m/s で 0.5 秒加速し 0.5 秒減速する
    const short = buildTimeline([straight(0.2)], CELLS_PER_METER, options)

    expect(short.duration).toBeCloseTo(1.5)
    expect(sampleTimeline(short, 1.0).speed).toBeCloseTo(0.4)
    expect(sampleTimeline(short, 1.5).point).toBe(11)
  })

  it('最後のストロークを掻き終えたら終わる', () => {
    expect(sampleTimeline(timeline(), 7.4).done).toBe(false)
    // 掻き終わり（7.5 秒）の直後。距離の足し算の丸めで終わりがわずかにずれるので、ちょうどの時刻は避ける
    expect(sampleTimeline(timeline(), 7.51)).toEqual({ stroke: 1, point: 101, speed: 0, done: true })
    expect(sampleTimeline(timeline(), 100)).toEqual({ stroke: 1, point: 101, speed: 0, done: true })
  })

  it('ストロークがなければ、すぐに終わる', () => {
    const empty = buildTimeline([], CELLS_PER_METER, options)

    expect(empty.duration).toBe(0)
    expect(sampleTimeline(empty, 0)).toEqual({ stroke: 0, point: 0, speed: 0, done: true })
  })
})
