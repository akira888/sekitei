import { SPACING, TINES, WAVE, clampAmplitude } from '../editor/edit'
import { STONE } from '../editor/stones'
import type { Shape } from '../sand/shapes'
import type { Stone } from '../stone/stone'
import { clampView, type CameraView } from '../view/camera'

// 庭の中身（scene JSON）。サーバーに丸ごと保存し、編集・鑑賞のときに読む。
// 図形は shapes.ts の型のまま（m 単位、配列の順番がレイヤー順）。石は図形とは別の配列に持つ（レイヤー順が効くのは図形どうしだけ）。
// 石・砂利などのキーを足すだけなら version は上げない。古い scene を読めなくなる変更のときだけ上げ、ここで読み替える

const VERSION = 1

// 共有された庭を開いた人の画面が固まらないよう、読むときに極端な値を範囲に収める。
// サーバーは図形ごとの値を見ない（TS の型と二重に持たないため）ので、読む側で守る
const LIMITS = { shapes: 100, stones: 30, bands: { min: 1, max: 60 } }

export type Gravel = { edge: boolean } // 庭の外周に砂利の縁を敷くか
// camera は鑑賞の始まりの視点。完成したときに保存する。持たない庭は既定の視点から見る
export type Scene = { version: typeof VERSION; shapes: Shape[]; stones: Stone[]; gravel: Gravel; camera?: CameraView }

export function toScene(shapes: Shape[], stones: Stone[], gravel: Gravel, camera?: CameraView): Scene {
  return { version: VERSION, shapes, stones, gravel, ...(camera && { camera }) }
}

// サーバーは読めなくなる形だけを弾き、図形ごとの値までは見ないので、図形・石の中身は信じて読む
export function parseScene(data: unknown): Scene {
  if (typeof data !== 'object' || data === null) throw new Error('scene がオブジェクトではありません')
  const { version, shapes, stones = [], gravel, camera } = data as {
    version?: unknown; shapes?: unknown; stones?: unknown; gravel?: Partial<Gravel>; camera?: CameraView
  }
  if (version !== VERSION) throw new Error(`読めない version の scene です: ${String(version)}`)
  if (!Array.isArray(shapes)) throw new Error('scene に図形の配列がありません')
  // 石を足す前の庭には stones がないので、石のない庭として読む
  if (!Array.isArray(stones)) throw new Error('scene の石が配列ではありません')
  return {
    version,
    shapes: (shapes as Shape[]).slice(0, LIMITS.shapes).map(readShape),
    stones: (stones as Stone[]).slice(0, LIMITS.stones).map(readStone),
    // 砂利を足す前に保存した庭は、見た目を変えないよう砂利なしとして読む（新しい庭はサーバーが砂利ありで作る）
    gravel: { edge: gravel?.edge === true },
    ...(camera && { camera: clampView(camera) }),
  }
}

// 範囲の外の値だけを端に寄せる。範囲の中の値は丸めずにそのまま読む
const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min

function readShape(shape: Shape): Shape {
  const rake = { tines: Math.round(clamp(shape.rake.tines, TINES)), spacing: clamp(shape.rake.spacing, SPACING) }
  switch (shape.type) {
    case 'straight':
      return { ...shape, rows: Math.round(clamp(shape.rows, LIMITS.bands)), rake }
    case 'concentric':
      return { ...shape, rings: Math.round(clamp(shape.rings, LIMITS.bands)), rake }
    case 'wave': {
      const wavelength = clamp(shape.wavelength, WAVE.wavelength)
      const amplitude = Number.isFinite(shape.amplitude) ? clampAmplitude(shape.amplitude, wavelength) : WAVE.amplitude.min
      return { ...shape, rows: Math.round(clamp(shape.rows, LIMITS.bands)), rake, wavelength, amplitude }
    }
  }
}

function readStone(stone: Stone): Stone {
  const { size, tallness, roughness, moss = 0, seed } = stone.params // 苔の量を足す前の石は苔なし
  return {
    ...stone,
    params: {
      size: clamp(size, STONE.size),
      tallness: clamp(tallness, STONE.tallness),
      roughness: clamp(roughness, STONE.roughness),
      moss: clamp(moss, STONE.moss),
      seed,
    },
  }
}
