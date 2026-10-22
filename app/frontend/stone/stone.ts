import type { Point } from '../sand/path'
import type { StoneParams } from './generator'

// 庭に置いた石。形は params（seed を含む）から毎回作り直すので、形のファイルは持たない。
// position は真上から見た石の中心[m]（庭の座標）、rotation は向き[度]。図形の角度と同じく画面上で時計回りに増える
export type Stone = { type: 'stone'; params: StoneParams; position: Point; rotation: number }

// 庭の座標の石を、3D の位置と y 軸回りの回転に直す。庭は中心を原点に寝かせ、庭の y = 0（奥）を -z に置く（sand_mesh.ts の平面と同じ）。
// three の y 軸回りの回転は真上から見て反時計回りなので、時計回りの rotation は符号を反転する
export function stoneTransform(stone: Stone, garden: { width: number; depth: number }): { x: number; z: number; rotationY: number } {
  return {
    x: stone.position.x - garden.width / 2,
    z: stone.position.y - garden.depth / 2,
    rotationY: (-stone.rotation * Math.PI) / 180,
  }
}
