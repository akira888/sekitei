import { SandField, applyEffect, rakeEffect, type CellRect } from '../sand/rake'
import type { Stroke } from '../sand/shapes'
import { buildTimeline, sampleTimeline, type Timeline, type TimelineOptions } from './timeline'

// プレビューの再生。DOM と Three.js に依存しない。
// 同じレイヤーの図形（掻く範囲が重ならない図形）を、帯・輪もすべてまとめて同時に掻く。
// 掻いた結果をまとまりごとに先に計算しておき（planPreview）、時刻が進むたびに、
// どれかのレーキが通った所までを砂に書き込む（RakePlayback）。各マスは一度しか書き込まないので、
// 時刻をどう刻んでも、最後まで進めれば配列の順に1本ずつ掻いた砂と同じになる

// まとまりごとの書き込み。マスを見せる時刻（まとまりの始まりから）の順に並ぶ
export type StepEffect = {
  cells: Int32Array // マスの番号（y * width + x）
  heights: Float32Array // そのマスの、まとまりを掻き終えたときの高さ
  offsets: Int32Array // 時刻の刻み b で見せるマスは cells[offsets[b] .. offsets[b + 1])
}

export type PreviewPlan = {
  steps: number[][] // まとまりごとの図形の番号（配列の順）
  effects: StepEffect[]
  timeline: Timeline
}

const TICKS_PER_SECOND = 240 // マスを見せる時刻の刻み。描画のフレームより細かければよい
const TILE = 32 // 法線を書き直す区画の大きさ[マス]

// shapes は図形ごとのストローク（配列の順がレイヤー順）
export function planPreview(
  shapes: Stroke[][],
  width: number,
  height: number,
  cellsPerMeter: number,
  options: TimelineOptions,
): PreviewPlan {
  // 1. 配列の順に1本ずつ掻いた結果を計算する。掻く範囲は形だけで決まり、高さは下の図形の上に乗るので、
  //    重ならない図形を後で入れ替えても、それぞれの結果はそのまま使える
  const work = new SandField(width, height)
  const effects = shapes.map((strokes) =>
    strokes.map(({ path, style }) => {
      const effect = rakeEffect(work, path, style)
      applyEffect(work, effect)
      return effect
    }),
  )

  // 2. レイヤー: 掻く範囲が重なる手前の図形のうち、一番上のレイヤー + 1（どれとも重ならなければ 0）
  const layerAt = new Int32Array(width * height).fill(-1) // そのマスを掻いた図形の、一番上のレイヤー
  const steps: number[][] = []
  effects.forEach((strokeEffects, shape) => {
    let layer = 0
    for (const { cells } of strokeEffects) for (const k of cells) layer = Math.max(layer, layerAt[k] + 1)
    for (const { cells } of strokeEffects) for (const k of cells) layerAt[k] = layer
    ;(steps[layer] ??= []).push(shape)
  })

  // 3. 時間割。同じまとまりのストロークは揃って掻く
  const timeline = buildTimeline(
    steps.map((step) => step.flatMap((shape) => shapes[shape].map(({ path }) => path))),
    cellsPerMeter,
    options,
  )

  // 4. まとまりごとに書き込みを合成する。高さは配列の後ろのストロークのもの（同じまとまりで重なるのは
  //    同じ図形の隣り合う帯だけ）、見せる時刻はどれかのレーキが最初に届いた時刻
  const time = new Float32Array(width * height).fill(Infinity)
  const next = new Float32Array(width * height)
  const touched = new Int32Array(width * height)
  const stepEffects = steps.map((step, s) => {
    let count = 0
    const strokes = timeline.steps[s].strokes
    let i = 0
    for (const shape of step) {
      for (const { cells, heights, offsets } of effects[shape]) {
        const { pointTimes } = strokes[i++]
        for (let j = 0; j + 1 < offsets.length; j++) {
          for (let n = offsets[j]; n < offsets[j + 1]; n++) {
            const k = cells[n]
            if (time[k] === Infinity) touched[count++] = k
            time[k] = Math.min(time[k], pointTimes[j])
            next[k] = heights[n]
          }
        }
      }
    }
    return sortByTime(touched, count, time, next)
  })
  return { steps, effects: stepEffects, timeline }
}

