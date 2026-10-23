import type { Point } from '../sand/path'
import type { Stone } from '../stone/stone'
import type { Grip } from './grips'

// 石の配置と編集の計算。DOM に依存しない純粋関数だけを置く。座標は庭の座標[m]（grips.ts と同じ）。
// 位置と向きは庭の上のドラッグ、それ以外（大きさ・背の高さ・ゴツゴツ度・苔・形）は編集パネルで変える（設計メモ §13）

// 編集パネルのスライダーの範囲と刻み。数字は単位なしで見せる
export const STONE = {
  size: { min: 0.2, max: 1.2, step: 0.05 }, // 真上から見た長い方の差し渡し[m]
  tallness: { min: 0.25, max: 1.6, step: 0.05 }, // 砂から出ている高さ ÷ 大きさ
  roughness: { min: 0, max: 1, step: 0.05 },
  moss: { min: 0, max: 1, step: 0.05 }, // 苔の量。0 で苔なし
} as const
export type StoneParam = keyof typeof STONE

const DEFAULT = { size: 0.4, tallness: 0.6, roughness: 0.5, moss: 0 } // 苔は足したい石にだけ足す（ユーザー判断）
const ROTATE_ARM = 0.15 // 回転ハンドルを石の縁から離す距離[m]

const add = (a: Point, b: Point, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

// パレットから置く石。seed はここでは決めない（乱数を使うのは呼ぶ側。同じ入力から同じ石を作るため）
export function newStone(at: Point, seed: number): Stone {
  return { type: 'stone', params: { ...DEFAULT, seed }, position: { ...at }, rotation: 0 }
}

// 「別の形にする」。大きさなどは保ち、凹凸の出方だけを変える
export function reshapeStone(stone: Stone, seed: number): Stone {
  return { ...stone, params: { ...stone.params, seed } }
}

export function changeStoneParam(stone: Stone, param: StoneParam, value: number): Stone {
  const range = STONE[param]
  const snapped = Math.round(value / range.step) * range.step
  // 刻みに丸めたときの小数の誤差を残さない（保存する値を読みやすくするため）
  const rounded = Number(clamp(snapped, range).toFixed(4))
  return { ...stone, params: { ...stone.params, [param]: rounded } }
}

// 目印（move）は石の中心、回転ハンドルは石の縁の外を、石の向き（長い方）の先に置く
export function stoneGrips(stone: Stone): Grip[] {
  const a = (stone.rotation * Math.PI) / 180
  const arm = stone.params.size / 2 + ROTATE_ARM
  return [
    { kind: 'move', point: stone.position },
    { kind: 'rotate', point: add(stone.position, { x: Math.cos(a), y: Math.sin(a) }, arm) },
  ]
}

// クリックした地点にある石のうち、一番上（配列の後ろ）のものの番号。
// 真上から見た輪郭を、直径が大きさの円とみなす（奥行きは大きさ以下なので、横から少しはみ出して当たる）
export function hitStone(stones: Stone[], point: Point): number | undefined {
  for (let i = stones.length - 1; i >= 0; i--) {
    if (dist(stones[i].position, point) <= stones[i].params.size / 2) return i
  }
  return undefined
}

// つかみ所 grip を start でつかみ、current まで動かしたときの石。元の石は書き換えない
export function dragStone(stone: Stone, grip: Grip, start: Point, current: Point): Stone {
  const delta = add(current, start, -1)
  switch (grip.kind) {
    case 'move':
      return { ...stone, position: add(stone.position, delta) }
    case 'rotate': {
      const target = add(grip.point, delta)
      const rotation = (Math.atan2(target.y - stone.position.y, target.x - stone.position.x) * 180) / Math.PI
      return { ...stone, rotation }
    }
    default:
      return stone
  }
}
