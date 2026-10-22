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
  blocked?: Uint8Array // 1 のマスは掻かない（石の下。sand/seating.ts）
  liftArea?: Uint8Array // 歯の位置がここ（石の周り）に入る所では、その歯を持ち上げて溝を止める
  constructor(readonly width: number, readonly height: number) {
    this.h = new Float32Array(width * height)
  }
  // 掻く前の砂（石の根元の盛りと、掻かない印）から掻き始めるための写し
  clone(): SandField {
    const copy = new SandField(this.width, this.height)
    copy.h.set(this.h)
    copy.blocked = this.blocked
    copy.liftArea = this.liftArea
    return copy
  }
  at(x: number, y: number): number {
    return this.h[y * this.width + x]
  }
  set(x: number, y: number, value: number): void {
    this.h[y * this.width + x] = value
  }
}

// 1本のパスを掻いた結果。マスごとの新しい高さを、そのマスを見せる点の順に並べて持つ。
// プレビューでは、レーキが進んだ点までの分だけを書き込む（applyEffect）。各マスは一度だけ書き込むので、
// どこで区切っても、最後まで書き込めば一度に掻いた結果と同じになる。
// 新しい高さは掻く前の高さから決まるので、前のストロークをすべて書き込んでから計算する
export type RakeEffect = {
  cells: Int32Array // マスの番号（y * width + x）。見せる順に並ぶ
  heights: Float32Array // そのマスの新しい高さ
  offsets: Int32Array // 点 j で見せるマスは cells[offsets[j] .. offsets[j + 1])
}

export type CellRect = { x0: number; y0: number; x1: number; y1: number } // 両端を含むマスの範囲

// パスに沿ってレーキで掻く
export function rakeField(field: SandField, path: Point[], s: RakeStyle): void {
  applyEffect(field, rakeEffect(field, path, s))
}

