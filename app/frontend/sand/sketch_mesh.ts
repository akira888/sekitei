import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { createGardenPlane } from './sand_mesh'
import { drawSketch, sketchOps, type SketchStones } from './sketch'
import type { Stroke } from './shapes'

// 下絵を Canvas に描き、庭の平面に貼る。光の影響を受けない MeshBasicMaterial にして、
// 真上から見たときに線の色がそのまま見えるようにする。図形・石を編集したら redraw で描き直す
const COLORS = { sand: '#d9d2c3', line: '#a39a8a' }

export type SketchMesh = {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  redraw(strokes: Stroke[], stones: SketchStones): void
}

export function createSketchMesh(
  strokes: Stroke[],
  stones: SketchStones,
  field: { width: number; height: number },
  size: { width: number; depth: number },
): SketchMesh {
  const canvas = document.createElement('canvas')
  canvas.width = field.width
  canvas.height = field.height
  const ctx = canvas.getContext('2d')!

  const texture = new CanvasTexture(canvas)
  texture.flipY = false // createGardenPlane の UV の向きに合わせる
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8

  const redraw = (strokes: Stroke[], stones: SketchStones): void => {
    drawSketch(ctx, sketchOps(strokes, stones), COLORS)
    texture.needsUpdate = true
  }
  redraw(strokes, stones)
  return { mesh: new Mesh(createGardenPlane(size), new MeshBasicMaterial({ map: texture })), redraw }
}
