import { IcosahedronGeometry, Vector3 } from 'three'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 石の生成器。球の頂点を、中心からの向きごとに伸び縮みさせて石の形にする。
// 半径 = うねり・凹凸のノイズ → 割れ面（平面）で切り落とす → 細かいざらつき。最後に軸ごとに寸法を合わせる。
// 形のファイルは保存しないので、同じパラメータと seed からは必ず同じ形を作る（Math.random は使わない）
export type StoneParams = {
  size: number // 真上から見た長い方の差し渡し[m]（x 方向）
  tallness: number // 砂から出ている高さ ÷ size。0.3 くらいで平石、1 を超えると立ち石
  roughness: number // ゴツゴツ度 0〜1。大きいほど凹凸が大きい
  moss: number // 苔の量 0〜1。0 で苔なし。増やすと上を向いた面から側面へ広がる
  seed: number // 形のくじの番号。ユーザーには見せない
}

// 頂点の座標（x, y, z の並び）、面（頂点の番号 3つずつ、外から見て反時計回り）、頂点ごとの色の濃さ（1 が基準）と
// 苔の濃さ（0〜1）。原点は真上から見た石の中心の、砂の高さ。center は形を伸び縮みさせた中心
export type StoneShape = {
  positions: Float32Array
  indices: Uint32Array
  shades: Float32Array
  moss: Float32Array
  mossTones: Float32Array // 苔の色のムラ -1（暗い緑）〜 1（明るい緑）
  center: [number, number, number]
}

// 球の細かさ。three の正二十面体は各辺を DETAIL + 1 等分するので、頂点は 10 × (DETAIL + 1)² + 2 個。
// 20 で 4412 頂点（大きさ 0.4 の石で頂点の間隔 約 6mm）。苔の凹凸やざらつきを出せ、作る時間は1つ約 16ms
const DETAIL = 20
const LUMP = 0.15 // 大きなうねりの強さ。ゴツゴツ度によらず付ける
const BUMP = 0.12 // ゴツゴツ度 1 のときの凹凸の強さ。輪郭がギザギザしないよう、細かすぎない大きさにする
const GRAIN = 0.006 // 表面のざらつきの強さ
const CUTS = { min: 4, max: 7 } // 割れ面の枚数
const CUT_DEPTH = { min: 0.55, max: 0.85 } // 割れ面の中心からの距離（球の半径 1 に対して）
const EDGE = 0.04 // 割れ面どうしの角の丸み
const SINK = 0.15 // 石の高さのうち砂に沈める割合
const SHADE = 0.12 // 色のムラの強さ
const MOSS_SPREAD = 1.1 // 苔の量 1 で、苔の付く境目が真上（法線の上向き 1）からここまで下がる
const MOSS_EDGE = 0.25 // 苔の付き始めから濃くなるまでの幅（法線の上向きの成分で）
const MOSS_JITTER = 0.15 // 苔の境目をまだらにするノイズの強さ
const MOSS_SMOOTH = 8 // 苔の付き方を決める法線を、隣の頂点となだらかにする回数。細かいくぼみではなく大きな面の向きで決める
const MOSS_THICK = 0.006 // 苔の厚み[m]。苔の付いた所を石の中心から外へ、この 4〜10 割だけばらばらに盛り上げてざらつかせる

// 半径が正のままなら、どの向きも中心から見て1回だけ表面を通るので面は裏返らない。
// うねり + 凹凸の最大（0.15 + 0.12 × 1.5）と、角の丸め（EDGE × log(枚数 + 1)）を引いても、半径は 0.4 以上残る

