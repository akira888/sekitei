// レーキの動きを、シンセに渡す値にする。DOM に依存しない純粋関数だけを置く

// 実寸のこの速さ[m/s]をシンセの速度 1 とする。spike の自動ストロークを庭の実寸に直した目盛り
const SPEED_SCALE = 1.7
// 同時に動くレーキの本数で粒を増やす度合い（1 + DENSITY × log2(本数) 倍、上限 DENSITY_MAX 倍）。
// 本数ぶん重ねると迫力が出すぎて ASMR でなくなるので、1本分より少し多いくらいにとどめる（設計メモ §21。
// 最初の 2本 1.1倍・8本 1.3倍は、聞いて多いとなり半分にした）
const DENSITY = 0.05
const DENSITY_MAX = 1.15

export function synthSpeed(speed: number): number {
  return Math.min(1, Math.max(0, speed / SPEED_SCALE))
}

export function grainBoost(moving: number): number {
  return moving <= 1 ? 1 : Math.min(DENSITY_MAX, 1 + DENSITY * Math.log2(moving))
}
