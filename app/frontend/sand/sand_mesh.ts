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
export function createSandMesh(field: SandField, size: { width: number; depth: number }): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const geometry = createGardenPlane(size)

  const normalMap = new DataTexture(normalMapPixels(field), field.width, field.height, RGBAFormat, UnsignedByteType)
  normalMap.magFilter = LinearFilter
  normalMap.minFilter = LinearMipmapLinearFilter
  normalMap.generateMipmaps = true
  normalMap.anisotropy = 8
  normalMap.needsUpdate = true

  const material = new MeshStandardMaterial({ color: 0xd9d2c3, roughness: 1, metalness: 0, normalMap })
  return new Mesh(geometry, material)
}

// 庭の平面。XZ 面に寝かせ、テクスチャの x → ワールドの +x、行 → ワールドの +z（0 行目が奥）に貼る。
// 庭の座標（左上が原点、y は下向き）を、真上から見た画面・2D Canvas・マウス座標の向きと揃えるため、
// PlaneGeometry の UV を上下反転して 0 行目（v=0）を奥（-z）に置く。
// テクスチャは flipY しない前提（DataTexture の既定。CanvasTexture は flipY = false にする）
export function createGardenPlane(size: { width: number; depth: number }): PlaneGeometry {
  const geometry = new PlaneGeometry(size.width, size.depth)
  geometry.rotateX(-Math.PI / 2)
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
  return geometry
}
