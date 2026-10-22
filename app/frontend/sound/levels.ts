import { SETTINGS } from './settings'

export type RakeLevels = {
  noise: number // ノイズの音量
  grains: number // 粒全体の音量
  grainSpeed: number // 粒の数と1粒の大きさを決める速度（0..1）
}

// レーキの速度（0..1）から、シンセの音量を決める。Web Audio に依存しない。
// ノイズの音量は速度の平方根で大きくする（ゆっくりでも聞こえるように）。
// spike の改善C（速いときはノイズを頭打ちにし、粒を主役にする）は、砂箱の音と聴き比べて外した。
// そのため速さは、ノイズの大きさと、粒の数・1粒の大きさで表し、粒全体の音量は変えない。
// grainBoost は、同時に動くレーキが多いときに粒だけ少し増やす倍率
export function rakeLevels(speed: number, grainBoost = 1): RakeLevels {
  if (speed <= 0) return { noise: 0, grains: 0, grainSpeed: 0 }
  return {
    noise: SETTINGS.noiseGain * Math.sqrt(speed),
    grains: SETTINGS.grainGain,
    grainSpeed: Math.min(1, speed * grainBoost),
  }
}
