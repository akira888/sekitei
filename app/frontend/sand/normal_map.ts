import type { SandField } from './rake'

// ハイトマップから接空間の法線マップ（RGBA8）を作る。
// 配列の行の向きをテクスチャの +v として扱う（DataTexture は 0 行目が v=0）。
// strength は高さの強調倍率。大きいほど陰影が強く出る
export function normalMapPixels(field: SandField, strength = 1): Uint8Array {
  const { width: W, height: H } = field
  const pixels = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = ((field.at(Math.min(x + 1, W - 1), y) - field.at(Math.max(x - 1, 0), y)) / 2) * strength
      const gy = ((field.at(x, Math.min(y + 1, H - 1)) - field.at(x, Math.max(y - 1, 0))) / 2) * strength
      const len = Math.hypot(gx, gy, 1)
      const o = (y * W + x) * 4
      pixels[o] = encode(-gx / len)
      pixels[o + 1] = encode(-gy / len)
      pixels[o + 2] = encode(1 / len)
      pixels[o + 3] = 255
    }
  }
  return pixels
}

// [-1, 1] → [1, 255]。傾きのない成分がちょうど 128 になるようにする
const encode = (v: number) => Math.round(v * 127 + 128)
