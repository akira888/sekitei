import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three'
import { stoneShape, type StoneParams } from './generator'
import { stoneTransform, type Stone } from './stone'

// 石の基本の色（灰色がかった茶）。頂点ごとの濃さを掛けてムラにする。
// 頂点の色はリニアの値として扱われるので、Color を通して sRGB の色から変換しておく
const COLOR = new Color(0x6f6b63).toArray()
// 苔の色（暗めの緑 #56653a）。苔の中は明るい緑と暗い緑の間でムラにし、苔の濃さで石の色と混ぜる
const MOSS_LIGHT = new Color(0x6c7d44).toArray()
const MOSS_DARK = new Color(0x3f4c29).toArray()

// 生成器の形から石の形（BufferGeometry）を作る。
// 法線は頂点で平均してなめらかにする（面の角を残す見た目より石らしかった。ユーザー確認）
export function createStoneGeometry(params: StoneParams): BufferGeometry {
  const { positions, indices, shades, moss, mossTones } = stoneShape(params)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  const colors = new Float32Array(shades.length * 3)
  shades.forEach((shade, i) => {
    const light = (mossTones[i] + 1) / 2
    COLOR.forEach((c, j) => {
      const mossColor = MOSS_DARK[j] + (MOSS_LIGHT[j] - MOSS_DARK[j]) * light
      colors[i * 3 + j] = (c + (mossColor - c) * moss[i]) * shade
    })
  })
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

// 石の材質。色は頂点の色で持つので、すべての石で1つを共有する
export function createStoneMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
}

// scene の石の配列に合わせて、石の Mesh を置き直す。
// 形はパラメータが変わった石だけ作り直し、古い形は捨てる（スライダーを動かすたびに作り直すため）
export class StoneLayer {
  readonly group = new Group()
  private readonly material = createStoneMaterial()
  private entries: { params: string; mesh: Mesh<BufferGeometry, MeshStandardMaterial> }[] = []

  constructor(private readonly garden: { width: number; depth: number }) {}

  sync(stones: Stone[]): void {
    stones.forEach((stone, i) => {
      const params = JSON.stringify(stone.params)
      let entry = this.entries[i]
      if (!entry) {
        const mesh = new Mesh(createStoneGeometry(stone.params), this.material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.group.add(mesh)
        entry = this.entries[i] = { params, mesh }
      } else if (entry.params !== params) {
        entry.mesh.geometry.dispose()
        entry.mesh.geometry = createStoneGeometry(stone.params)
        entry.params = params
      }
      const { x, z, rotationY } = stoneTransform(stone, this.garden)
      entry.mesh.position.set(x, 0, z)
      entry.mesh.rotation.y = rotationY
    })
    // 消した石の Mesh を捨てる
    for (const { mesh } of this.entries.splice(stones.length)) {
      this.group.remove(mesh)
      mesh.geometry.dispose()
    }
  }

  meshAt(index: number): Mesh<BufferGeometry, MeshStandardMaterial> | undefined {
    return this.entries[index]?.mesh
  }

  dispose(): void {
    this.sync([])
    this.material.dispose()
  }
}
