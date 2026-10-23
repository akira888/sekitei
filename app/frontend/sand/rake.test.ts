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

  it('掻かない印（blocked）の付いたマスは、レーキが通っても高さを変えない（石の下と周り）', () => {
    const field = new SandField(100, 100)
    field.blocked = new Uint8Array(100 * 100)
    field.blocked[50 * 100 + 50] = 1
    field.set(50, 50, 0.7)
    rakeField(field, horizontal(50), style)

    expect(field.at(50, 50)).toBeCloseTo(0.7)
    expect(field.at(52, 50)).toBeCloseTo(-1.5) // 印のないマスは掻く
  })

  it('歯の位置が持ち上げる印（liftArea）に入る所では、その歯だけ溝を掘らずに止め、ほかの歯は掻く', () => {
    // 歯は y = 38, 50, 62 を通る。y = 62 の歯が x = 40〜60 で石の周りに入る
    const field = new SandField(100, 100)
    field.liftArea = new Uint8Array(100 * 100)
    for (let y = 59; y <= 65; y++) for (let x = 40; x <= 60; x++) field.liftArea[y * 100 + x] = 1
    rakeField(field, horizontal(50), style)

    expect(field.at(50, 62)).toBe(0) // 持ち上げた歯の溝はない
    expect(field.at(20, 62)).toBeCloseTo(-1.5) // 石の手前では掘っている
    expect(field.at(50, 50)).toBeCloseTo(-1.5) // 隣の歯はそのまま掘る
  })

  // 盛る量を、パスの点ごとに「近いマスで掘った量」を数えて決めると、斜めの線や曲線では点ごとに数えるマスの数がばらつき、
  // 山の高さが畝に沿って上下した（同心円の畝のうねり、斜めの直線の粗さ）
  it('斜めの直線でも、山の頂の高さは畝に沿って一定', () => {
    const tilted: RakeStyle = { tines: 3, spacing: 12.8, depth: 1.6, grooveWidth: 5.33, pileWidth: 7.47 }
    for (const deg of [0, 30, 45]) {
      const a = (deg * Math.PI) / 180
      const field = new SandField(400, 400)
      rakeField(field, Array.from({ length: 151 }, (_, i) => ({ x: 50 + Math.cos(a) * i * 2, y: 100 + Math.sin(a) * i * 2 })), tilted)
      // 真ん中の歯と隣の歯の間の山の頂（中心線から歯の間隔の半分）に沿って、高さを補間して拾う
      const heights: number[] = []
      for (let t = 60; t <= 240; t += 0.5) {
        const x = 50 + Math.cos(a) * t - Math.sin(a) * 6.4, y = 100 + Math.sin(a) * t + Math.cos(a) * 6.4
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
        heights.push(field.at(x0, y0) * (1 - fx) * (1 - fy) + field.at(x0 + 1, y0) * fx * (1 - fy)
          + field.at(x0, y0 + 1) * (1 - fx) * fy + field.at(x0 + 1, y0 + 1) * fx * fy)
      }
      const mean = heights.reduce((sum, h) => sum + h, 0) / heights.length
      const sd = Math.sqrt(heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length)

      expect(sd / mean).toBeLessThan(0.01)
    }
  })

  it('同心円でも、山の頂の高さは輪に沿って一定（畝がうねらない）', () => {
    const ring: RakeStyle = { tines: 3, spacing: 12.8, depth: 1.6, grooveWidth: 5.33, pileWidth: 7.47 }
    const field = new SandField(300, 300)
    const radius = 80
    // 中心 (150, 150) の円を 2 マス間隔の点でたどる（shapes.ts の同心円と同じ打ち方）
    const count = Math.ceil((2 * Math.PI * radius) / 2)
    rakeField(field, Array.from({ length: count + 1 }, (_, i) => {
      const angle = Math.min((i * 2) / radius, 2 * Math.PI)
      return { x: 150 + Math.cos(angle) * radius, y: 150 + Math.sin(angle) * radius }
    }), ring)
    // 真ん中の歯と外側の歯の間の山の頂（半径 + 歯の間隔の半分）を一周たどる。始点の継ぎ目のまわりは除く
    const heights: number[] = []
    for (let deg = 10; deg <= 350; deg += 0.5) {
      const a = (deg * Math.PI) / 180
      const x = 150 + Math.cos(a) * (radius + 6.4), y = 150 + Math.sin(a) * (radius + 6.4)
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
      heights.push(field.at(x0, y0) * (1 - fx) * (1 - fy) + field.at(x0 + 1, y0) * fx * (1 - fy)
        + field.at(x0, y0 + 1) * (1 - fx) * fy + field.at(x0 + 1, y0 + 1) * fx * fy)
    }
    const mean = heights.reduce((sum, h) => sum + h, 0) / heights.length
    const sd = Math.sqrt(heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length)

    expect(sd / mean).toBeLessThan(0.01)
  })

  // 縁の土手（帯の外に盛る土手）は古い砂紋の上に乗る。帯の側の半分（縁から頂まで）は古い砂紋を消して帯の中の山と同じ形にし、
  // 干渉は頂から外の裾だけにする。古い砂紋が透けて外側の畝がでこぼこに見えたり、隣の帯の土手と足し合わさって
  // 盛り上がったりしたため（設計メモ §30）
  describe('縁の土手と古い砂紋', () => {
    // 歯 3本・間隔 12 → 外側の歯は中心から 12、溝の縁（ならす範囲）は 14.5、土手の頂は 18、土手の裾は 21.5
    it('先に掻いた砂紋の上でも、土手の帯の側の半分は平らな砂に掻いたときと同じ高さ', () => {
      const crossed = new SandField(100, 100)
      rakeField(crossed, vertical(50), style)
      rakeField(crossed, horizontal(50), style)
      const plain = new SandField(100, 100)
      rakeField(plain, horizontal(50), style)

      for (let x = 30; x <= 70; x++) {
        for (const y of [65, 66, 67, 68, 32, 33, 34, 35]) expect(crossed.at(x, y)).toBeCloseTo(plain.at(x, y), 5)
      }
    })

    it('隣り合う2本の帯の間の山は、帯の中の山と同じ高さ・形', () => {
      const field = new SandField(100, 140)
      rakeField(field, horizontal(50), style)
      rakeField(field, horizontal(86), style) // 帯の幅 36 だけずらした隣の帯

      for (let d = -3; d <= 3; d++) {
        const between = field.at(50, 68 + d) // 2本の帯の間の山（頂は 68）
        const inside = field.at(50, 56 + d) // 1本目の帯の中の山（頂は 56）
        expect(between).toBeCloseTo(inside, 2)
      }
    })
  })

  it('後から掻いた砂紋が交差点の古い溝を消す', () => {
    const field = new SandField(100, 100)
    rakeField(field, vertical(50), style)
    rakeField(field, horizontal(50), style)

    // 古い縦の溝（x=38）は、新しい横の歯の間（y=44）では山に埋まっている
    expect(field.at(38, 44)).toBeGreaterThan(0)
  })
})

