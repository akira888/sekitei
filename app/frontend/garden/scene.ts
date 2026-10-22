import type { Shape } from '../sand/shapes'
import type { Stone } from '../stone/stone'

// 庭の中身（scene JSON）。サーバーに丸ごと保存し、編集・鑑賞のときに読む。
// 図形は shapes.ts の型のまま（m 単位、配列の順番がレイヤー順）。石は図形とは別の配列に持つ（レイヤー順が効くのは図形どうしだけ）。
// 石・砂利などのキーを足すだけなら version は上げない。古い scene を読めなくなる変更のときだけ上げ、ここで読み替える

const VERSION = 1

export type Scene = { version: typeof VERSION; shapes: Shape[]; stones: Stone[] }

export function toScene(shapes: Shape[], stones: Stone[]): Scene {
  return { version: VERSION, shapes, stones }
}

// サーバーは読めなくなる形だけを弾き、図形ごとの値までは見ないので、図形・石の中身は信じて読む
export function parseScene(data: unknown): Scene {
  if (typeof data !== 'object' || data === null) throw new Error('scene がオブジェクトではありません')
  const { version, shapes, stones = [] } = data as { version?: unknown; shapes?: unknown; stones?: unknown }
  if (version !== VERSION) throw new Error(`読めない version の scene です: ${String(version)}`)
  if (!Array.isArray(shapes)) throw new Error('scene に図形の配列がありません')
  // 石を足す前の庭には stones がないので、石のない庭として読む
  if (!Array.isArray(stones)) throw new Error('scene の石が配列ではありません')
  return { version, shapes: shapes as Shape[], stones: stones as Stone[] }
}
