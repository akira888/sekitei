import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderChunk,
  UnsignedByteType,
} from 'three'
import { GRAIN, GRAIN_NORMAL_HOOK, grainNormalPixels, grainPixels } from './grain'
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

  // 砂の粒の色のムラを繰り返し貼る。模様の平均の明るさの分だけ砂の色を明るくして、全体の明るさを変えない
  const grain = tiledTexture(grainPixels(), size)
  // 粒の細かい凹凸。色の粒と同じ繰り返しで、砂紋の法線に重ねる（下の onBeforeCompile）
  const grainNormal = tiledTexture(grainNormalPixels(), size)

  // 砂の色は白川砂に寄せて、少し白く黄みを抑える（下絵の砂の色 #d9d2c3 より明るい）
  const material = new MeshStandardMaterial({ color: 0xe3ded4, roughness: 1, metalness: 0, normalMap, map: grain })
  material.color.multiplyScalar(1 / GRAIN.mean)
  // 砂紋の法線（接空間）に、粒の凹凸の法線を重ねる（whiteout ブレンド）。色の粒と同じ uv（vMapUv）で引く
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grainNormal = { value: grainNormal }
    shader.fragmentShader = `uniform sampler2D grainNormal;\n${shader.fragmentShader}`.replace(
      '#include <normal_fragment_maps>',
      ShaderChunk.normal_fragment_maps.replace(
        GRAIN_NORMAL_HOOK,
        `vec3 grainN = texture2D( grainNormal, vMapUv ).xyz * 2.0 - 1.0;
        mapN = normalize( vec3( mapN.xy + grainN.xy, mapN.z * grainN.z ) );
        ${GRAIN_NORMAL_HOOK}`,
      ),
    )
  }
  material.userData.grainNormal = grainNormal // 破棄するときに使う
  return new Mesh(geometry, material)
}

// 庭に繰り返し貼る、粒の画像のテクスチャ。GRAIN.tile[m] ごとに1枚
function tiledTexture(pixels: Uint8Array, size: { width: number; depth: number }): DataTexture {
  const texture = new DataTexture(pixels, GRAIN.size, GRAIN.size, RGBAFormat, UnsignedByteType)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(size.width / GRAIN.tile, size.depth / GRAIN.tile)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
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
