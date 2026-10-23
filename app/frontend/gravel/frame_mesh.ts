import {
  BoxGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CURB, curbBlocks, type CurbBlock } from './curb'
import { GRAVEL, scatterGravel } from './scatter'

const CURB_COLOR = new Color(0xc8c6bf) // 白っぽい御影石の色。石ごとの濃さを掛けてばらつかせる
const CURB_RADIUS = 0.006 // 縁石の角の丸み[m]。角張りすぎないように
const PEBBLE_COLOR = new Color(0x6b6d6c) // 暗い灰色の角ばった砂利
const BED_COLOR = 0x4f4c47 // 溝の底。砂利のすき間から見える
const BURIED = 0.03 // 縁石を地面に埋める深さ[m]

type Garden = { width: number; depth: number }

// 庭の外周の枠。砂のすぐ外の縁石は常に置き、砂利（溝の底・砂利・外側の縁石）は gravel のまとまりで出し入れする。
// 庭は中心を原点に寝かせ、庭の y = 0（奥）を -z に置く（sand_mesh.ts の平面と同じ）
export function createGardenFrame(garden: Garden): { group: Group; gravel: Group; dispose(): void } {
  const box = new BoxGeometry(1, 1, 1) // 継ぎ目の芯に使う
  const rounded = new Map<string, RoundedBoxGeometry>() // 縁石の寸法ごとの、角を丸めた形
  const curbMaterial = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
  const pebble = new IcosahedronGeometry(0.5, 0) // 角ばった小石。差し渡しは並べるときに掛ける
  pebble.scale(1, 0.6, 1)
  const pebbleMaterial = new MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true })
  const bedMaterial = new MeshStandardMaterial({ color: BED_COLOR, roughness: 1, metalness: 0 })
  const beds = bedStrips(garden, CURB.width, CURB.width + GRAVEL.width, -0.01) // 溝の底
  // 縁石の継ぎ目から背景が白い線になって見えたので、縁石の帯ごとに、継ぎ目のない暗い芯を縁石のすぐ内側に入れる
  const skirtMaterial = new MeshStandardMaterial({ color: BED_COLOR, roughness: 1, metalness: 0 })

  const gravel = new Group()
  gravel.add(...curbs(garden, CURB.width + GRAVEL.width, rounded, curbMaterial))
  gravel.add(skirt(garden, CURB.width + GRAVEL.width, box, skirtMaterial))
  gravel.add(pebbles(garden, pebble, pebbleMaterial))
  for (const bed of beds) {
    const strip = new Mesh(bed, bedMaterial)
    strip.receiveShadow = true
    gravel.add(strip)
  }

  const group = new Group()
  group.add(...curbs(garden, 0, rounded, curbMaterial), skirt(garden, 0, box, skirtMaterial), gravel)
  return {
    group,
    gravel,
    dispose() {
      const resources = [box, ...rounded.values(), curbMaterial, skirtMaterial, pebble, pebbleMaterial, bedMaterial, ...beds]
      for (const resource of resources) resource.dispose()
    },
  }
}

const matrix = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3()
const up = new Vector3(0, 1, 0)
const color = new Color()

// 砂の外側から offset 離れた帯に縁石を並べる。砂より CURB.height 高く、BURIED だけ埋める。
// 角を丸めた形は伸ばすと丸みがいびつになるので、同じ寸法の石ごとに形を1つ作ってまとめて並べる（寸法は辺ごとにほぼ1種類）
function curbs(garden: Garden, offset: number, shapes: Map<string, RoundedBoxGeometry>, material: MeshStandardMaterial): InstancedMesh[] {
  const height = CURB.height + BURIED
  const groups = new Map<string, CurbBlock[]>()
  for (const block of curbBlocks(garden, offset)) {
    const key = `${block.length.toFixed(4)}:${block.along}`
    groups.set(key, [...(groups.get(key) ?? []), block])
  }
  return [...groups].map(([key, blocks]) => {
    const { length, along } = blocks[0]
    let shape = shapes.get(key)
    if (!shape) {
      shape = new RoundedBoxGeometry(along === 'x' ? length : CURB.width, height, along === 'x' ? CURB.width : length, 2, CURB_RADIUS)
      shapes.set(key, shape)
    }
    const mesh = new InstancedMesh(shape, material, blocks.length)
    mesh.castShadow = true
    mesh.receiveShadow = true
    blocks.forEach(({ x, y, shade }, i) => {
      position.set(x - garden.width / 2, CURB.height - height / 2, y - garden.depth / 2)
      mesh.setMatrixAt(i, matrix.compose(position, rotation.identity(), scale.setScalar(1)))
      mesh.setColorAt(i, color.copy(CURB_COLOR).multiplyScalar(shade))
    })
    return mesh
  })
}

