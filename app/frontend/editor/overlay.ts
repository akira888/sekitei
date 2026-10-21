import type { Point } from '../sand/path'
import type { Grip } from './grips'

// 真上から見た画面に重ねる、目印とハンドルの描画。画面の座標[px] で描くので、
// 庭の拡大率によらず同じ大きさでつかめる。目印は下絵のどの線よりも上に出る（設計メモ §13）

export const MARKER_RADIUS = 7 // [px]
export const HANDLE_RADIUS = 5 // [px]

const INK = '#5a5246'
const ACCENT = '#b5562f'

export type OverlayItem = { grip: Grip; selected: boolean; screen: Point }

export function drawOverlay(ctx: CanvasRenderingContext2D, items: OverlayItem[]): void {
  const moves = items.filter(({ grip }) => grip.kind === 'move')
  const handles = items.filter(({ grip }) => grip.kind !== 'move')
  const selectedMove = moves.find(({ selected }) => selected)

  // 選んでいる図形の目印から各ハンドルへ細い線を引き、どの図形のハンドルかを分かるようにする
  if (selectedMove) {
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    for (const { screen } of handles) {
      ctx.beginPath()
      ctx.moveTo(selectedMove.screen.x, selectedMove.screen.y)
      ctx.lineTo(screen.x, screen.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  for (const { screen } of handles) circle(ctx, screen, HANDLE_RADIUS, '#ffffff', ACCENT)
  for (const { screen, selected } of moves) circle(ctx, screen, MARKER_RADIUS, selected ? ACCENT : '#ffffff', INK)
}

function circle(ctx: CanvasRenderingContext2D, at: Point, radius: number, fill: string, stroke: string): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}
