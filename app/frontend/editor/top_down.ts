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
