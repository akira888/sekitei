import { describe, expect, it } from 'vitest'
import { SandField, applyEffect, rakeEffect, rakeField, type RakeStyle } from './rake'
import { shapeToStrokes, type Shape } from './shapes'

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

// 掻く処理を分けたり範囲を絞ったりしても結果が変わらないよう、分ける前の rakeField の結果を固定する。
// 期待値は分ける前の実装で計算した値（庭 1m × 0.8m、1m = 200 マス、歯 3本・間隔 12 マス）
describe('rakeField の結果（固定）', () => {
  const garden = { width: 1, depth: 0.8 }
  const rake = { tines: 3, spacing: 0.06 }
  const shapes: Shape[] = [
    { type: 'straight', position: { x: 0.5, y: 0.4 }, angle: 0, rows: 1, rake }, // 横に1本
    { type: 'straight', position: { x: 0.5, y: 0.4 }, angle: 90, rows: 1, rake }, // 縦に1本（横と交差）
    { type: 'concentric', center: { x: 0.5, y: 0.4 }, innerRadius: 0.05, rings: 1, rake }, // 輪1つ（始点は右の (128, 80)）
  ]

  it('交差する直線2本と同心円1つを順に掻いた高さが、分ける前と同じになる', () => {
    const field = new SandField(200, 160)
    for (const shape of shapes) for (const { path, style } of shapeToStrokes(shape, garden, 200)) rakeField(field, path, style)

    let sum = 0, sumAbs = 0, sumSq = 0, changed = 0
    for (const v of field.h) {
      sum += v
      sumAbs += Math.abs(v)
      sumSq += v * v
      if (v !== 0) changed++
    }
    expect(sum).toBeCloseTo(1903.997, 1)
    expect(sumAbs).toBeCloseTo(12131.134, 1)
    expect(sumSq).toBeCloseTo(12512.718, 1)
    expect(changed).toBe(14935)

    // [x, y, 高さ]: 直線の土手、交差点、輪の始点の継ぎ目のまわり
    const samples = [
      [20, 97, 0.98139], [20, 62, 1.08926], [118, 20, 1.08926], [100, 44, 0.84943],
      [128, 74, -1.38195], [128, 86, -1.382], [134, 80, 0.84566], [122, 80, 0.57313],
      [100, 52, -1.5], [106, 52, -1.38209], [137, 80, 0.1903], [63, 80, 0.288],
    ]
    for (const [x, y, height] of samples) expect(field.at(x, y)).toBeCloseTo(height, 4)
  })
})

// プレビューでは、ストロークごとに結果を先に計算しておき、レーキが進んだ分だけ書き込む
describe('rakeEffect / applyEffect', () => {
  it('区切って書き込んでも、一度に書き込んだ結果と同じになる（土手の盛りが二重にならない）', () => {
    const path = horizontal(50)
    const whole = new SandField(100, 100)
    rakeField(whole, path, style)

    const sliced = new SandField(100, 100)
    const effect = rakeEffect(sliced, path, style)
    for (const [from, to] of [[0, 7], [7, 8], [8, 23], [23, path.length]]) applyEffect(sliced, effect, from, to)

    expect(sliced.h).toEqual(whole.h)
  })

  it('途中の点まで書き込むと、レーキがまだ届いていない先のマスは変えない', () => {
    const path = horizontal(50) // x = 10..90。20番目の点は x = 50
    const field = new SandField(100, 100)
    applyEffect(field, rakeEffect(field, path, style), 0, 20)

    expect(field.at(30, 50)).toBeCloseTo(-1.5) // 通り過ぎた所は溝になっている
    expect(field.at(70, 50)).toBe(0) // 先はまだ平ら
  })

  it('同心円は、始点の重なりを少し過ぎた所まで書き込むと、重なりの区間のマスがもう最終の高さになっている', () => {
    // 輪は一周を帯の幅ぶん越えて始点に重ねる。重なりのマスは、一番近い点が始点側と終点側に分かれる
    const garden = { width: 1, depth: 1 }
    const rake = { tines: 3, spacing: 0.06 }
    const [{ path, style: ringStyle }] = shapeToStrokes(
      { type: 'concentric', center: { x: 0.5, y: 0.5 }, innerRadius: 0.1, rings: 1, rake }, garden, 200,
    )
    const band = ringStyle.tines * ringStyle.spacing // 36 マス
    const radius = 0.1 * 200 + band / 2 // 38 マス。始点は中心の右 (138, 100)
    const overlapPoints = band / 2 // 点の間隔は 2 マス

    const whole = new SandField(200, 200)
    rakeField(whole, path, ringStyle)
    const partial = new SandField(200, 200)
    applyEffect(partial, rakeEffect(partial, path, ringStyle), 0, overlapPoints + 6)

    // 重なりの区間の中ほど（始点から 0.2〜0.8 帯ぶん進んだ角度）で、輪の帯と土手にあたるマス
    let checked = 0
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const r = Math.hypot(x - 100, y - 100)
        const along = Math.atan2(y - 100, x - 100) * radius // 始点からの弧の長さ（マス）
        if (Math.abs(r - radius) > band / 2 || along < band * 0.2 || along > band * 0.8) continue
        expect(partial.at(x, y)).toBe(whole.at(x, y))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('書き込んだマスを囲む範囲を返す', () => {
    const path = horizontal(50)
    const field = new SandField(100, 100)
    const effect = rakeEffect(field, path, style)
    applyEffect(field, effect, 0, 10)
    const before = Float32Array.from(field.h)

    const rect = applyEffect(field, effect, 10, 20)

    const changed = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (let k = 0; k < field.h.length; k++) {
      if (field.h[k] === before[k]) continue
      const x = k % 100, y = Math.floor(k / 100)
      Object.assign(changed, { x0: Math.min(changed.x0, x), y0: Math.min(changed.y0, y), x1: Math.max(changed.x1, x), y1: Math.max(changed.y1, y) })
    }
    expect(rect).toEqual(changed)
  })

  it('書き込むマスがなければ範囲を返さない', () => {
    const field = new SandField(100, 100)
    const effect = rakeEffect(field, horizontal(50), style)

    expect(applyEffect(field, effect, 5, 5)).toBeUndefined()
  })
})