export function stoneShape({ size, tallness, roughness, moss, seed }: StoneParams): StoneShape {
  const random = mulberry32(seed)
  const noise = new SimplexNoise({ random })
  const depth = 0.6 + 0.3 * random() // 奥行きの比率。x を長い方とする
  const cuts = cutPlanes(random)

  // 正二十面体はテクスチャの継ぎ目で同じ位置の頂点を別々に持つ。位置だけで束ねないと、
  // 継ぎ目の両側で法線が別になり、苔の盛り上げで割れたように開くので、uv と法線を外してから束ねる
  const icosahedron = new IcosahedronGeometry(1, DETAIL)
  icosahedron.deleteAttribute('uv')
  icosahedron.deleteAttribute('normal')
  const sphere = mergeVertices(icosahedron)
  icosahedron.dispose()
  const unit = sphere.attributes.position
  const positions = new Float32Array(unit.count * 3)
  const shades = new Float32Array(unit.count)
  const jitters = new Float32Array(unit.count)
  const mossTones = new Float32Array(unit.count)
  const mossBumps = new Float32Array(unit.count)
  const d = new Vector3()
  for (let i = 0; i < unit.count; i++) {
    d.set(unit.getX(i), unit.getY(i), unit.getZ(i))
    let radius = 1 + LUMP * noise.noise3d(d.x * 1.2, d.y * 1.2, d.z * 1.2)
    radius += BUMP * roughness * fbm(noise, d.x * 2.5 + 50, d.y * 2.5, d.z * 2.5, 2)
    radius = cut(radius, d, cuts)
    radius *= 1 + GRAIN * fbm(noise, d.x * 24 + 100, d.y * 24, d.z * 24, 2)
    positions[i * 3] = d.x * radius
    positions[i * 3 + 1] = d.y * radius
    positions[i * 3 + 2] = d.z * radius * depth
    shades[i] = 1 + SHADE * fbm(noise, d.x * 3 + 200, d.y * 3, d.z * 3, 2) / 1.5
    jitters[i] = MOSS_JITTER * fbm(noise, d.x * 6 + 300, d.y * 6, d.z * 6, 2) / 1.5
    mossTones[i] = clamp(fbm(noise, d.x * 18 + 400, d.y * 18, d.z * 18, 2) / 1.2, -1, 1)
    mossBumps[i] = clamp01(0.5 + 0.5 * noise.noise3d(d.x * 40 + 500, d.y * 40, d.z * 40))
  }
  const indices = Uint32Array.from(sphere.index!.array)
  sphere.dispose()

  // x の差し渡しを size に、砂から出る高さを size × tallness に揃え、高さの SINK だけ砂に沈める
  const scaleX = size / span(positions, 0)
  const scaleZ = Math.min(scaleX, size / span(positions, 2)) // 奥行きが size を超えないように
  const scaleY = (size * tallness) / (1 - SINK) / span(positions, 1)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= scaleX
    positions[i + 1] *= scaleY
    positions[i + 2] *= scaleZ
  }
  const bottom = Math.min(...axis(positions, 1))
  const lift = -bottom - SINK * span(positions, 1)
  for (let i = 1; i < positions.length; i += 3) positions[i] += lift

  // 苔は上を向いた面に付き、付いた所だけ石の中心から外へ盛り上げる（苔の厚みでざらついて見える）。
  // 法線の向きに盛ると、くぼみで向かい合う面が折れ重なって割れのような暗い筋になった。
  // 中心からの距離を伸ばすだけなら、中心から見て表面を1回だけ通るままなので折れない
  // 付き方は、細かいくぼみではなく大きな面の向きで決める。くぼみの斜面だけ苔が抜けると、灰色の筋が割れのように見えた
  const normals = smoothNormals(vertexNormals(positions, indices), indices, MOSS_SMOOTH)
  const mossWeights = mossOf(normals, jitters, moss)
  for (let i = 0; i < mossWeights.length; i++) {
    const thick = MOSS_THICK * mossWeights[i] * (0.4 + 0.6 * mossBumps[i])
    if (thick === 0) continue
    const dx = positions[i * 3], dy = positions[i * 3 + 1] - lift, dz = positions[i * 3 + 2]
    const length = Math.hypot(dx, dy, dz)
    positions[i * 3] += (dx / length) * thick
    positions[i * 3 + 1] += (dy / length) * thick
    positions[i * 3 + 2] += (dz / length) * thick
  }

  return { positions, indices, shades, moss: mossWeights, mossTones, center: [0, lift, 0] }
}

