import { SandField, applyEffect, rakeEffect, type CellRect, type RakeEffect } from '../sand/rake'
import type { Stroke } from '../sand/shapes'
import { sampleTimeline, type Timeline } from './timeline'

// プレビューの再生。DOM と Three.js に依存しない。
// 掻いた結果をストロークごとに先に計算しておき（planRake）、時刻が進むたびに、
// レーキが通った所までを砂に書き込む（RakePlayback）。各マスは一度しか書き込まないので、
// 時刻をどう刻んでも、最後まで進めれば一度に掻いた砂と同じになる

// 平らな砂からストロークを順に掻いた結果を、ストロークごとに計算する。
// 新しい高さは掻く前の高さから決まるので、作業用の砂に1本ずつ書き込みながら計算する
export function planRake(strokes: Stroke[], width: number, height: number): RakeEffect[] {
  const work = new SandField(width, height)
  return strokes.map(({ path, style }) => {
    const effect = rakeEffect(work, path, style)
    applyEffect(work, effect)
    return effect
  })
}

export class RakePlayback {
  private stroke = 0 // 書き込み中のストローク
  private point = 0 // そのストロークで書き込み済みの点の数

  constructor(
    private readonly field: SandField,
    private readonly effects: RakeEffect[],
    private readonly timeline: Timeline,
  ) {}

  // 時刻 t までにレーキが通った所を書き込み、書き込んだマスを囲む範囲を返す
  advance(t: number): CellRect | undefined {
    const { stroke, point } = sampleTimeline(this.timeline, t)
    return this.writeUntil(stroke, point)
  }

  // 残りをすべて書き込む（最後まで飛ばす）
  finish(): CellRect | undefined {
    const last = this.effects.length - 1
    return last < 0 ? undefined : this.writeUntil(last, this.effects[last].offsets.length - 1)
  }

  private writeUntil(stroke: number, point: number): CellRect | undefined {
    let rect: CellRect | undefined
    while (this.stroke < stroke) {
      rect = union(rect, applyEffect(this.field, this.effects[this.stroke], this.point))
      this.stroke++
      this.point = 0
    }
    if (this.stroke === stroke && stroke < this.effects.length && point > this.point) {
      rect = union(rect, applyEffect(this.field, this.effects[stroke], this.point, point))
      this.point = point
    }
    return rect
  }
}

function union(a: CellRect | undefined, b: CellRect | undefined): CellRect | undefined {
  if (!a) return b
  if (!b) return a
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}