// 縁石の帯の、継ぎ目のない芯。縁石より 2mm 細く低くして、継ぎ目からだけ見えるようにする
function skirt(garden: Garden, offset: number, box: BoxGeometry, material: MeshStandardMaterial): InstancedMesh {
  const c = CURB.width, inset = 0.002
  const height = CURB.height + BURIED - inset
  const outer = offset + c
  const sides = [
    { x: garden.width / 2, y: -offset - c / 2, length: garden.width + 2 * outer, along: 'x' }, // 奥
    { x: garden.width / 2, y: garden.depth + offset + c / 2, length: garden.width + 2 * outer, along: 'x' }, // 手前
    { x: -offset - c / 2, y: garden.depth / 2, length: garden.depth + 2 * offset, along: 'y' }, // 左
    { x: garden.width + offset + c / 2, y: garden.depth / 2, length: garden.depth + 2 * offset, along: 'y' }, // 右
  ] as const
  const mesh = new InstancedMesh(box, material, sides.length)
  sides.forEach(({ x, y, length, along }, i) => {
    position.set(x - garden.width / 2, CURB.height - inset - height / 2, y - garden.depth / 2)
    rotation.identity()
    // 端も縁石と同じ面に重ならないよう、長さも少し縮める（重なると面がちらつく）
    scale.set(along === 'x' ? length - 2 * inset : c - inset, height, along === 'x' ? c - inset : length - 2 * inset)
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
  })
  return mesh
}

function pebbles(garden: Garden, geometry: IcosahedronGeometry, material: MeshStandardMaterial): InstancedMesh {
  const list = scatterGravel(garden)
  const mesh = new InstancedMesh(geometry, material, list.length)
  mesh.castShadow = true
  mesh.receiveShadow = true
  list.forEach(({ x, y, size, rotation: angle, shade }, i) => {
    // 溝の底（砂より少し低い）に半分ほど埋めて据える
    position.set(x - garden.width / 2, size * 0.1 - 0.01, y - garden.depth / 2)
    rotation.setFromAxisAngle(up, angle)
    scale.setScalar(size)
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
    mesh.setColorAt(i, color.copy(PEBBLE_COLOR).multiplyScalar(shade))
  })
  return mesh
}

// 砂の外側 from〜to[m] の帯の地面（溝の底・縁石の下）を、高さ height[m] に置く。奥・手前は角まで、左右はその間だけ
function bedStrips(garden: Garden, from: number, to: number, height: number): PlaneGeometry[] {
  const w = to - from
  const inner = from
  const strip = (width: number, depth: number, x: number, z: number) => {
    const plane = new PlaneGeometry(width, depth)
    plane.rotateX(-Math.PI / 2)
    plane.translate(x, height, z)
    return plane
  }
  const full = garden.width + 2 * (inner + w)
  const middle = garden.depth + 2 * inner
  const near = inner + w / 2
  return [
    strip(full, w, 0, -garden.depth / 2 - near),
    strip(full, w, 0, garden.depth / 2 + near),
    strip(w, middle, -garden.width / 2 - near, 0),
    strip(w, middle, garden.width / 2 + near, 0),
  ]
}
