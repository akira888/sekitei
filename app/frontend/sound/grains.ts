// 速度に比例した密度で「粒」を先読み予約するスケジューラ（ポアソン過程っぽく不規則）。
// spike（spikes/sound/src/grains.ts）のまま
export class GrainScheduler {
  private nextTime = 0
  private readonly timerId: number

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly rate: () => number, // 粒/秒
    private readonly play: (time: number) => void,
  ) {
    this.nextTime = ctx.currentTime
    // 25ms ごとに 100ms 先までを予約する
    this.timerId = window.setInterval(() => this.tick(), 25)
  }

  dispose(): void {
    window.clearInterval(this.timerId)
  }

  private tick(): void {
    const lookahead = 0.1
    const now = this.ctx.currentTime
    if (this.nextTime < now) this.nextTime = now
    const rate = this.rate()
    if (rate < 1) {
      this.nextTime = now + 0.05
      return
    }
    while (this.nextTime < now + lookahead) {
      this.play(this.nextTime)
      this.nextTime += -Math.log(1 - Math.random()) / rate
    }
  }
}

// 立ち上がり・減衰がなめらかな窓（ハン窓）のエンベロープ
export function hannEnvelope(gain: GainNode, time: number, duration: number, peak: number): void {
  const n = 16
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = peak * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  gain.gain.setValueAtTime(0, time)
  gain.gain.setValueCurveAtTime(curve, time, duration)
}

export const rand = (min: number, max: number) => min + Math.random() * (max - min)
