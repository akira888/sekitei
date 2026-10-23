import { mulberry32 } from '../random'

// 庭の縁石。砂のすぐ外側を、明るい灰色の長方形の石で囲む（ユーザーが参考にした庭の写真から）。
// 砂利の縁を敷くときは、砂利の溝の外側にももう一本並べる。
// 座標は庭の座標[m]（左上が原点、y は手前向き）
export const CURB = {
  width: 0.08, // 石の幅[m]
  height: 0.015, // 砂から上に出る高さ[m]
  length: 0.6, // 石1つの長さの目安[m]。辺の長さを割り切れる本数に分けるので、少し前後する
  joint: 0.004, // 石と石の継ぎ目[m]
  seed: 20261024,
} as const

// along は石の長い方の向き（x: 横に並ぶ奥・手前の辺、y: 縦に並ぶ左右の辺）。x, y は石の中心
export type CurbBlock = { x: number; y: number; length: number; along: 'x' | 'y'; shade: number }

// 砂の外側から offset[m] 離れた所に、幅 CURB.width の帯を作り、石を並べる。
// 奥・手前の辺は角まで、左右の辺はその間だけを受け持つ
export function curbBlocks(garden: { width: number; depth: number }, offset: number): CurbBlock[] {
  const random = mulberry32(CURB.seed + Math.round(offset * 1000))
  const c = CURB.width
  const outer = offset + c
  const blocks: CurbBlock[] = []
  const strip = (from: number, to: number, at: number, along: 'x' | 'y') => {
    const count = Math.max(1, Math.round((to - from) / CURB.length))
    const step = (to - from) / count
    for (let i = 0; i < count; i++) {
      const center = from + step * (i + 0.5)
      const shade = 0.9 + random() * 0.2
      const block = { length: step - CURB.joint, along, shade }
      blocks.push(along === 'x' ? { x: center, y: at, ...block } : { x: at, y: center, ...block })
    }
  }
  strip(-outer, garden.width + outer, -offset - c / 2, 'x') // 奥
  strip(-outer, garden.width + outer, garden.depth + offset + c / 2, 'x') // 手前
  strip(-offset, garden.depth + offset, -offset - c / 2, 'y') // 左
  strip(-offset, garden.depth + offset, garden.width + offset + c / 2, 'y') // 右
  return blocks
}
