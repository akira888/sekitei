import type { Point } from '../sand/path'
import type { Shape, WaveShape } from '../sand/shapes'

// 編集パネルとパレットから図形を変える計算。DOM に依存しない純粋関数だけを置く。
// 帯の本数（rows / rings）は変えないので、歯を変えると束全体の幅が変わる。
// 直線は中心（position）、同心円は内側の余白（innerRadius）を保つ

export const TINES = { min: 2, max: 10 }
export const SPACING = { min: 0.03, max: 0.1, step: 0.005 } // [m]
const DEFAULT_TINES = 5
const DEFAULT_SPACING = 0.05

// 波の振幅・波長[m]。振幅の上限は波長の 10%。斜面で隣の帯と重なり、下絵に前の帯の線の切れ端が残るので、
// 15% から下げた（ユーザー判断）
export const WAVE = {
  wavelength: { min: 0.3, max: 2.0 },
  amplitude: { min: 0.01, maxRatio: 0.1 },
  step: 0.01,
  default: { amplitude: 0.06, wavelength: 0.8 },
} as const
export type WaveParam = 'amplitude' | 'wavelength'

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

export function changeTines(shape: Shape, delta: number): Shape {
  return { ...shape, rake: { ...shape.rake, tines: clamp(shape.rake.tines + delta, TINES) } }
}

export function changeSpacing(shape: Shape, spacing: number): Shape {
  const snapped = Math.round(spacing / SPACING.step) * SPACING.step
  return { ...shape, rake: { ...shape.rake, spacing: clamp(snapped, SPACING) } }
}

// 開き直した庭でパレットから置く図形の歯の本数。直前に変えた本数は保存しないので、
// 一番上（最後に置いた）図形の本数で代える。1つの庭ではあまり変えないので、たいていは同じ本数になる
export function inheritedTines(shapes: Shape[]): number {
  return shapes.at(-1)?.rake.tines ?? DEFAULT_TINES
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
    case 'wave':
      return { type: 'wave', position: point, angle: 0, rows: 1, rake, ...WAVE.default }
  }
}

// 振幅・波長を 1cm 刻みに丸めて範囲に収める。波長を縮めたら、振幅も新しい上限まで下げる
export function changeWave(shape: WaveShape, param: WaveParam, value: number): WaveShape {
  const snap = (v: number) => Number((Math.round(v / WAVE.step) * WAVE.step).toFixed(4))
  const wavelength = param === 'wavelength' ? clamp(snap(value), WAVE.wavelength) : shape.wavelength
  const amplitude = param === 'amplitude' ? snap(value) : shape.amplitude
  return { ...shape, wavelength, amplitude: clampAmplitude(amplitude, wavelength) }
}

export function clampAmplitude(amplitude: number, wavelength: number): number {
  return clamp(amplitude, { min: WAVE.amplitude.min, max: wavelength * WAVE.amplitude.maxRatio })
}

export function removeShape(shapes: Shape[], index: number): Shape[] {
  return shapes.filter((_, i) => i !== index)
}
