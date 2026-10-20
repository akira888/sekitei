import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { createGardenPlane } from './sand_mesh'
import { drawSketch, sketchOps } from './sketch'
import type { Stroke } from './shapes'

// 下絵を Canvas に描き、庭の平面に貼る。光の影響を受けない MeshBasicMaterial にして、
// 真上から見たときに線の色がそのまま見えるようにする
const COLORS = { sand: '#d9d2c3', line: '#a39a8a' }

export function createSketchMesh(
  strokes: Stroke[],
  field: { width: number; height: number },
  size: { width: number; depth: number },
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const canvas = document.createElement('canvas')
  canvas.width = field.width
  canvas.height = field.height
  drawSketch(canvas.getContext('2d')!, sketchOps(strokes), COLORS)

  const texture = new CanvasTexture(canvas)
  texture.flipY = false // createGardenPlane の UV の向きに合わせる
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return new Mesh(createGardenPlane(size), new MeshBasicMaterial({ map: texture }))
}
