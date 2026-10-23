import type { CellRect, SandField } from './rake'

// ハイトマップから接空間の法線マップ（RGBA8）を作る。
// 配列の行の向きをテクスチャの +v として扱う（DataTexture は 0 行目が v=0）。
// strength は高さの強調倍率。大きいほど陰影が強く出る
export function normalMapPixels(field: SandField, strength = 1): Uint8Array {
  const pixels = new Uint8Array(field.width * field.height * 4)
  writeNormals(pixels, field, { x0: 0, y0: 0, x1: field.width - 1, y1: field.height - 1 }, strength)
  return pixels
}

// 高さを変えた範囲（changed）の法線を pixels に書き直す。法線は左右・上下の隣の高さから決まるので、
// 範囲の1マス外側まで書き直す
export function updateNormals(pixels: Uint8Array, field: SandField, changed: CellRect, strength = 1): void {
  writeNormals(pixels, field, {
    x0: Math.max(0, changed.x0 - 1),
    y0: Math.max(0, changed.y0 - 1),
    x1: Math.min(field.width - 1, changed.x1 + 1),
    y1: Math.min(field.height - 1, changed.y1 + 1),
  }, strength)
}

// 傾きは Sobel（斜めの隣も含め、1 : 2 : 1 の重みでならした左右・上下の差）で求める。
// 左右・上下の隣の差だけで決めると、マス単位の段差（同心円の境目のギザギザ、山の表面のまだら、小さな点）が
// そのまま陰影に出たため。なめらかな斜面の傾きは隣の差で決めたときと同じになる
function writeNormals(pixels: Uint8Array, field: SandField, rect: CellRect, strength: number): void {
  const { width: W, height: H } = field
  const h = (x: number, y: number) => field.at(Math.min(Math.max(x, 0), W - 1), Math.min(Math.max(y, 0), H - 1))
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const gx = ((h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) / 8) * strength
      const gy = ((h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) / 8) * strength
      const len = Math.hypot(gx, gy, 1)
      const o = (y * W + x) * 4
      pixels[o] = encode(-gx / len)
      pixels[o + 1] = encode(-gy / len)
      pixels[o + 2] = encode(1 / len)
      pixels[o + 3] = 255
    }
  }
}

// [-1, 1] → [1, 255]。傾きのない成分がちょうど 128 になるようにする
const encode = (v: number) => Math.round(v * 127 + 128)
