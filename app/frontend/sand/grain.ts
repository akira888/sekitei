import { mulberry32 } from '../random'

// 砂の粒の色のムラ。細かい明暗の粒を散らした灰色の小さな画像を、砂の平面に繰り返し貼り、砂の色に掛ける。
// 白川砂のような「粒が集まった」見え方にするため（設計メモ §30）。模様は固定の seed から毎回同じに作る
export const GRAIN = {
  size: 256, // 画像の一辺[px]
  tile: 0.5, // 画像1枚が覆う庭の長さ[m]。1px ≒ 2mm
  mean: 0.88, // 平均の明るさ（0〜1）。砂の色はこの分だけ明るくして掛け、全体の明るさを変えない
  grains: 9000, // 散らす粒の数
  bump: 6, // 細かい凹凸の強さ。粒の明るさを高さとみなすときの倍率（1.5 と見比べてユーザーが 6 に決めた）
  seed: 20261025,
} as const

// 砂の材質のシェーダー（three の normal_fragment_maps）で、砂紋の法線から向きを決める行。
// ここを書き換えて、砂紋の法線に細かい凹凸を重ねる（sand_mesh.ts）
export const GRAIN_NORMAL_HOOK = 'normal = normalize( tbn * mapN );'

// 粒の色のムラ（灰色の RGBA）。砂の色に掛ける
export function grainPixels(): Uint8Array {
  const light = grainLight()
  const pixels = new Uint8Array(light.length * 4)
  for (let i = 0; i < light.length; i++) {
    const v = Math.round(light[i] * 255)
    pixels.set([v, v, v, 255], i * 4)
  }
  return pixels
}

// 細かい凹凸の法線（接空間の RGBA）。粒の明るさを高さとみなす（明るい粒ほど少し盛り上がる）ので、
// 色の粒と凹凸の位置がそろう。端は反対側へ回り込んで、継ぎ目なく繰り返す
export function grainNormalPixels(): Uint8Array {
  const { size, bump } = GRAIN
  const light = grainLight()
  const h = (x: number, y: number) => light[((y + size) % size) * size + ((x + size) % size)] * bump
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) / 2
      const dy = (h(x, y + 1) - h(x, y - 1)) / 2
      const length = Math.hypot(dx, dy, 1)
      const n = [-dx / length, -dy / length, 1 / length]
      pixels.set([...n.map((v) => Math.round((v + 1) * 127.5)), 255], (y * size + x) * 4)
    }
  }
  return pixels
}

// 画素ごとの明るさ（0〜1、平均は GRAIN.mean）
function grainLight(): Float32Array {
  const { size, mean } = GRAIN
  const random = mulberry32(GRAIN.seed)
  const light = new Float32Array(size * size)
  // 下地: 平均のまわりのごく弱いざらつき
  for (let i = 0; i < light.length; i++) light[i] = mean + (random() - 0.5) * 0.06

  // 粒: 半径 0.6〜1.6px の丸。多くは平均のまわり、ときどき暗い粒・明るい粒。端は反対側へ回り込む（継ぎ目なく繰り返すため）。
  // 暗い粒は 5%・平均より 0.12〜0.18 暗く（12%・0.22〜0.32 暗くしたら、胡椒をふったように見えた）
  for (let n = 0; n < GRAIN.grains; n++) {
    const cx = random() * size, cy = random() * size
    const r = 0.6 + random() * 1.0
    const kind = random()
    const shade = kind < 0.05 ? mean - 0.12 - random() * 0.06 : kind < 0.13 ? mean + 0.08 + random() * 0.06 : mean + (random() - 0.5) * 0.12
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue
        light[(((y % size) + size) % size) * size + (((x % size) + size) % size)] = shade
      }
    }
  }

  // 平均を決めた値に揃える
  const offset = mean - light.reduce((sum, v) => sum + v, 0) / light.length
  for (let i = 0; i < light.length; i++) light[i] = Math.min(1, Math.max(0, light[i] + offset))
  return light
}
