import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three'
import { stoneShape, type StoneParams } from './generator'

// 石の基本の色（灰色がかった茶）。頂点ごとの濃さを掛けてムラにする。
// 頂点の色はリニアの値として扱われるので、Color を通して sRGB の色から変換しておく
const COLOR = new Color(0x6f6b63).toArray()

// 生成器の形から石の Mesh を作る。砂に影を落とし、自分の凹凸の影も受ける。
// 法線は頂点で平均してなめらかにする（面の角を残す見た目より石らしかった。ユーザー確認）
export function createStoneMesh(params: StoneParams): Mesh<BufferGeometry, MeshStandardMaterial> {
  const { positions, indices, shades } = stoneShape(params)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  const colors = new Float32Array(shades.length * 3)
  shades.forEach((shade, i) => COLOR.forEach((c, j) => (colors[i * 3 + j] = c * shade)))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))

  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  const mesh = new Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
