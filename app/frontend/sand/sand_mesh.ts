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
import { normalMapPixels, updateNormals } from './normal_map'
import type { CellRect, SandField } from './rake'

// ハイトマップの凹凸を法線マップとして貼った砂の平面。頂点は動かさない（陰影だけで凹凸を見せる）。
// 掻き直したら updateSandMesh で法線マップを書き直す。プレビューでは変わった範囲だけを updateSandMeshRegions で書き直す
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

export function updateSandMesh(mesh: Mesh<PlaneGeometry, MeshStandardMaterial>, field: SandField): void {
  updateSandMeshRegions(mesh, field, [{ x0: 0, y0: 0, x1: field.width - 1, y1: field.height - 1 }])
}

// 高さが変わった範囲の法線だけを書き直す。テクスチャは全面を1回送り直す（部分的に送るのは、カクつくようなら考える）
export function updateSandMeshRegions(mesh: Mesh<PlaneGeometry, MeshStandardMaterial>, field: SandField, changed: CellRect[]): void {
  if (changed.length === 0) return
  const normalMap = mesh.material.normalMap as DataTexture
  for (const rect of changed) updateNormals(normalMap.image.data as Uint8Array, field, rect)
  normalMap.needsUpdate = true
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
