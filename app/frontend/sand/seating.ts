import type { Point } from './path'
import { SandField } from './rake'

// 石を据えた、掻く前の砂。石の下は掻かず（blocked）、輪郭から余白までに歯が入ると持ち上げる（liftArea）ので、
// 砂紋は石の手前で止まる。根元の砂を少し盛って、石が砂に据わって見えるようにする（根締め）。設計メモ §25
export const SEAT = {
  margin: 0.03, // 石の輪郭から掻かずに残す幅[m]
  mound: 1.2, // 根元の盛りの高さ（ハイトマップの高さ。溝の深さは歯の間隔 5cm で約 1.6）
}

// outlines は石ごとの輪郭（庭の座標[m] の多角形。stone/footprint.ts）
export function seatedField(outlines: Point[][], width: number, height: number, cellsPerMeter: number): SandField {
  const field = new SandField(width, height)
  const blocked = new Uint8Array(width * height)
  const liftArea = new Uint8Array(width * height)
  field.blocked = blocked
  field.liftArea = liftArea
  for (const outline of outlines) {
    if (outline.length < 3) continue
    const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y)
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - SEAT.margin) * cellsPerMeter))
    const x1 = Math.min(width - 1, Math.ceil((Math.max(...xs) + SEAT.margin) * cellsPerMeter))
    const y0 = Math.max(0, Math.floor((Math.min(...ys) - SEAT.margin) * cellsPerMeter))
    const y1 = Math.min(height - 1, Math.ceil((Math.max(...ys) + SEAT.margin) * cellsPerMeter))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = { x: x / cellsPerMeter, y: y / cellsPerMeter }
        const under = inside(outline, p)
        const d = under ? 0 : distanceTo(outline, p)
        if (d >= SEAT.margin) continue
        const k = y * width + x
        if (under) blocked[k] = 1
        liftArea[k] = 1
        // 輪郭で一番高く、余白の外側の縁で 0 になる山の裾（cos²）。石が重なる所は高い方
        const mound = SEAT.mound * Math.cos((Math.PI / 2) * (d / SEAT.margin)) ** 2
        field.h[k] = Math.max(field.h[k], mound)
      }
    }
  }
  return field
}

function inside(polygon: Point[], p: Point): boolean {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) result = !result
  }
  return result
}

function distanceTo(polygon: Point[], p: Point): number {
  let best = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)))
  }
  return best
}
