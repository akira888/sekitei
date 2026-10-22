import type { Shape } from '../sand/shapes'

// 庭の中身（scene JSON）。サーバーに丸ごと保存し、編集・鑑賞のときに読む。
// 図形は shapes.ts の型のまま（m 単位、配列の順番がレイヤー順）。
// 石・砂利などのキーを足すだけなら version は上げない。古い scene を読めなくなる変更のときだけ上げ、ここで読み替える

const VERSION = 1

export type Scene = { version: typeof VERSION; shapes: Shape[] }

export function toScene(shapes: Shape[]): Scene {
  return { version: VERSION, shapes }
}

// サーバーは読めなくなる形だけを弾き、図形ごとの値までは見ないので、図形の中身は信じて読む
export function parseScene(data: unknown): Scene {
  if (typeof data !== 'object' || data === null) throw new Error('scene がオブジェクトではありません')
  const { version, shapes } = data as { version?: unknown; shapes?: unknown }
  if (version !== VERSION) throw new Error(`読めない version の scene です: ${String(version)}`)
  if (!Array.isArray(shapes)) throw new Error('scene に図形の配列がありません')
  return { version, shapes: shapes as Shape[] }
}
