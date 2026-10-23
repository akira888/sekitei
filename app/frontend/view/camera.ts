// 斜めから見る 3D のカメラの視点。庭の中心を見る、左右の角度・上下の角度・距離で表す（OrbitControls と同じ取り方）。
// 完成したときの視点を「鑑賞の始まりの視点」として scene に保存し、見る人はその周りで少しだけ動ける
// （石庭は縁側の一か所からじっくり眺めるものなので。設計メモ §29）

export type CameraView = {
  azimuth: number // 左右の角度[度]。手前（+z）が 0、右（+x）へ回る向きに増える
  polar: number // 上下の角度[度]。真上が 0、水平が 90
  distance: number // 庭の中心からの距離[m]
}

type Range = { min: number; max: number }
export type ViewLimits = { azimuth?: Range; polar: Range; distance: Range }

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (deg: number) => (deg * Math.PI) / 180
const clamp = (value: number, { min, max }: Range) => Math.min(max, Math.max(min, value))

// 既定の視点。手前から斜めに見下ろす（これまでの仕上がりの初期の位置 (0, 1.6, 2.6)）
export const DEFAULT_VIEW: CameraView = positionToView({ x: 0, y: 1.6, z: 2.6 })

// 編集中に回せる範囲。真上から見下ろしすぎず、地面すれすれにも潜らない。平行移動はさせない
export const EDIT_LIMITS: ViewLimits = {
  polar: { min: 15, max: 78 },
  distance: { min: 1.2, max: 5 },
}

const VIEWING = { azimuth: 90, polar: 10, nearer: 0.8, farther: 1.15 } // 見る人が動ける幅（左右はユーザーの調整で ±45° → ±90°）

export function viewToPosition({ azimuth, polar, distance }: CameraView): { x: number; y: number; z: number } {
  const a = rad(azimuth), p = rad(polar)
  return { x: distance * Math.sin(p) * Math.sin(a), y: distance * Math.cos(p), z: distance * Math.sin(p) * Math.cos(a) }
}

export function positionToView({ x, y, z }: { x: number; y: number; z: number }): CameraView {
  const distance = Math.hypot(x, y, z)
  return { azimuth: deg(Math.atan2(x, z)), polar: deg(Math.acos(y / distance)), distance }
}

// 保存された視点を読むときに、編集中に回せる範囲に収める
export function clampView(view: CameraView): CameraView {
  const azimuth = ((((view.azimuth + 180) % 360) + 360) % 360) - 180
  return {
    azimuth: azimuth === -180 ? 180 : azimuth,
    polar: clamp(view.polar, EDIT_LIMITS.polar),
    distance: clamp(view.distance, EDIT_LIMITS.distance),
  }
}

// 完成した庭を見る人が動ける範囲。保存した視点から左右 ±90°・上下 ±10°、寄る・離れるは少しだけ
export function viewingLimits(view: CameraView): ViewLimits {
  return {
    azimuth: { min: view.azimuth - VIEWING.azimuth, max: view.azimuth + VIEWING.azimuth },
    polar: {
      min: clamp(view.polar - VIEWING.polar, EDIT_LIMITS.polar),
      max: clamp(view.polar + VIEWING.polar, EDIT_LIMITS.polar),
    },
    distance: {
      min: clamp(view.distance * VIEWING.nearer, EDIT_LIMITS.distance),
      max: clamp(view.distance * VIEWING.farther, EDIT_LIMITS.distance),
    },
  }
}
