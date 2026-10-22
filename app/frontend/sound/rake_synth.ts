import { GrainScheduler, hannEnvelope, rand } from './grains'
import { rakeLevels } from './levels'
import { createPinkNoiseBuffer, createRoughnessBuffer, ROUGHNESS_BASE_RATE } from './noise'
import { SETTINGS } from './settings'

// レーキが砂を掻く音のシンセ。設定は spike（spikes/sound）で聴き比べて決めた値（settings.ts、設計メモ §8）。
// ピンクノイズ → バンドパス → ローパス → 音量（速度連動）→ ザラつき（振幅変調） ＋ 粒（長め・中低域）。
// 速度は音色ではなく量（音量・粒の密度）で表す。速度で音色を動かすと風切り音に聞こえるため。
// 時刻はすべて AudioContext.currentTime 基準で渡す（画面のアニメーションと同じ時計にするため）
const RELEASE = 0.3 // 止めるときに音を消し切るまでの時間[s]

// ストロークを1回プレビューする間だけ使う。バッファの再生は一度しか始められないので、毎回作り直す
export class RakeSynth {
  private readonly output: GainNode
  private readonly compressor: DynamicsCompressorNode
  private readonly noiseSource: AudioBufferSourceNode
  private readonly noiseGain: GainNode
  private readonly roughSource: AudioBufferSourceNode
  private readonly grainBus: GainNode
  private readonly grainBuffer: AudioBuffer
  private readonly scheduler: GrainScheduler
  private grainSpeed = 0 // 粒の数・大きさを決める速度。同時に動くレーキが多いと、ノイズの速度より少し大きい
  private released = false

  constructor(private readonly ctx: AudioContext) {
    this.output = ctx.createGain()
    // 突発的な大音量を抑える（spike もこの段を通した音で調整した）
    this.compressor = ctx.createDynamicsCompressor()
    this.output.connect(this.compressor).connect(ctx.destination)

    this.noiseSource = ctx.createBufferSource()
    this.noiseSource.buffer = createPinkNoiseBuffer(ctx, 3)
    this.noiseSource.loop = true
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = SETTINGS.bandpassFreq
    bandpass.Q.value = SETTINGS.bandpassQ
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = SETTINGS.lowpassFreq
    lowpass.Q.value = SETTINGS.lowpassQ
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0
    // roughGain の gain = 1 + 深さ × 揺れ(-1..1)
    const roughGain = ctx.createGain()
    roughGain.gain.value = 1
    this.noiseSource.connect(bandpass).connect(lowpass).connect(this.noiseGain).connect(roughGain).connect(this.output)

    this.roughSource = ctx.createBufferSource()
    this.roughSource.buffer = createRoughnessBuffer(ctx, 5)
    this.roughSource.loop = true
    this.roughSource.playbackRate.value = SETTINGS.roughnessRate / ROUGHNESS_BASE_RATE
    const roughDepth = ctx.createGain()
    roughDepth.gain.value = SETTINGS.roughnessDepth
    this.roughSource.connect(roughDepth).connect(roughGain.gain)

    this.grainBus = ctx.createGain()
    this.grainBus.gain.value = 0
    this.grainBus.connect(this.output)
    this.grainBuffer = createPinkNoiseBuffer(ctx, 0.5)

    this.noiseSource.start()
    this.roughSource.start()
    this.scheduler = new GrainScheduler(ctx, () => this.grainSpeed * SETTINGS.grainMaxRate, (t) => this.playGrain(t))
  }

  // speed: 0..1。0 で無音（レーキを持ち上げている）。
  // grainBoost: 粒だけを speed の何倍の速さとみなすか（同時に動くレーキが多いとき、粒だけ少し増やす）
  setSpeed(speed: number, time: number, grainBoost = 1): void {
    if (this.released) return
    const { noise, grains, grainSpeed } = rakeLevels(speed, grainBoost)
    this.grainSpeed = grainSpeed
    this.noiseGain.gain.setTargetAtTime(noise, time, SETTINGS.smoothing)
    this.grainBus.gain.setTargetAtTime(grains, time, SETTINGS.smoothing)
  }

  // 音を消してから止める。いきなり止めるとプチッと鳴るため
  release(): void {
    if (this.released) return
    this.setSpeed(0, this.ctx.currentTime)
    this.released = true
    window.setTimeout(() => this.dispose(), RELEASE * 1000)
  }

  private dispose(): void {
    this.scheduler.dispose()
    try {
      this.noiseSource.stop()
      this.roughSource.stop()
    } catch {
      // AudioContext を閉じた後なら、すでに止まっている
    }
    this.output.disconnect()
    this.compressor.disconnect()
  }

  // 長め・中低域の粒を重ねる（シャリシャリ、ザリザリ）。spike の案A
  private playGrain(time: number): void {
    const duration = rand(0.02, 0.06)
    const src = this.ctx.createBufferSource()
    src.buffer = this.grainBuffer
    src.playbackRate.value = rand(0.8, 1.25)
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = rand(400, 2000)
    bp.Q.value = rand(1, 2.5)
    const env = this.ctx.createGain()
    hannEnvelope(env, time, duration, rand(0.4, 1) * (0.4 + this.grainSpeed * 0.6) * 1.5)
    src.connect(bp).connect(env).connect(this.grainBus)
    src.start(time, rand(0, 0.4))
    src.stop(time + duration + 0.01)
  }
}
