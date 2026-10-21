import { Controller } from "@hotwired/stimulus"
import {
  Camera,
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { dragShape, gripsOf, hitShape, pickGrip, type Grip } from "../editor/grips"
import { drawOverlay, MARKER_RADIUS } from "../editor/overlay"
import { gardenToScreen, screenToGarden, topDownFrustum, type Frustum } from "../editor/top_down"
import type { Point } from "../sand/path"
import { SandField, rakeField } from "../sand/rake"
import { createSandMesh, updateSandMesh } from "../sand/sand_mesh"
import { createSketchMesh } from "../sand/sketch_mesh"
import { shapeToStrokes, type Rake, type Shape, type Stroke } from "../sand/shapes"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const CELLS_PER_METER = FIELD.width / GARDEN.width
const TOP_DOWN_MARGIN = 0.1 // 真上から見たときの庭の周りの余白（合わせる辺の 10%）
const GRIP_TOLERANCE = MARKER_RADIUS + 4 // 目印・ハンドルをつかめる範囲[px]

// 確認用の砂紋: 横の直線を敷き詰め、その上に同心円を掻く。配列の順番がレイヤー順（後ろほど上）。
// 画面から動かせるが保存はしないので、リロードするとこの形に戻る。保存（#8）で scene から読む形に置き換わる
const RAKE: Rake = { tines: 5, spacing: 0.05 }
const DEMO_SHAPES: Shape[] = [
  // 帯の幅 25cm × 8本 = 奥行き 2m なので、庭の中央を通る 8本で庭全体を敷き詰める
  { type: "straight", position: { x: 2, y: 1 }, angle: 0, rows: 8, rake: RAKE },
  { type: "concentric", center: { x: 2.75, y: 1 }, innerRadius: 0.1, rings: 3, rake: RAKE },
]

type View = "top-down" | "3d"
type GripOf = { grip: Grip; index: number } // どの図形のつかみ所か
type Drag = GripOf & { start: Point; original: Shape }

// Three.js のシーンを要素にマウントする。
// 編集中は真上から下絵を見せ、目印・ハンドルのドラッグで図形を動かす。
// 仮の切り替えボタンで掻いた後の 3D と見比べる（#7-5 で置き換える）。3D では編集しない。
// Turbo 遷移で要素が外れたときに WebGL リソースを確実に解放するため、
// 生成と破棄を connect / disconnect に対応させている。
export default class extends Controller<HTMLElement> {
  static targets = ["toggle"]
  declare readonly toggleTarget: HTMLButtonElement

  private renderer?: WebGLRenderer
  private controls?: OrbitControls
  private resizeObserver?: ResizeObserver
  private disposables: { dispose(): void }[] = []
  private view: View = "top-down"
  private applyView?: () => void
  private overlay?: HTMLCanvasElement
  private frustum?: Frustum

  private shapes: Shape[] = structuredClone(DEMO_SHAPES)
  private selected?: number
  private drag?: Drag
  private sketchDirty = false // 下絵を描き直す必要がある（ドラッグ中は描画のフレームごとにまとめて描く）
  private sandDirty = false // 3D に切り替えたときに掻き直す必要がある

  connect(): void {
    const scene = new Scene()
    scene.background = new Color(0xe8e4da)

    // 砂紋の凹凸は低い光で陰影が出るので、太陽は低めに置く。
    // 奥から照らす逆光だと溝と山が反転して見えやすいので、初期の視点と同じ手前側に置く
    scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xfff4e0, 2.5)
    sun.position.set(-3, 1.2, 1.5)
    scene.add(sun)

    const strokes = this.strokes()
    const sand = createSandMesh(this.rakedField(strokes), GARDEN)
    const { mesh: sketch, redraw: redrawSketch } = createSketchMesh(strokes, FIELD, GARDEN)
    scene.add(sand, sketch)
    this.disposables.push(sand.geometry, sand.material, sand.material.normalMap!)
    this.disposables.push(sketch.geometry, sketch.material, sketch.material.map!)

    const perspective = new PerspectiveCamera(45, 1, 0.05, 100)
    perspective.position.set(0, 1.6, 2.6)
    // 真上から見下ろし、画面の上を奥（-z）に向ける。庭の座標の y = 0（奥）が画面の上に来る
    const topDown = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    topDown.position.set(0, 5, 0)
    topDown.up.set(0, 0, -1)
    topDown.lookAt(0, 0, 0)

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    this.element.appendChild(renderer.domElement)
    this.renderer = renderer

    // 目印・ハンドルは WebGL の上に重ねた 2D Canvas に画面の座標で描き、ポインター操作もここで受ける
    const overlay = document.createElement("canvas")
    overlay.className = "scene-overlay"
    this.element.appendChild(overlay)
    this.overlay = overlay
    overlay.addEventListener("pointerdown", this.onPointerDown)
    overlay.addEventListener("pointermove", this.onPointerMove)
    overlay.addEventListener("pointerup", this.onPointerUp)
    overlay.addEventListener("pointercancel", this.onPointerUp)

    // 凹凸の見え方を確かめるための仮のカメラ操作。鑑賞モードの制限は #12 で決める
    this.controls = new OrbitControls(perspective, renderer.domElement)
    this.controls.enableDamping = true
    this.controls.rotateSpeed = 0.35
    // 地面の下に回り込んで庭が裏返らないよう、真横から約 11° 上で止める
    this.controls.maxPolarAngle = Math.PI / 2 - 0.2

    let camera: Camera = topDown
    this.applyView = () => {
      const is3d = this.view === "3d"
      camera = is3d ? perspective : topDown
      sand.visible = is3d
      sketch.visible = !is3d
      this.controls!.enabled = is3d
      overlay.hidden = is3d
      if (is3d && this.sandDirty) {
        const startedAt = performance.now()
        updateSandMesh(sand, this.rakedField(this.strokes()))
        console.info(`[sekitei] 全面の掻き直し: ${Math.round(performance.now() - startedAt)}ms`)
        this.sandDirty = false
      }
      this.toggleTarget.textContent = is3d ? "下絵を見る" : "仕上がりを見る"
    }
    this.applyView()

    const resize = (): void => {
      const { clientWidth: width, clientHeight: height } = this.element
      if (width === 0 || height === 0) return
      renderer.setSize(width, height)
      perspective.aspect = width / height
      perspective.updateProjectionMatrix()
      this.frustum = topDownFrustum(GARDEN, width / height, TOP_DOWN_MARGIN)
      Object.assign(topDown, this.frustum)
      topDown.updateProjectionMatrix()
      const dpr = window.devicePixelRatio
      overlay.width = Math.round(width * dpr)
      overlay.height = Math.round(height * dpr)
    }
    resize()
    this.resizeObserver = new ResizeObserver(resize)
    this.resizeObserver.observe(this.element)

    const overlayCtx = overlay.getContext("2d")!
    renderer.setAnimationLoop(() => {
      if (this.sketchDirty) {
        redrawSketch(this.strokes())
        this.sketchDirty = false
      }
      this.controls?.update()
      renderer.render(scene, camera)
      if (this.view === "top-down") this.renderOverlay(overlayCtx)
    })
  }

  disconnect(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined

    this.controls?.dispose()
    this.controls = undefined

    if (this.renderer) {
      this.renderer.setAnimationLoop(null)
      this.renderer.dispose()
      this.renderer.domElement.remove()
      this.renderer = undefined
    }

    this.overlay?.remove()
    this.overlay = undefined
    this.drag = undefined

    this.disposables.forEach((resource) => resource.dispose())
    this.disposables = []
    this.applyView = undefined
  }

  toggleView(): void {
    this.view = this.view === "3d" ? "top-down" : "3d"
    this.applyView?.()
  }

  // 目印・ハンドルをつかめばその図形を選んでドラッグを始め、それ以外はクリックした地点で一番上の図形を選ぶ
  private onPointerDown = (event: PointerEvent): void => {
    const point = this.gardenPoint(event)
    if (!point) return
    const picked = this.pickAt(point)
    if (picked) {
      this.selected = picked.index
      this.drag = { ...picked, start: point, original: this.shapes[picked.index] }
      this.overlay!.setPointerCapture(event.pointerId)
      return
    }
    this.selected = hitShape(this.shapes, point, GARDEN)
  }

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.gardenPoint(event)
    if (!point) return
    if (!this.drag) {
      this.overlay!.style.cursor = this.pickAt(point) ? "grab" : "default"
      return
    }
    const { index, grip, start, original } = this.drag
    this.shapes[index] = dragShape(original, grip, start, point)
    this.sketchDirty = true
    this.sandDirty = true
    this.overlay!.style.cursor = "grabbing"
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag) return
    this.drag = undefined
    this.overlay!.releasePointerCapture(event.pointerId)
    this.overlay!.style.cursor = "grab"
  }

  // 選んでいる図形のハンドルと、すべての図形の目印。上の図形の目印ほど後ろに並ぶので、
  // 重なったときは上に描かれた方が選ばれるよう、近さが同じなら後ろを優先する
  private gripsOnScreen(): GripOf[] {
    const handles = this.selected === undefined
      ? []
      : gripsOf(this.shapes[this.selected])
        .filter(({ kind }) => kind !== "move")
        .map((grip) => ({ grip, index: this.selected! }))
    const markers = this.shapes.map((shape, index) => ({ grip: gripsOf(shape)[0], index }))
    return [...handles, ...markers]
  }

  private pickAt(point: Point): GripOf | undefined {
    const tolerance = GRIP_TOLERANCE * this.metersPerPixel()
    const candidates = this.gripsOnScreen()
    const grip = pickGrip(candidates.map(({ grip }) => grip), point, tolerance)
    return candidates.find((candidate) => candidate.grip === grip)
  }

  private renderOverlay(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.element.getBoundingClientRect()
    const dpr = window.devicePixelRatio
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!this.frustum) return
    const viewport = { width, height }
    drawOverlay(ctx, this.gripsOnScreen().map(({ grip, index }) => ({
      grip,
      selected: index === this.selected,
      screen: gardenToScreen(grip.point, viewport, this.frustum!, GARDEN),
    })))
  }

  private gardenPoint(event: PointerEvent): Point | undefined {
    if (!this.frustum) return undefined
    const rect = this.overlay!.getBoundingClientRect()
    return screenToGarden({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect, this.frustum, GARDEN)
  }

  private metersPerPixel(): number {
    const { width } = this.overlay!.getBoundingClientRect()
    return this.frustum ? (this.frustum.right - this.frustum.left) / width : 0
  }

  private strokes(): Stroke[] {
    return this.shapes.flatMap((shape) => shapeToStrokes(shape, GARDEN, CELLS_PER_METER))
  }

  private rakedField(strokes: Stroke[]): SandField {
    const field = new SandField(FIELD.width, FIELD.height)
    for (const { path, style } of strokes) rakeField(field, path, style)
    return field
  }
}
