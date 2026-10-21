import type { Point } from '../sand/path'
import { rakeStyle, type Garden, type Rake, type Shape } from '../sand/shapes'
import { rakeReach } from '../sand/sketch'

// 真上から見た編集画面での、図形の選択とドラッグの計算。DOM に依存しない純粋関数だけを置く。
// 座標はすべて庭の座標[m]（左上が原点、y は下向き、角度は画面上で時計回りに増える）

// つかみ所。move はどの図形にも常に出す目印、それ以外は選んでいる図形にだけ出すハンドル
export type Grip =
  | { kind: 'move'; point: Point }
  | { kind: 'angle'; point: Point } // 直線の向き
  | { kind: 'rows'; side: 1 | -1; point: Point } // 直線の束の両側の縁。side は束の法線の向き
  | { kind: 'rings'; point: Point } // 同心円の一番外側の縁
  | { kind: 'inner'; point: Point } // 同心円の内側の余白の縁

const ANGLE_ARM = 0.4 // 角度ハンドルを position から離す距離[m]
// 直線と同心円で、最小と増減の単位をレーキ1往路ぶん（帯 1本）に揃える
const MIN_ROWS = 1
const MIN_RINGS = 1

const bandOf = (rake: Rake) => rake.tines * rake.spacing // レーキ1往路で掻ける帯の幅[m]
const reachOf = (rake: Rake) => rakeReach(rakeStyle(rake, 1)) // 掻く処理が帯の中心から届く範囲[m]
const add = (a: Point, b: Point, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

// 線の向きと、それに垂直な向き（shapes.ts の直線の変換と同じ取り方。rows の + 側がこちら）
function axes(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  const dir = { x: Math.cos(a), y: Math.sin(a) }
  return { dir, normal: { x: -dir.y, y: dir.x } }
}

export function gripsOf(shape: Shape): Grip[] {
  const band = bandOf(shape.rake)
  switch (shape.type) {
    case 'straight': {
      const { dir, normal } = axes(shape.angle)
      const halfWidth = (shape.rows * band) / 2
      return [
        { kind: 'move', point: shape.position },
        { kind: 'angle', point: add(shape.position, dir, ANGLE_ARM) },
        { kind: 'rows', side: 1, point: add(shape.position, normal, halfWidth) },
        { kind: 'rows', side: -1, point: add(shape.position, normal, -halfWidth) },
      ]
    }
    case 'concentric': {
      // 内側と外側のハンドルが重ならないよう、中心を挟んで左右に置く
      const outer = shape.innerRadius + shape.rings * band
      return [
        { kind: 'move', point: shape.center },
        { kind: 'rings', point: add(shape.center, { x: 1, y: 0 }, outer) },
        { kind: 'inner', point: add(shape.center, { x: -1, y: 0 }, shape.innerRadius) },
      ]
    }
  }
}

// 許容範囲[m] の中で一番近いつかみ所。同じ近さなら配列の後ろを選ぶ
export function pickGrip<G extends Grip>(grips: readonly G[], point: Point, tolerance: number): G | undefined {
  let best: G | undefined
  let bestDist = tolerance
  for (const grip of grips) {
    const d = dist(grip.point, point)
    if (d <= bestDist) {
      best = grip
      bestDist = d
    }
  }
  return best
}

// クリックした地点を掻く図形のうち、一番上（配列の後ろ）のものの番号。
// 当たりの範囲は下絵が下の線を消す範囲と同じにする（見えている図形を選ぶため。設計メモ §13）
export function hitShape(shapes: Shape[], point: Point, garden: Garden): number | undefined {
  if (!insideGarden(point, garden)) return undefined
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (covers(shapes[i], point)) return i
  }
  return undefined
}

export function insideGarden(point: Point, garden: Garden): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= garden.width && point.y <= garden.depth
}

function covers(shape: Shape, point: Point): boolean {
  const band = bandOf(shape.rake)
  const reach = reachOf(shape.rake)
  switch (shape.type) {
    case 'straight': {
      const { normal } = axes(shape.angle)
      const offset = dot(add(point, shape.position, -1), normal)
      return Math.abs(offset) <= ((shape.rows - 1) / 2) * band + reach
    }
    case 'concentric': {
      const r = dist(shape.center, point)
      const first = shape.innerRadius + band / 2 // 一番内側の輪の中心線の半径
      return r >= first - reach && r <= first + (shape.rings - 1) * band + reach
    }
  }
}

// つかみ所 grip を start でつかみ、current まで動かしたときの図形。元の図形は書き換えない。
// つかんだ位置とつかみ所のずれを保つよう、つかみ所が動いた先（target）で計算する
export function dragShape(shape: Shape, grip: Grip, start: Point, current: Point): Shape {
  const delta = add(current, start, -1)
  const target = add(grip.point, delta)
  const band = bandOf(shape.rake)

  if (shape.type === 'straight') {
    switch (grip.kind) {
      case 'move':
        return { ...shape, position: add(shape.position, delta) }
      case 'angle': {
        const angle = (Math.atan2(target.y - shape.position.y, target.x - shape.position.x) * 180) / Math.PI
        return { ...shape, angle }
      }
      case 'rows': {
        // 反対側の縁を固定し、引いた側の縁を帯の幅単位にスナップする。
        // 本数が 1 増えるごとに束の中心は引いた側へ帯の幅の半分ずれる（設計メモ §14）
        const { normal } = axes(shape.angle)
        const fixed = (-grip.side * shape.rows * band) / 2
        const pulled = dot(add(target, shape.position, -1), normal)
        // 反対側の縁を越えて押し込んだときは 0 として扱い、反対側へは広げない
        const width = Math.max(0, grip.side * (pulled - fixed))
        const rows = Math.max(MIN_ROWS, Math.round(width / band))
        const center = fixed + (grip.side * rows * band) / 2
        return { ...shape, rows, position: add(shape.position, normal, center) }
      }
      default:
        return shape
    }
  }

  switch (grip.kind) {
    case 'move':
      return { ...shape, center: add(shape.center, delta) }
    case 'rings': {
      const rings = Math.max(MIN_RINGS, Math.round((dist(shape.center, target) - shape.innerRadius) / band))
      return { ...shape, rings }
    }
    case 'inner':
      return { ...shape, innerRadius: dist(shape.center, target) }
    default:
      return shape
  }
}
