import { normals, type Point } from './path'
import type { Stroke } from './shapes'

// 掻く前の下絵。ならした砂の上に、歯の軌跡を細い線で重ねる（設計メモ §12）。
// 掻く順番どおりに「その帯が掻く範囲を砂の色で塗って下の線を消す → 歯の線を引く」を繰り返すので、
// 上のレイヤーが下を上書きした仕上がりと、どの線が見えるかが一致する。
// テストできるよう、描く命令の列を作る部分と、それを Canvas に描く部分を分けている

export type SketchOp = {
  kind: 'erase' | 'line'
  path: Point[]
  width: number // 線の太さ[マス]
}

export function sketchOps(strokes: Stroke[], lineWidth = 1.5): SketchOp[] {
  return strokes.flatMap(({ path, style }) => {
    const half = ((style.tines - 1) / 2) * style.spacing // 中心から外側の歯まで
    // 掻く処理（rake.ts）が届く範囲。ならす幅（外側の歯の溝の縁まで）+ 縁の土手
    const reach = half + style.grooveWidth / 2 + style.pileWidth
    const ns = normals(path)
    const tines = Array.from({ length: style.tines }, (_, i): SketchOp => {
      const offset = i * style.spacing - half
      return { kind: 'line', path: path.map((p, j) => ({ x: p.x + ns[j].x * offset, y: p.y + ns[j].y * offset })), width: lineWidth }
    })
    return [{ kind: 'erase', path, width: reach * 2 }, ...tines]
  })
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
    // 掻く処理は帯の端を四角く切るので、消す範囲も端を伸ばさない
    ctx.lineCap = op.kind === 'erase' ? 'butt' : 'round'
    ctx.strokeStyle = op.kind === 'erase' ? colors.sand : colors.line
    ctx.lineWidth = op.width
    ctx.stroke()
  }
}
