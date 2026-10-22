import { normals, type Point } from './path'
import type { RakeStyle } from './rake'
import type { Stroke } from './shapes'

// 掻く前の下絵。ならした砂の上に、歯の軌跡を細い線で重ねる（設計メモ §12）。
// 掻く順番どおりに「その帯が掻く範囲を砂の色で塗って下の線を消す → 歯の線を引く」を繰り返すので、
// 上のレイヤーが下を上書きした仕上がりと、どの線が見えるかが一致する。
// テストできるよう、描く命令の列を作る部分と、それを Canvas に描く部分を分けている

export type SketchOp = {
  kind: 'erase' | 'line' | 'cover' // cover は石の輪郭（閉じた多角形）を塗り、縁を太らせて塗る
  path: Point[]
  width: number // 線の太さ[マス]
}

// 石の輪郭[マス] と、輪郭から掻かずに残す幅[マス]（sand/seating.ts の余白）
export type SketchStones = { outlines: Point[][]; margin: number }

export function sketchOps(strokes: Stroke[], stones: SketchStones = { outlines: [], margin: 0 }, lineWidth = 1.5): SketchOp[] {
  // 石の下と周りは掻かないので、すべての線の後で塗って消す（石は常に砂紋の上にある）
  const covers = stones.outlines.map((path): SketchOp => ({ kind: 'cover', path, width: stones.margin * 2 }))
  return [...strokes.flatMap(({ path, style }): SketchOp[] => {
    const half = ((style.tines - 1) / 2) * style.spacing // 中心から外側の歯まで
    const reach = rakeReach(style)
    const ns = normals(path)
    const tines = Array.from({ length: style.tines }, (_, i): SketchOp => {
      const offset = i * style.spacing - half
      return { kind: 'line', path: path.map((p, j) => ({ x: p.x + ns[j].x * offset, y: p.y + ns[j].y * offset })), width: lineWidth }
    })
    return [{ kind: 'erase', path, width: reach * 2 }, ...tines]
  }), ...covers]
}

// 掻く処理（rake.ts）がパスの中心から届く範囲。ならす幅（外側の歯の溝の縁まで）+ 縁の土手
export function rakeReach(style: RakeStyle): number {
  return ((style.tines - 1) / 2) * style.spacing + style.grooveWidth / 2 + style.pileWidth
}

export type SketchColors = { sand: string; line: string }

// 命令の列を Canvas に描く。Canvas の 1px = ハイトマップの 1マス
export function drawSketch(ctx: CanvasRenderingContext2D, ops: SketchOp[], colors: SketchColors): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = colors.sand
  ctx.fillRect(0, 0, width, height)
  ctx.lineJoin = 'round'
  for (const op of ops) {
    if (op.path.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(op.path[0].x, op.path[0].y)
    for (const p of op.path.slice(1)) ctx.lineTo(p.x, p.y)
    if (op.kind === 'cover') {
      // 輪郭の内側を塗り、縁を余白の幅の2倍の線で塗って、輪郭から余白までを砂の色にする
      ctx.closePath()
      ctx.fillStyle = colors.sand
      ctx.fill()
      ctx.lineJoin = 'round'
      ctx.strokeStyle = colors.sand
      ctx.lineWidth = op.width
      ctx.stroke()
      continue
    }
    // 掻く処理は帯の端を四角く切るので、消す範囲も端を伸ばさない
    ctx.lineCap = op.kind === 'erase' ? 'butt' : 'round'
    ctx.strokeStyle = op.kind === 'erase' ? colors.sand : colors.line
    ctx.lineWidth = op.width
    ctx.stroke()
  }
}
