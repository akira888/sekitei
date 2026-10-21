import type { Point } from '../sand/path'
import type { Shape } from '../sand/shapes'

// 編集パネルとパレットから図形を変える計算。DOM に依存しない純粋関数だけを置く。
// 帯の本数（rows / rings）は変えないので、歯を変えると束全体の幅が変わる。
// 直線は中心（position）、同心円は内側の余白（innerRadius）を保つ

export const TINES = { min: 2, max: 10 }
export const SPACING = { min: 0.03, max: 0.1, step: 0.005 } // [m]
const DEFAULT_SPACING = 0.05

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

export function changeTines(shape: Shape, delta: number): Shape {
  return { ...shape, rake: { ...shape.rake, tines: clamp(shape.rake.tines + delta, TINES) } }
}

export function changeSpacing(shape: Shape, spacing: number): Shape {
  const snapped = Math.round(spacing / SPACING.step) * SPACING.step
  return { ...shape, rake: { ...shape.rake, spacing: clamp(snapped, SPACING) } }
}

export type ShapeKind = Shape['type']

// パレットから置く図形。歯の本数は直前に変えた本数を引き継ぐ（1つの庭ではあまり変えないため）
export function newShape(kind: ShapeKind, at: Point, tines: number): Shape {
  const rake = { tines, spacing: DEFAULT_SPACING }
  const point = { ...at }
  switch (kind) {
    case 'straight':
      return { type: 'straight', position: point, angle: 0, rows: 1, rake }
    case 'concentric':
      return { type: 'concentric', center: point, innerRadius: 0.1, rings: 3, rake }
  }
}

export function removeShape(shapes: Shape[], index: number): Shape[] {
  return shapes.filter((_, i) => i !== index)
}
