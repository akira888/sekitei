// 真上から見下ろす正投影カメラの範囲[m]。庭の中心を原点に、庭全体と周りの余白が画面に収まるようにする。
// margin は庭の寸法に対する余白の割合（0.1 なら両側に 5% ずつではなく、合わせる辺の全体を 1.1 倍にする）
export type Frustum = { left: number; right: number; top: number; bottom: number }

export function topDownFrustum(garden: { width: number; depth: number }, aspect: number, margin: number): Frustum {
  const scale = 1 + margin
  const fitsByDepth = aspect >= garden.width / garden.depth
  const halfH = fitsByDepth ? (garden.depth * scale) / 2 : (garden.width * scale) / 2 / aspect
  const halfW = halfH * aspect
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH }
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
