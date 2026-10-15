import { normals, pathLength, type Point } from './path'

// 砂を高さの格子（ハイトマップ）として持ち、レーキで掻いた跡を刻む。
// 単位はマス（px）。高さの単位も px 相当で、法線マップの陰影の付き方の目安になる。
// 根拠と経緯は .claude/design/sekitei.md の §9

export type RakeStyle = {
  tines: number // 歯の数
  spacing: number // 歯の間隔
  depth: number // 溝の深さ
  grooveWidth: number // 歯1本が掘る溝の幅
  pileWidth: number // 歯の片側に盛られる砂の幅
}

export class SandField {
  readonly h: Float32Array
  constructor(readonly width: number, readonly height: number) {
    this.h = new Float32Array(width * height)
  }
  at(x: number, y: number): number {
    return this.h[y * this.width + x]
  }
  set(x: number, y: number, value: number): void {
    this.h[y * this.width + x] = value
  }
}

// パスに沿ってレーキで掻く。
// 1. レーキの幅（外側の歯の溝の縁まで）を基準面にならし、各歯が溝を掘る
// 2. 掘った砂は、その歯の近い側に盛る（歯の間の山も、縁の土手も同じ仕組み）
//    古い砂紋をならした砂は盛りに足さない（交差点にこぶを残さないため。体積は保存しない）
export function rakeField(field: SandField, path: Point[], s: RakeStyle): void {
  if (path.length < 2) return
  const { width: W, height: H, h } = field
  const ns = normals(path)
  const half = ((s.tines - 1) / 2) * s.spacing // 中心から外側の歯まで
  const g = s.grooveWidth / 2
  const edge = half + g // ならす範囲の半幅
  const reach = edge + s.pileWidth
  const segLen = pathLength(path) / (path.length - 1)
  const tineAt = (i: number) => i * s.spacing - half

  // 各マスについて「一番近いパスの点」とそこからの横方向の距離を求める（急カーブでもループしない）
  const best = new Float32Array(W * H).fill(Infinity)
  const nearest = new Int32Array(W * H).fill(-1)
  const lateral = new Float32Array(W * H)
  for (let j = 0; j < path.length; j++) {
    const p = path[j], n = ns[j]
    const x0 = Math.max(0, Math.floor(p.x - reach)), x1 = Math.min(W - 1, Math.ceil(p.x + reach))
    const y0 = Math.max(0, Math.floor(p.y - reach)), y1 = Math.min(H - 1, Math.ceil(p.y + reach))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - p.x, dy = y - p.y
        const d2 = dx * dx + dy * dy
        if (d2 > reach * reach) continue
        // 各点は自分の前後 2点ぶんの範囲だけ受け持つ。始点より手前・終点より先が掻かれず、端が四角く切れる
        // （内側の点まで含めて制限しないと、2番目以降の点が端の外側を半円状に拾ってしまう）
        const along = dx * n.y - dy * n.x
        if (Math.abs(along) > segLen * 2) continue
        const k = y * W + x
        if (d2 < best[k]) {
          best[k] = d2
          nearest[k] = j
          lateral[k] = dx * n.x + dy * n.y
        }
      }
    }
  }

  // 1回目: ならして溝を掘り、掘った砂の量を「パスの点 × 歯」ごとに集計する。
  // 左右には半分ずつ盛る（マス目で左右に分けて数えると、溝の中心の列が片側に寄って量が偏るため）
  const bucket = (j: number, i: number) => j * s.tines + i
  const moved = new Float32Array(path.length * s.tines)
  for (let k = 0; k < h.length; k++) {
    const j = nearest[k]
    if (j < 0 || Math.abs(lateral[k]) > edge) continue
    const i = Math.min(s.tines - 1, Math.max(0, Math.round((lateral[k] + half) / s.spacing)))
    const u = lateral[k] - tineAt(i) // 歯からの横距離
    const next = Math.abs(u) < g ? -s.depth * Math.cos((Math.PI * u) / (2 * g)) : 0
    moved[bucket(j, i)] += -next // 基準面から掘った分だけ（古い高さは数えない）
    h[k] = next
  }

  // 2回目: 各歯の左右、溝の縁のすぐ外に sin の山として盛る（面積で割って体積を保つ）。
  // 隣の歯の盛りと重なれば足し合わさって1本の山になる。
  // 帯の外（縁の土手）は古い砂紋の上に乗るので、盛りが厚いほど古い砂紋を埋めて消す。
  // 単純に足すと「古い畝 + 土手」が飛び出て、古い畝が土手を越えて続いて見えるため
  const area = (2 * s.pileWidth) / Math.PI
  for (let k = 0; k < h.length; k++) {
    const j = nearest[k]
    if (j < 0) continue
    let pile = 0
    let cover = 0 // 0..1。土手の頂上で 1（古い砂紋が完全に埋まる）
    for (let i = 0; i < s.tines; i++) {
      const u = lateral[k] - tineAt(i)
      const t = Math.abs(u) - g
      if (t <= 0 || t >= s.pileWidth) continue
      const shape = Math.sin((Math.PI * t) / s.pileWidth)
      // 見た目優先: 縁の土手を内側の山と同じ高さにする。内側の山は左右2本の歯から盛られるので、
      // 一番外の歯が外側に盛る量を2倍にして揃える（物理的な体積保存より一貫性を優先）
      const outerSide = (i === 0 && u < 0) || (i === s.tines - 1 && u >= 0)
      pile += (outerSide ? 2 : 1) * (moved[bucket(j, i)] / 2 / segLen) * shape / area
      cover = Math.max(cover, shape)
    }
    if (pile === 0) continue
    const outside = Math.abs(lateral[k]) > edge
    h[k] = (outside ? h[k] * (1 - cover) : h[k]) + pile
  }
}
