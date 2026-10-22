import type { Point } from '../sand/path'
import { stoneShape } from './generator'
import { stoneTransform, type Stone } from './stone'

const BINS = 72 // 輪郭を何方向に分けて拾うか（5° ごと）

// 石を砂の高さ（y = 0）で切った断面の輪郭。庭の座標[m] の多角形で、石の中心の周りを一方向に回る順に並ぶ。
// 石の周りを掻かずに残す範囲と、下絵で線を消す範囲に使う。
// 面の辺のうち砂の高さをまたぐものの交点を集め、向きごとに一番外側の点を残す（断面は石の中心から見てほぼ放射状）
export function stoneFootprint(stone: Stone): Point[] {
  const { positions, indices } = stoneShape(stone.params)
  const outer: ({ x: number; z: number; r: number } | undefined)[] = new Array(BINS)
  const take = (a: number, b: number) => {
    const ya = positions[a * 3 + 1], yb = positions[b * 3 + 1]
    if ((ya > 0) === (yb > 0)) return
    const t = ya / (ya - yb)
    const x = positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t
    const z = positions[a * 3 + 2] + (positions[b * 3 + 2] - positions[a * 3 + 2]) * t
    const r = Math.hypot(x, z)
    const bin = Math.min(BINS - 1, Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * BINS))
    if (!outer[bin] || r > outer[bin]!.r) outer[bin] = { x, z, r }
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]]
    take(a, b)
    take(b, c)
    take(c, a)
  }

  // 石の向きと位置に合わせる。3D の y 軸回りの回転と同じ向きに回し、3D の z を庭の y に重ねる
  const { rotationY } = stoneTransform(stone, { width: 0, depth: 0 })
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY)
  return outer
    .filter((p) => p !== undefined)
    .map(({ x, z }) => ({
      x: stone.position.x + x * cos + z * sin,
      y: stone.position.y - x * sin + z * cos,
    }))
}
