import type { Point } from './path'
import type { RakeStyle } from './rake'

// 図形パラメータ → レーキ軌跡パスの変換。DOM に依存しない純粋関数だけを置く。
// 図形は m 単位で持ち（scene JSON に保存する値）、ここでハイトマップのマスに換算する。
// 座標は庭の左上が原点で、x は庭の幅の方向、y は奥行きの方向（ハイトマップの行の向き）

export type Rake = {
  tines: number // 歯の数
  spacing: number // 歯の間隔[m]
}

// 庭の端から端まで走る帯を rows 本並べる。rows を十分に大きくすれば庭全体の敷き詰めになる
export type StraightShape = {
  type: 'straight'
  position: Point // 帯の束の中心線上の1点[m]
  angle: number // 線の向き[度]。0 で x 方向、90 で y 方向
  rows: number // 並べる帯の本数。position を中心に両側へ均等に並べる
  rake: Rake
}

export type ConcentricShape = {
  type: 'concentric'
  center: Point // [m]
  innerRadius: number // 一番内側の帯の内縁の半径[m]（石の周りに残す余白）
  rings: number // 輪の数
  rake: Rake
}

// 直線の中心線を 振幅 × sin(2π × 進んだ距離 ÷ 波長) だけ横にずらした波を、庭の端から端まで走らせる。
// 帯は同じ形の波を帯の幅ずつ横に平行移動して並べる（何本並べても形がそろう。斜面では帯の間隔が少し詰まる）
export type WaveShape = {
  type: 'wave'
  position: Point // 帯の束の中心の波が、中心線を横切る1点[m]
  angle: number // 波の進む向き[度]。0 で x 方向、90 で y 方向
  rows: number // 並べる帯の本数。position を中心に両側へ均等に並べる
  amplitude: number // 振幅[m]
  wavelength: number // 波長[m]
  rake: Rake
}

export type Shape = StraightShape | ConcentricShape | WaveShape

export type Garden = { width: number; depth: number } // [m]

// 1本のパスと、それを掻くレーキ（マス単位）。配列の順番が掻く順番
export type Stroke = { path: Point[]; style: RakeStyle }

const STEP = 2 // パスの点の間隔[マス]

export function shapeToStrokes(shape: Shape, garden: Garden, cellsPerMeter: number): Stroke[] {
  const style = rakeStyle(shape.rake, cellsPerMeter)
  const band = style.tines * style.spacing // レーキ1往路で掻ける帯の幅[マス]
  switch (shape.type) {
    case 'straight': {
      const position = { x: shape.position.x * cellsPerMeter, y: shape.position.y * cellsPerMeter }
      const W = garden.width * cellsPerMeter, H = garden.depth * cellsPerMeter
      return straightPaths(position, shape.angle, shape.rows, W, H, band).map((path) => ({ path, style }))
    }
    case 'wave': {
      const position = { x: shape.position.x * cellsPerMeter, y: shape.position.y * cellsPerMeter }
      const W = garden.width * cellsPerMeter, H = garden.depth * cellsPerMeter
      const wave = { amplitude: shape.amplitude * cellsPerMeter, wavelength: shape.wavelength * cellsPerMeter }
      return straightPaths(position, shape.angle, shape.rows, W, H, band, wave).map((path) => ({ path, style }))
    }
    case 'concentric': {
      const center = { x: shape.center.x * cellsPerMeter, y: shape.center.y * cellsPerMeter }
      const inner = shape.innerRadius * cellsPerMeter
      return Array.from({ length: shape.rings }, (_, i) => ({
        path: circlePath(center, inner + band / 2 + i * band, band),
        style,
      }))
    }
  }
}

// 溝・盛り・深さは、spike で決めた基準値（間隔 12 に対し 溝 5 / 盛り 7 / 深さ 1.5）の比率で決める
export function rakeStyle(rake: Rake, cellsPerMeter: number): RakeStyle {
  const spacing = rake.spacing * cellsPerMeter
  return {
    tines: rake.tines,
    spacing,
    grooveWidth: (spacing * 5) / 12,
    pileWidth: (spacing * 7) / 12,
    depth: (spacing * 1.5) / 12,
  }
}

// position を中心に、平行な直線を帯の幅ずつずらして rows 本引く。行きと帰りで向きを交互に変える。
// 中心線が庭の外でも帯の半分が庭に掛かることがあるので、庭を帯の幅の半分広げた範囲まで線を引く
// （範囲外のマスは掻く処理の側で無視される）。範囲に掛からない帯は出さない。
// wave を渡すと、どの線も 振幅 × sin(2π × position から進んだ距離 ÷ 波長) だけ横にずらした波にする（[マス]）
function straightPaths(
  position: Point, angleDeg: number, rows: number, W: number, H: number, band: number,
  wave?: { amplitude: number; wavelength: number },
): Point[][] {
  const a = (angleDeg * Math.PI) / 180
  const dir = { x: Math.cos(a), y: Math.sin(a) }
  const normal = { x: -dir.y, y: dir.x }
  const margin = band / 2 + (wave?.amplitude ?? 0)
  const bounds = { x0: -margin, y0: -margin, x1: W + margin, y1: H + margin }

  const paths: Point[][] = []
  for (let i = 0; i < rows; i++) {
    const offset = (i - (rows - 1) / 2) * band
    const origin = { x: position.x + normal.x * offset, y: position.y + normal.y * offset }
    const span = clipToRect(origin, dir, bounds)
    if (!span) continue
    const line = segment(origin, dir, span[0], span[1])
    const path = wave
      ? line.map((p) => {
        const t = (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y
        const shift = wave.amplitude * Math.sin((2 * Math.PI * t) / wave.wavelength)
        return { x: p.x + normal.x * shift, y: p.y + normal.y * shift }
      })
      : line
    paths.push(paths.length % 2 === 0 ? path : path.reverse())
  }
  return paths
}

type Rect = { x0: number; y0: number; x1: number; y1: number }

// 直線 origin + t * dir が矩形の中にある t の範囲（Liang–Barsky）
function clipToRect(origin: Point, dir: Point, rect: Rect): [number, number] | undefined {
  let t0 = -Infinity, t1 = Infinity
  for (const [p, d, lo, hi] of [[origin.x, dir.x, rect.x0, rect.x1], [origin.y, dir.y, rect.y0, rect.y1]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return undefined
      continue
    }
    const a = (lo - p) / d, b = (hi - p) / d
    t0 = Math.max(t0, Math.min(a, b))
    t1 = Math.min(t1, Math.max(a, b))
  }
  return t1 > t0 ? [t0, t1] : undefined
}

// t0 から t1 まで STEP 間隔で点を打つ。最後の点は t1 ちょうど
function segment(origin: Point, dir: Point, t0: number, t1: number): Point[] {
  const at = (t: number) => ({ x: origin.x + dir.x * t, y: origin.y + dir.y * t })
  const points: Point[] = []
  for (let t = t0; t < t1; t += STEP) points.push(at(t))
  points.push(at(t1))
  return points
}

// 一周を越えて overlap[マス] ぶん余分に掻く。始点と終点の切れ目を、同じ溝を掻き直して消すため
function circlePath(center: Point, radius: number, overlap: number): Point[] {
  const length = 2 * Math.PI * radius + overlap
  const stepAngle = STEP / radius
  const n = Math.ceil(length / STEP)
  return Array.from({ length: n + 1 }, (_, i) => {
    const angle = Math.min(i * stepAngle, length / radius)
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
  })
}
