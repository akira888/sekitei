// 砂を掻く音のシンセの設定。spike（spikes/sound）で、砂を木箱に入れてなぞった音と聴き比べて決めた値（設計メモ §8）。
// 括弧内は spike のスライダーの名前。調整するときはここだけを変える
export const SETTINGS = {
  bandpassFreq: 2066, // [Hz]（ノイズ中心周波数）
  bandpassQ: 5.9, // （Q。spike では 10 倍の 59 で持つ）
  lowpassFreq: 1400, // [Hz]（A ローパス）。速度で動かさない。音色を滑らせると風切り音に聞こえるため（改善A）
  lowpassQ: 2, // [dB]（A ローパスの共振）。Web Audio の lowpass の Q は dB で表す
  roughnessDepth: 0.45, // ノイズの音量を不規則に揺らす深さ（B ザラつきの深さ）
  roughnessRate: 95, // [Hz]（B 揺れの速さ）
  grainMaxRate: 56, // 速度 1 のときの粒の数[/秒]（粒の最大密度）
  grainGain: 0.05, // （粒の音量）
  noiseGain: 0.9, // 速度 1 のときのノイズの音量
  smoothing: 0.045, // 音量の変化を速度に追従させる時定数[s]（音の追従）
}
