import { mulberry32 } from '../random'
import { CURB } from './curb'

// 庭の外周の砂利の縁。砂のすぐ外の縁石と、その外側のもう一本の縁石の間の溝に、暗い灰色の角ばった砂利を敷く。
// 小石の並びは保存せず、固定の seed から毎回同じ並びを作る。座標は庭の座標[m]（左上が原点、y は手前向き）
export const GRAVEL = {
  width: 0.15, // 溝の幅[m]（2本の縁石の間）
  density: 1000, // 1m² あたりの小石の数。下の地面があまり見えない程度
  size: { min: 0.03, max: 0.05 }, // 小石の差し渡し[m]
  seed: 20261023,
} as const

// 砂の縁から一番外側の縁石の外までの幅[m]。真上から見るときは、砂利を敷いていなくてもこの大きさで収める
export const FRAME_WIDTH = CURB.width * 2 + GRAVEL.width

export type Pebble = { x: number; y: number; size: number; rotation: number; shade: number }

// 溝を含む範囲を、小石1つぶんのます目に分け、ます目ごとに1つずつ、ます目の中のばらばらな位置に置く。
// 完全にばらばらに置くより、むらなく敷き詰めた見た目になる。溝の外（縁石や砂の上）に掛かるものは捨てる
export function scatterGravel(garden: { width: number; depth: number }): Pebble[] {
  const random = mulberry32(GRAVEL.seed)
  const cell = 1 / Math.sqrt(GRAVEL.density)
  const inner = CURB.width // 内側の縁石の外側
  const outer = CURB.width + GRAVEL.width // 外側の縁石の内側
  const x0 = -outer, y0 = -outer
  const columns = Math.ceil((garden.width + 2 * outer) / cell)
  const rows = Math.ceil((garden.depth + 2 * outer) / cell)
  const pebbles: Pebble[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // 乱数は捨てる小石の分も同じ順に引く（並びが庭の大きさ以外で変わらないように）
      const x = x0 + (column + random()) * cell
      const y = y0 + (row + random()) * cell
      const size = GRAVEL.size.min + random() * (GRAVEL.size.max - GRAVEL.size.min)
      const rotation = random() * Math.PI * 2
      const shade = 0.85 + random() * 0.3
      const r = size / 2 // 縁石の上にはみ出さないよう、縁石から半径ぶん離す
      const onInnerCurb = x > -inner - r && y > -inner - r && x < garden.width + inner + r && y < garden.depth + inner + r
      const onOuterCurb = x < -outer + r || y < -outer + r || x > garden.width + outer - r || y > garden.depth + outer - r
      if (onInnerCurb || onOuterCurb) continue
      pebbles.push({ x, y, size, rotation, shade })
    }
  }
  return pebbles
}
