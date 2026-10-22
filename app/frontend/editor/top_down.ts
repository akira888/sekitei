// 真上から見下ろす正投影カメラの範囲[m]。庭の中心を原点とする。
// 画面から insets[px] を除いた残りの範囲に、庭全体と周りの余白を収め、庭の中心を残りの範囲の中心に置く。
// insets は画面の縁に重ねている操作の帯（上のパレットとボタン）。庭がその下に潜って操作できなくならないように空ける。
// margin は庭の寸法に対する余白の割合（0.1 なら両側に 5% ずつではなく、合わせる辺の全体を 1.1 倍にする）
export type Frustum = { left: number; right: number; top: number; bottom: number }
type Insets = { top?: number; right?: number; bottom?: number; left?: number } // [px]

export function topDownFrustum(
  garden: { width: number; depth: number },
  viewport: Viewport,
  margin: number,
  { top = 0, right = 0, bottom = 0, left = 0 }: Insets = {},
): Frustum {
  const scale = 1 + margin
  const width = viewport.width - left - right
  const height = viewport.height - top - bottom
  const pixelsPerMeter = Math.min(width / (garden.width * scale), height / (garden.depth * scale))
  // 残りの範囲の中心[px] に庭の中心（原点）が来るようにずらす。画面の上が奥（frustum の top）
  const centerX = left + width / 2
  const centerY = top + height / 2
  return {
    left: -centerX / pixelsPerMeter,
    right: (viewport.width - centerX) / pixelsPerMeter,
    top: centerY / pixelsPerMeter,
    bottom: -(viewport.height - centerY) / pixelsPerMeter,
  }
}

type Pixel = { x: number; y: number } // 画面の座標[px]。左上が原点、y は下向き
type Viewport = { width: number; height: number } // [px]

// 画面の座標 → 庭の座標[m]。カメラは庭の中心の真上にあり、画面の上が庭の奥（y = 0 の側）
export function screenToGarden(pixel: Pixel, viewport: Viewport, frustum: Frustum, garden: { width: number; depth: number }) {
  return {
    x: garden.width / 2 + frustum.left + (pixel.x / viewport.width) * (frustum.right - frustum.left),
    y: garden.depth / 2 - frustum.top + (pixel.y / viewport.height) * (frustum.top - frustum.bottom),
  }
}

// 庭の座標[m] → 画面の座標。screenToGarden の逆
export function gardenToScreen(point: Pixel, viewport: Viewport, frustum: Frustum, garden: { width: number; depth: number }): Pixel {
  return {
    x: ((point.x - garden.width / 2 - frustum.left) / (frustum.right - frustum.left)) * viewport.width,
    y: ((point.y - garden.depth / 2 + frustum.top) / (frustum.top - frustum.bottom)) * viewport.height,
  }
}
