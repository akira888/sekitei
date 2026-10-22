// シンセの音源にするノイズのバッファ。spike（spikes/sound/src/noise.ts）から、使う分だけ移した

// ピンクノイズ（Paul Kellet の近似）。ホワイトより低域寄りで、風っぽさが減る
export function createPinkNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  return buffer
}

// ザラつき用の揺れ（振幅変調の信号）。ホワイトノイズを baseRate[Hz] 付近まで平滑化し、RMS 0.5 に揃えて -1..1 に収める。
// 揺れの速さは再生側の playbackRate で変える（rate / baseRate）
export const ROUGHNESS_BASE_RATE = 40

export function createRoughnessBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // 1次ローパスを2段重ねて、高域のジリジリを落とす
  const a = Math.exp((-2 * Math.PI * ROUGHNESS_BASE_RATE) / ctx.sampleRate)
  let y1 = 0, y2 = 0
  for (let i = 0; i < data.length; i++) {
    y1 = a * y1 + (1 - a) * (Math.random() * 2 - 1)
    y2 = a * y2 + (1 - a) * y1
    data[i] = y2
  }
  // ループのつなぎ目で値が跳ぶと音量が急変してプチッと鳴るので、末尾 50ms を先頭の値へ寄せる
  const fade = Math.floor(ctx.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const k = data.length - fade + i
    const w = (i + 1) / fade
    data[k] = data[k] * (1 - w) + data[0] * w
  }
  let sumSq = 0
  for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i]
  const scale = 0.5 / Math.sqrt(sumSq / data.length)
  for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i] * scale))
  return buffer
}