// 掻く処理を分けたり範囲を絞ったりしても結果が変わらないよう、rakeField の結果を固定する（庭 1m × 0.8m、1m = 200 マス、歯 3本・間隔 12 マス）。
// 期待値は、盛る量を溝の断面積から決めるようにしたとき（設計メモ §30）に置き直した。それまでの点ごとに数える盛り方より、
// 直線の土手は約 1.6% 低く（1.089 → 1.071）、輪の始点の継ぎ目のまわりの山（0.85・0.57）は他の山と同じ 1.071 にそろった。
// 続けて縁の土手の重ね方を変えたとき（帯の側の半分は古い砂紋を消す）に合計を置き直した。下の12点の高さは変わらなかった
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
    expect(sum).toBeCloseTo(1637.307, 1)
    expect(sumAbs).toBeCloseTo(11716.998, 1)
    expect(sumSq).toBeCloseTo(11473.914, 1)
    expect(changed).toBe(14935)

    // [x, y, 高さ]: 直線の土手、交差点、輪の始点の継ぎ目のまわり
    const samples = [
      [20, 97, 0.96532], [20, 62, 1.07143], [118, 20, 1.07143], [100, 44, 0.66805],
      [128, 74, -1.38195], [128, 86, -1.382], [134, 80, 1.07143], [122, 80, 1.07143],
      [100, 52, -1.5], [106, 52, -1.38209], [137, 80, 0.24111], [63, 80, 0.23843],
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
