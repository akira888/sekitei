import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import { normalMapPixels } from './normal_map'
import type { SandField } from './rake'

// ハイトマップの凹凸を法線マップとして貼った砂の平面。頂点は動かさない（陰影だけで凹凸を見せる）。
// 平面は XZ 面に寝かせる。ハイトマップの x → ワールドの +x、行（+v）→ ワールドの -z
export function createSandMesh(field: SandField, size: { width: number; depth: number }): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const geometry = new PlaneGeometry(size.width, size.depth)
  geometry.rotateX(-Math.PI / 2)

  const normalMap = new DataTexture(normalMapPixels(field), field.width, field.height, RGBAFormat, UnsignedByteType)
  normalMap.magFilter = LinearFilter
  normalMap.minFilter = LinearMipmapLinearFilter
  normalMap.generateMipmaps = true
  normalMap.anisotropy = 8
  normalMap.needsUpdate = true

  const material = new MeshStandardMaterial({ color: 0xd9d2c3, roughness: 1, metalness: 0, normalMap })
  return new Mesh(geometry, material)
}
