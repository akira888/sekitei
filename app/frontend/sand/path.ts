// レーキ軌跡パス（点列）の幾何ユーティリティ。単位はハイトマップのマス（px）

export type Point = { x: number; y: number }

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

// 各点の左向き単位法線（前後の点から接線を求める）
export function normals(path: Point[]): Point[] {
  return path.map((_, i) => {
    const a = path[Math.max(i - 1, 0)]
    const b = path[Math.min(i + 1, path.length - 1)]
    const len = dist(a, b) || 1
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  })
}

export const pathLength = (path: Point[]) =>
  path.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(path[i - 1], p)), 0)
