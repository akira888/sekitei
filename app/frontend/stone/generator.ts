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
  seed: number // 形のくじの番号。ユーザーには見せない
}

// 頂点の座標（x, y, z の並び）、面（頂点の番号 3つずつ、外から見て反時計回り）、頂点ごとの色の濃さ（1 が基準）。
// 原点は真上から見た石の中心の、砂の高さ。center は形を伸び縮みさせた中心
export type StoneShape = { positions: Float32Array; indices: Uint32Array; shades: Float32Array; center: [number, number, number] }

const DETAIL = 5 // 球の細かさ（正二十面体の分割の回数）。5 で 10242 頂点。ざらつきを出せる細かさ
const LUMP = 0.15 // 大きなうねりの強さ。ゴツゴツ度によらず付ける
const BUMP = 0.12 // ゴツゴツ度 1 のときの凹凸の強さ。輪郭がギザギザしないよう、細かすぎない大きさにする
const GRAIN = 0.006 // 表面のざらつきの強さ
const CUTS = { min: 4, max: 7 } // 割れ面の枚数
const CUT_DEPTH = { min: 0.55, max: 0.85 } // 割れ面の中心からの距離（球の半径 1 に対して）
const EDGE = 0.04 // 割れ面どうしの角の丸み
const SINK = 0.15 // 石の高さのうち砂に沈める割合
const SHADE = 0.12 // 色のムラの強さ

// 半径が正のままなら、どの向きも中心から見て1回だけ表面を通るので面は裏返らない。
// うねり + 凹凸の最大（0.15 + 0.12 × 1.5）と、角の丸め（EDGE × log(枚数 + 1)）を引いても、半径は 0.4 以上残る

export function stoneShape({ size, tallness, roughness, seed }: StoneParams): StoneShape {
  const random = mulberry32(seed)
  const noise = new SimplexNoise({ random })
  const depth = 0.6 + 0.3 * random() // 奥行きの比率。x を長い方とする
  const cuts = cutPlanes(random)

  const sphere = mergeVertices(new IcosahedronGeometry(1, DETAIL))
  const unit = sphere.attributes.position
  const positions = new Float32Array(unit.count * 3)
  const shades = new Float32Array(unit.count)
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

  return { positions, indices, shades, center: [0, lift, 0] }
}

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