// 苔の濃さ。法線が上を向いているほど濃く、苔の量を増やすと付く境目が下がって側面へ広がる。
// 境目はノイズでまだらにし、下を向いた面（法線の上向き -0.1 未満）には付けない
function mossOf(normals: Float32Array, jitters: Float32Array, amount: number): Float32Array {
  const result = new Float32Array(jitters.length)
  if (amount <= 0) return result
  const threshold = 1 - amount * MOSS_SPREAD
  for (let i = 0; i < result.length; i++) {
    const up = normals[i * 3 + 1] // 法線の上向きの成分
    const t = clamp01((up + jitters[i] - threshold) / MOSS_EDGE)
    const facingUp = clamp01((up + 0.1) / 0.2)
    result[i] = t * t * (3 - 2 * t) * facingUp // smoothstep で境目をなめらかに
  }
  return result
}

// 頂点の法線（面の法線を面積の重みで足し合わせて正規化）。x, y, z の並び
function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const sums = new Float32Array(positions.length)
  const v = (i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]]
    const [pa, pb, pc] = [v(a), v(b), v(c)]
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    for (const k of [a, b, c]) for (let j = 0; j < 3; j++) sums[k * 3 + j] += n[j]
  }
  for (let i = 0; i < sums.length; i += 3) {
    const length = Math.hypot(sums[i], sums[i + 1], sums[i + 2]) || 1
    for (let j = 0; j < 3; j++) sums[i + j] /= length
  }
  return sums
}

// 頂点の法線を、辺でつながった隣の頂点の法線との平均に置き換えることを times 回くり返す
function smoothNormals(normals: Float32Array, indices: Uint32Array, times: number): Float32Array {
  let current = normals
  for (let t = 0; t < times; t++) {
    const next = current.slice() // 自分の向きも平均に入れる
    for (let f = 0; f < indices.length; f += 3) {
      const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]]
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        for (let j = 0; j < 3; j++) {
          next[p * 3 + j] += current[q * 3 + j]
          next[q * 3 + j] += current[p * 3 + j]
        }
      }
    }
    for (let i = 0; i < next.length; i += 3) {
      const length = Math.hypot(next[i], next[i + 1], next[i + 2]) || 1
      for (let j = 0; j < 3; j++) next[i + j] /= length
    }
    current = next
  }
  return current
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const clamp01 = (x: number) => clamp(x, 0, 1)

type Plane = { normal: Vector3; distance: number }

// 割れ面。向きはばらばら、中心からの距離は球の内側。真下は砂に埋まるので切らない
function cutPlanes(random: () => number): Plane[] {
  const count = CUTS.min + Math.floor(random() * (CUTS.max - CUTS.min + 1))
  return Array.from({ length: count }, () => {
    const y = random() * 1.6 - 0.6 // 下向きを少なめにする
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    const normal = new Vector3(r * Math.cos(angle), y, r * Math.sin(angle))
    return { normal, distance: CUT_DEPTH.min + random() * (CUT_DEPTH.max - CUT_DEPTH.min) }
  })
}

// 向き d の半径を、割れ面の手前までに縮める。角が尖りすぎないよう、なめらかな最小（soft min）で丸める
function cut(radius: number, d: Vector3, planes: Plane[]): number {
  let sum = Math.exp(-radius / EDGE)
  for (const { normal, distance } of planes) {
    const facing = d.dot(normal)
    if (facing > 0) sum += Math.exp(-distance / facing / EDGE)
  }
  return -EDGE * Math.log(sum)
}

// 大きさの違うノイズを重ねる。値はおよそ ±(1 + 1/2 + …)
function fbm(noise: SimplexNoise, x: number, y: number, z: number, octaves: number): number {
  let total = 0
  for (let octave = 0; octave < octaves; octave++) {
    const f = 2 ** octave
    total += noise.noise3d(x * f, y * f, z * f) / f
  }
  return total
}

function axis(positions: Float32Array, offset: number): number[] {
  const values: number[] = []
  for (let i = offset; i < positions.length; i += 3) values.push(positions[i])
  return values
}

function span(positions: Float32Array, offset: number): number {
  const values = axis(positions, offset)
  return Math.max(...values) - Math.min(...values)
}

// seed から 0〜1 の乱数を順に出す（小さく速い擬似乱数）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
