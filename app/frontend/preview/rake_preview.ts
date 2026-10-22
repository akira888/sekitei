import type { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { SandField } from '../sand/rake'
import { updateSandMesh, updateSandMeshRegions } from '../sand/sand_mesh'
import type { Stroke } from '../sand/shapes'
import { RakeSynth } from '../sound/rake_synth'
import { RakePlayback, planPreview } from './playback'
import { grainBoost, synthSpeed } from './sound_level'
import { sampleTimeline, type Timeline } from './timeline'

// レーキが平らな砂を下のレイヤーから順に掻いていく様子を、音と合わせて再生する。
// 同じレイヤーの図形（掻く範囲が重ならない図形）は、帯・輪もすべてまとめて同時に掻く。
// 編集画面の状態に依存しない（鑑賞モードでも使う想定）。描画のフレームごとに update を呼ぶ。
// 時計は AudioContext.currentTime。タブを隠すと AudioContext ごと止めるので、画面と音がずれない

// 速さはブラウザで見ながら調整する仮の値
const TIMING = {
  speed: 1, // 同時に掻くうちで一番長いストロークの巡航の速さ[m/s]
  ramp: 0.6, // 掻き始めの加速・終わりの減速[s]
  pause: 0.8, // まとまりの間にレーキを持ち上げている時間[s]（spike の自動ストロークの値）
  leadIn: 0.6, // 最初のまとまりまでの間[s]
}

type SandMesh = Mesh<PlaneGeometry, MeshStandardMaterial>

type Run = {
  ctx: AudioContext
  startAt: number
  timeline: Timeline
  playback: RakePlayback
  field: SandField
  synth: RakeSynth
  // 1フレームの処理時間[ms]（テクスチャを送る時間は含まない）。長いプレビューでも膨らまないよう、配列にはためない
  frames: { count: number; total: number; max: number }
  startedAt: number // performance.now() の時刻。描画が追いついているかを fps で見る
}

export class RakePreview {
  private run?: Run

  constructor(
    private readonly sand: SandMesh,
    private readonly field: { width: number; height: number },
    private readonly cellsPerMeter: number,
    private readonly onFinish: () => void,
  ) {}

  // shapes は図形ごとのストローク（配列の順がレイヤー順）。
  // ctx はクリックの中で作るか resume しておく（ブラウザの自動再生の制限のため）
  start(shapes: Stroke[][], ctx: AudioContext): void {
    this.stop()
    const startedAt = performance.now()
    const plan = planPreview(shapes, this.field.width, this.field.height, this.cellsPerMeter, TIMING)
    const strokes = shapes.reduce((sum, s) => sum + s.length, 0)
    const ms = Math.round(performance.now() - startedAt)
    console.info(`[sekitei] プレビューの計算: ${ms}ms（${plan.steps.length}まとまり・${strokes}本、${plan.timeline.duration.toFixed(1)}秒）`)

    const field = new SandField(this.field.width, this.field.height)
    updateSandMesh(this.sand, field) // 平らな砂から始める
    this.run = {
      ctx,
      startAt: ctx.currentTime,
      timeline: plan.timeline,
      playback: new RakePlayback(field, plan),
      field,
      synth: new RakeSynth(ctx),
      frames: { count: 0, total: 0, max: 0 },
      startedAt: performance.now(),
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  update(): void {
    const run = this.run
    if (!run) return
    const startedAt = performance.now()
    const t = run.ctx.currentTime - run.startAt
    updateSandMeshRegions(this.sand, run.field, run.playback.advance(t))
    const { speed, moving, done } = sampleTimeline(run.timeline, t)
    run.synth.setSpeed(synthSpeed(speed), run.ctx.currentTime, grainBoost(moving))
    const ms = performance.now() - startedAt
    run.frames = { count: run.frames.count + 1, total: run.frames.total + ms, max: Math.max(run.frames.max, ms) }
    if (done) this.finish()
  }

  // 残りを一度に掻いて終わる
  skip(): void {
    const run = this.run
    if (!run) return
    run.playback.finish()
    updateSandMesh(this.sand, run.field)
    this.finish()
  }

  // 途中でやめる。砂は掻いた途中のまま残る
  stop(): void {
    if (!this.run) return
    this.end()
  }

  private finish(): void {
    this.end()
    this.onFinish()
  }

  private end(): void {
    const run = this.run!
    run.synth.release()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    const { count, total, max } = run.frames
    if (count > 0) {
      const fps = count / ((performance.now() - run.startedAt) / 1000)
      console.info(`[sekitei] プレビューの1フレーム: 平均 ${(total / count).toFixed(1)}ms・最大 ${max.toFixed(1)}ms（${count}フレーム、${fps.toFixed(0)}fps）`)
    }
    this.run = undefined
  }

  // タブを隠している間は時計ごと止め、戻したら続きから再生する
  private onVisibilityChange = (): void => {
    const run = this.run
    if (!run) return
    if (document.hidden) void run.ctx.suspend()
    else void run.ctx.resume()
  }
}