// 点 from 〜 to（to は含まない）で見せるマスを書き込み、書き込んだマスを囲む範囲を返す
export function applyEffect(field: SandField, effect: RakeEffect, from = 0, to = effect.offsets.length - 1): CellRect | undefined {
  const { cells, heights, offsets } = effect
  const begin = offsets[from], end = offsets[to]
  if (begin >= end) return undefined
  const W = field.width
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let n = begin; n < end; n++) {
    const k = cells[n]
    field.h[k] = heights[n]
    const x = k % W, y = (k - x) / W
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

// パスに沿ってレーキで掻いた結果を計算する（砂はまだ変えない）。
// 1. レーキの幅（外側の歯の溝の縁まで）を基準面にならし、各歯が溝を掘る
// 2. 掘った砂は、その歯の近い側に盛る（歯の間の山も、縁の土手も同じ仕組み）
//    古い砂紋をならした砂は盛りに足さない（交差点にこぶを残さないため。体積は保存しない）
export function rakeEffect(field: SandField, path: Point[], s: RakeStyle): RakeEffect {
  if (path.length < 2) return { cells: new Int32Array(0), heights: new Float32Array(0), offsets: new Int32Array(path.length + 1) }
  const { width: W, height: H, h } = field
  const ns = normals(path)
  const half = ((s.tines - 1) / 2) * s.spacing // 中心から外側の歯まで
  const g = s.grooveWidth / 2
  const edge = half + g // ならす範囲の半幅
  const reach = edge + s.pileWidth
  const segLen = pathLength(path) / (path.length - 1)
  const tineAt = (i: number) => i * s.spacing - half

  // レーキが届くのはパスの周り reach マスまでなので、その範囲（bx0..bx1, by0..by1）だけを見る
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of path) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const bx0 = Math.max(0, Math.floor(minX - reach)), bx1 = Math.min(W - 1, Math.ceil(maxX + reach))
  const by0 = Math.max(0, Math.floor(minY - reach)), by1 = Math.min(H - 1, Math.ceil(maxY + reach))
  if (bx0 > bx1 || by0 > by1) return { cells: new Int32Array(0), heights: new Float32Array(0), offsets: new Int32Array(path.length + 1) }
  const BW = bx1 - bx0 + 1, BH = by1 - by0 + 1
  const cellOf = (l: number) => (by0 + Math.floor(l / BW)) * W + bx0 + (l % BW)

  // 各マスについて「一番近いパスの点」とそこからの横方向の距離を求める（急カーブでもループしない）。
  // あわせて、レーキが最初にそのマスへ届く点（first）を記録する。マスはこの点で見せる
  const best = new Float32Array(BW * BH).fill(Infinity)
  const nearest = new Int32Array(BW * BH).fill(-1)
  const first = new Int32Array(BW * BH).fill(-1)
  const lateral = new Float32Array(BW * BH)
  for (let j = 0; j < path.length; j++) {
    const p = path[j], n = ns[j]
    const x0 = Math.max(bx0, Math.floor(p.x - reach)), x1 = Math.min(bx1, Math.ceil(p.x + reach))
    const y0 = Math.max(by0, Math.floor(p.y - reach)), y1 = Math.min(by1, Math.ceil(p.y + reach))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - p.x, dy = y - p.y
        const d2 = dx * dx + dy * dy
        if (d2 > reach * reach) continue
        // 各点は自分の前後 2点ぶんの範囲だけ受け持つ。始点より手前・終点より先が掻かれず、端が四角く切れる
        // （内側の点まで含めて制限しないと、2番目以降の点が端の外側を半円状に拾ってしまう）
        const along = dx * n.y - dy * n.x
        if (Math.abs(along) > segLen * 2) continue
        const l = (y - by0) * BW + (x - bx0)
        if (first[l] < 0) first[l] = j
        if (d2 < best[l]) {
          best[l] = d2
          nearest[l] = j
          lateral[l] = dx * n.x + dy * n.y
        }
      }
    }
  }

  // 石の周りに入る歯は、その点で持ち上げる（溝を掘らず、ならしもせず、盛りもしない）。
  // マス単位で切ると、石に沿って回る溝（同心円の中心に石があるとき）が縦に切られ、盛りの下へ潜って見えるため。
  // 歯ごと・点ごとに止めれば、溝は石に当たった所で端になる
  const lifted = new Uint8Array(path.length * s.tines)
  if (field.liftArea) {
    for (let j = 0; j < path.length; j++) {
      for (let i = 0; i < s.tines; i++) {
        const x = Math.round(path[j].x + ns[j].x * tineAt(i)), y = Math.round(path[j].y + ns[j].y * tineAt(i))
        if (x >= 0 && y >= 0 && x < W && y < H && field.liftArea[y * W + x]) lifted[j * s.tines + i] = 1
      }
    }
  }

  // 1回目: ならして溝を掘り、掘った砂の量を「パスの点 × 歯」ごとに集計する。
  // 左右には半分ずつ盛る（マス目で左右に分けて数えると、溝の中心の列が片側に寄って量が偏るため）
  const bucket = (j: number, i: number) => j * s.tines + i
  const moved = new Float32Array(path.length * s.tines)
  const next = new Float32Array(BW * BH) // 新しい高さ
  const touched = new Uint8Array(BW * BH) // このストロークで高さが決まるマス
  for (let l = 0; l < next.length; l++) {
    const j = nearest[l]
    if (j < 0 || Math.abs(lateral[l]) > edge) continue
    const i = Math.min(s.tines - 1, Math.max(0, Math.round((lateral[l] + half) / s.spacing)))
    if (lifted[bucket(j, i)]) continue
    const u = lateral[l] - tineAt(i) // 歯からの横距離
    const dug = Math.abs(u) < g ? -s.depth * Math.cos((Math.PI * u) / (2 * g)) : 0
    moved[bucket(j, i)] += -dug // 基準面から掘った分だけ（古い高さは数えない）
    next[l] = dug
    touched[l] = 1
  }

  // 2回目: 各歯の左右、溝の縁のすぐ外に sin の山として盛る（面積で割って体積を保つ）。
  // 隣の歯の盛りと重なれば足し合わさって1本の山になる。
  // 帯の外（縁の土手）は古い砂紋の上に乗るので、盛りが厚いほど古い砂紋を埋めて消す。
  // 単純に足すと「古い畝 + 土手」が飛び出て、古い畝が土手を越えて続いて見えるため
  const area = (2 * s.pileWidth) / Math.PI
  for (let l = 0; l < next.length; l++) {
    const j = nearest[l]
    if (j < 0) continue
    let pile = 0
    let cover = 0 // 0..1。土手の頂上で 1（古い砂紋が完全に埋まる）
    for (let i = 0; i < s.tines; i++) {
      const u = lateral[l] - tineAt(i)
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
    const outside = Math.abs(lateral[l]) > edge
    next[l] = (outside ? h[cellOf(l)] * (1 - cover) : next[l]) + pile
    touched[l] = 1
  }

  // 掻かない印のマス（石の下）は、計算した高さを捨てて元のままにする
  const { blocked } = field
  if (blocked) for (let l = 0; l < next.length; l++) if (touched[l] && blocked[cellOf(l)]) touched[l] = 0

  // 見せる順にマスを並べる。一番近い点の順にすると、同心円の始点の重なりで、近い点が始点側と終点側に
  // 分かれたマスが斑に残る（一周して戻るまで書き込まれない）ので、最初に届いた点の順にする
  const order = first
  const offsets = new Int32Array(path.length + 1)
  for (let l = 0; l < next.length; l++) if (touched[l]) offsets[order[l] + 1]++
  for (let j = 0; j < path.length; j++) offsets[j + 1] += offsets[j]
  const cells = new Int32Array(offsets[path.length])
  const heights = new Float32Array(offsets[path.length])
  const cursor = offsets.slice(0, path.length)
  for (let l = 0; l < next.length; l++) {
    if (!touched[l]) continue
    const at = cursor[order[l]]++
    cells[at] = cellOf(l)
    heights[at] = next[l]
  }
  return { cells, heights, offsets }
}
