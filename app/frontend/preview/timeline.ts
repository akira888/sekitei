import type { Point } from '../sand/path'

// プレビューでレーキを動かす時間割。DOM に依存しない純粋関数だけを置く。
// ストロークを配列の順（下のレイヤーから）に掻き、間はレーキを持ち上げて休む。
// 1本の中では、掻き始めになめらかに加速し、途中は一定の速さで進み、終わりで減速して止まる。
// 速さは音の大きさ・粒の多さに使う（持ち上げている間は 0）

export type TimelineOptions = {
  speed: number // 巡航の速さ[m/s]
  ramp: number // 掻き始めの加速・終わりの減速にかける時間[s]
  pause: number // ストロークの間にレーキを持ち上げている時間[s]
  leadIn: number // 最初のストロークまでの間[s]
}

type StrokeTiming = {
  start: number // 掻き始める時刻[s]
  duration: number // [s]
  length: number // [m]
  peak: number // 最高の速さ[m/s]。短いストロークでは巡航の速さより下げる
  ramp: number // [s]
  distances: Float64Array // 始点から各点までの距離[m]
}

export type Timeline = { strokes: StrokeTiming[]; duration: number }

// その時刻にどこまで掻いたか。stroke 本目の point 個目の点まで（point 番目は含まない）レーキが届いている
export type Progress = { stroke: number; point: number; speed: number; done: boolean }

export function buildTimeline(paths: Point[][], cellsPerMeter: number, options: TimelineOptions): Timeline {
  const { speed, ramp, pause, leadIn } = options
  const strokes: StrokeTiming[] = []
  let time = leadIn
  for (const path of paths) {
    if (strokes.length > 0) time += pause
    const distances = new Float64Array(path.length)
    for (let i = 1; i < path.length; i++) {
      distances[i] = distances[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / cellsPerMeter
    }
    const length = distances[path.length - 1] ?? 0
    // 加速と減速で進む距離は speed × ramp。それより短いストロークは最高速度を下げて、加速と減速だけで掻く
    const cruises = length >= speed * ramp
    const peak = cruises ? speed : length / ramp
    const duration = cruises ? length / speed + ramp : 2 * ramp
    strokes.push({ start: time, duration, length, peak, ramp, distances })
    time += duration
  }
  return { strokes, duration: strokes.length > 0 ? time : 0 }
}

export function sampleTimeline(timeline: Timeline, t: number): Progress {
  const { strokes, duration } = timeline
  if (t >= duration) {
    const last = strokes.length - 1
    return { stroke: Math.max(0, last), point: last >= 0 ? strokes[last].distances.length : 0, speed: 0, done: true }
  }
  let current = -1
  while (current + 1 < strokes.length && strokes[current + 1].start <= t) current++
  if (current < 0) return { stroke: 0, point: 0, speed: 0, done: false } // 最初のストロークの前

  const stroke = strokes[current]
  const elapsed = t - stroke.start
  if (elapsed >= stroke.duration) return { stroke: current, point: stroke.distances.length, speed: 0, done: false } // 休み
  const { distance, speed } = motion(stroke, elapsed)
  return { stroke: current, point: countUpTo(stroke.distances, distance), speed, done: false }
}

// 加速・減速は速さが (1 - cos) / 2 で変わる。加速しきるまでに peak × ramp / 2 進む
function motion(stroke: StrokeTiming, elapsed: number): { distance: number; speed: number } {
  const { duration, ramp, peak, length } = stroke
  const easedDistance = (x: number) => peak * (x / 2 - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * x) / ramp))
  const easedSpeed = (x: number) => (peak * (1 - Math.cos((Math.PI * x) / ramp))) / 2
  if (elapsed < ramp) return { distance: easedDistance(elapsed), speed: easedSpeed(elapsed) }
  const remaining = duration - elapsed
  if (remaining < ramp) return { distance: length - easedDistance(remaining), speed: easedSpeed(remaining) }
  return { distance: (peak * ramp) / 2 + peak * (elapsed - ramp), speed: peak }
}

// distance 以下の距離にある点の数（distances は増える順）
function countUpTo(distances: Float64Array, distance: number): number {
  let lo = 0, hi = distances.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (distances[mid] <= distance) lo = mid + 1
    else hi = mid
  }
  return lo
}