// 見せる時刻の刻みごとに振り分ける（比較で並べ替えると、庭全体を掻くまとまりでは遅いため）。
// 使い終わったマスの時刻は次のまとまりのために戻す
function sortByTime(touched: Int32Array, count: number, time: Float32Array, next: Float32Array): StepEffect {
  const tickOf = (k: number) => Math.floor(time[k] * TICKS_PER_SECOND)
  let lastTick = 0
  for (let i = 0; i < count; i++) lastTick = Math.max(lastTick, tickOf(touched[i]))
  const offsets = new Int32Array(lastTick + 2)
  for (let i = 0; i < count; i++) offsets[tickOf(touched[i]) + 1]++
  for (let b = 0; b <= lastTick; b++) offsets[b + 1] += offsets[b]
  const cells = new Int32Array(count)
  const heights = new Float32Array(count)
  const cursor = offsets.slice(0, lastTick + 1)
  for (let i = 0; i < count; i++) {
    const k = touched[i]
    const at = cursor[tickOf(k)]++
    cells[at] = k
    heights[at] = next[k]
  }
  for (let i = 0; i < count; i++) time[touched[i]] = Infinity
  return { cells, heights, offsets }
}

export class RakePlayback {
  private step = 0 // 書き込み中のまとまり
  private written = 0 // そのまとまりで書き込み済みのマスの数
  private readonly dirty: DirtyTiles

  constructor(
    private readonly field: SandField,
    private readonly plan: PreviewPlan,
  ) {
    this.dirty = new DirtyTiles(field.width, field.height)
  }

  // 時刻 t までにレーキが通った所を書き込み、書き込んだマスを含む区画ごとの範囲を返す
  advance(t: number): CellRect[] {
    const { step, elapsed } = sampleTimeline(this.plan.timeline, t)
    const effect = this.plan.effects[step]
    if (!effect) return []
    this.writeUntil(step, this.revealed(effect, elapsed, this.plan.timeline.steps[step].duration))
    return this.dirty.take()
  }

  // 残りをすべて書き込む（最後まで飛ばす）。呼んだ側で全面を描き直す
  finish(): void {
    const last = this.plan.effects.length - 1
    if (last >= 0) this.writeUntil(last, this.plan.effects[last].cells.length)
    this.dirty.take()
  }

  // まとまりを掻き始めて elapsed 秒までに見せるマスの数。掻き終えた時刻からは残りをすべて見せる。
  // 見せる時刻は Float32 で持つので、丸めで最後の刻みがわずかに先へずれ、届かずに残ることがあるため
  private revealed(effect: StepEffect, elapsed: number, duration: number): number {
    if (elapsed < 0) return 0
    if (elapsed >= duration) return effect.cells.length
    const tick = Math.floor(elapsed * TICKS_PER_SECOND)
    return effect.offsets[Math.min(tick + 1, effect.offsets.length - 1)]
  }

  private writeUntil(step: number, until: number): void {
    while (this.step < step) {
      this.write(this.plan.effects[this.step], this.plan.effects[this.step].cells.length)
      this.step++
      this.written = 0
    }
    if (this.step === step) this.write(this.plan.effects[step], until)
  }

  private write({ cells, heights }: StepEffect, until: number): void {
    for (let n = this.written; n < until; n++) {
      this.field.h[cells[n]] = heights[n]
      this.dirty.mark(cells[n])
    }
    this.written = Math.max(this.written, until)
  }
}

// 書き込んだマスを含む区画（TILE × TILE マス）を覚えておく。離れた所を同時に掻いても、
// 間の区画まで書き直さないようにするため
class DirtyTiles {
  private readonly columns: number
  private readonly marked: Uint8Array
  private readonly tiles: number[] = []

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.columns = Math.ceil(width / TILE)
    this.marked = new Uint8Array(this.columns * Math.ceil(height / TILE))
  }

  mark(k: number): void {
    const x = k % this.width, y = (k - x) / this.width
    const tile = Math.floor(y / TILE) * this.columns + Math.floor(x / TILE)
    if (this.marked[tile]) return
    this.marked[tile] = 1
    this.tiles.push(tile)
  }

  // 覚えた区画を範囲にして返し、忘れる
  take(): CellRect[] {
    const rects = this.tiles.map((tile) => {
      const tx = tile % this.columns, ty = (tile - tx) / this.columns
      return {
        x0: tx * TILE,
        y0: ty * TILE,
        x1: Math.min(this.width - 1, tx * TILE + TILE - 1),
        y1: Math.min(this.height - 1, ty * TILE + TILE - 1),
      }
    })
    for (const tile of this.tiles) this.marked[tile] = 0
    this.tiles.length = 0
    return rects
  }
}
