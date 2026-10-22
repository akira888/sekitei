import type { Point } from '../sand/path'

// プレビューでレーキを動かす時間割。DOM に依存しない純粋関数だけを置く。
// 同時に掻くストロークをひとまとまり（step）とし、まとまりを順に掻く。まとまりの間はレーキを持ち上げて休む。
// 同じまとまりのストロークは揃って掻き始め、一番長いストロークを巡航の速さで掻く時間に揃えて掻き終える
// （短いストロークほど遅く進む）。1本の中では、掻き始めになめらかに加速し、途中は一定の速さで、終わりで減速して止まる。
// 速さは音の大きさ・粒の多さに使う（持ち上げている間は 0）

export type TimelineOptions = {
  speed: number // 一番長いストロークの巡航の速さ[m/s]
  ramp: number // 掻き始めの加速・終わりの減速にかける時間[s]
  pause: number // まとまりの間にレーキを持ち上げている時間[s]
  leadIn: number // 最初のまとまりまでの間[s]
}

type StrokeTiming = {
  peak: number // 最高の速さ[m/s]
  pointTimes: Float64Array // まとまりの始まりから、各点にレーキが届くまでの時間[s]
}

type StepTiming = {
  start: number // 掻き始める時刻[s]
  duration: number // [s]
  ramp: number // [s]
  strokes: StrokeTiming[]
}

export type Timeline = { steps: StepTiming[]; duration: number }

// その時刻にどこまで掻いたか。step 番目のまとまりを掻き始めてから elapsed 秒（最初のまとまりの前は負、
// 休みの間は掻き終えた所で止まる）。speed は一番速いレーキの速さ、moving は動いているレーキの本数
export type Progress = { step: number; elapsed: number; speed: number; moving: number; done: boolean }

export function buildTimeline(steps: Point[][][], cellsPerMeter: number, options: TimelineOptions): Timeline {
  const { speed, ramp, pause, leadIn } = options
  const timings: StepTiming[] = []
  let time = leadIn
  for (const paths of steps) {
    if (timings.length > 0) time += pause
    const distances = paths.map((path) => distancesAlong(path, cellsPerMeter))
    const lengths = distances.map((d) => d[d.length - 1] ?? 0)
    const longest = Math.max(0, ...lengths)
    // 加速と減速で進む距離は speed × ramp。それより短ければ、最高速度を下げて加速と減速だけで掻く
    const duration = longest >= speed * ramp ? longest / speed + ramp : 2 * ramp
    const strokes = distances.map((d, i) => {
      // 加速・減速の間は平均すると最高速度の半分で進むので、duration で length を進む最高速度は length / (duration - ramp)
      const motion = { length: lengths[i], peak: lengths[i] / (duration - ramp), duration, ramp }
      return { peak: motion.peak, pointTimes: Float64Array.from(d, (distance) => timeAt(motion, distance)) }
    })
    timings.push({ start: time, duration, ramp, strokes })
    time += duration
  }
  return { steps: timings, duration: timings.length > 0 ? time : 0 }
}

export function sampleTimeline(timeline: Timeline, t: number): Progress {
  const { steps, duration } = timeline
  if (t >= duration) {
    const last = steps.length - 1
    return { step: Math.max(0, last), elapsed: last >= 0 ? steps[last].duration : 0, speed: 0, moving: 0, done: true }
  }
  let current = 0
  while (current + 1 < steps.length && steps[current + 1].start <= t) current++
  const step = steps[current]
  const elapsed = Math.min(t - step.start, step.duration)
  if (elapsed <= 0 || elapsed >= step.duration) return { step: current, elapsed, speed: 0, moving: 0, done: false }

  const eased = easing(Math.min(elapsed, step.duration - elapsed), step.ramp)
  let speed = 0
  let moving = 0
  for (const { peak } of step.strokes) {
    if (peak <= 0) continue
    moving++
    speed = Math.max(speed, peak * eased)
  }
  return { step: current, elapsed, speed, moving, done: false }
}

type Motion = { length: number; peak: number; duration: number; ramp: number }

// 加速・減速は速さが (1 - cos) / 2 で変わる。x は掻き始め（または掻き終わり）からの時間
function easing(x: number, ramp: number): number {
  return x >= ramp ? 1 : (1 - Math.cos((Math.PI * x) / ramp)) / 2
}

// 加速を始めてから x 秒で進む距離。加速しきるまでに peak × ramp / 2 進む
function easedDistance(motion: Motion, x: number): number {
  return motion.peak * (x / 2 - (motion.ramp / (2 * Math.PI)) * Math.sin((Math.PI * x) / motion.ramp))
}

// 始点から distance 進んだ所にレーキが届く時間。最後の点はちょうど duration になる
function timeAt(motion: Motion, distance: number): number {
  const { length, peak, duration, ramp } = motion
  if (peak <= 0) return 0
  const eased = (peak * ramp) / 2
  if (distance <= eased) return easedTime(motion, distance)
  if (distance < length - eased) return ramp + (distance - eased) / peak
  return duration - easedTime(motion, length - distance)
}

// 加速の間に distance 進む時間。距離は時間とともに増える一方なので二分法で解く
function easedTime(motion: Motion, distance: number): number {
  let lo = 0, hi = motion.ramp
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (easedDistance(motion, mid) < distance) lo = mid
    else hi = mid
  }
  return lo
}

// 始点から各点までの距離[m]
function distancesAlong(path: Point[], cellsPerMeter: number): Float64Array {
  const distances = new Float64Array(path.length)
  for (let i = 1; i < path.length; i++) {
    distances[i] = distances[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / cellsPerMeter
  }
  return distances
}
