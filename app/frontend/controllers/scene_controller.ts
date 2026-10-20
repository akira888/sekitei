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
import { topDownFrustum } from "../editor/top_down"
import { SandField, rakeField } from "../sand/rake"
import { createSandMesh } from "../sand/sand_mesh"
import { createSketchMesh } from "../sand/sketch_mesh"
import { shapeToStrokes, type Rake, type Shape, type Stroke } from "../sand/shapes"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const CELLS_PER_METER = FIELD.width / GARDEN.width
const TOP_DOWN_MARGIN = 0.1 // 真上から見たときの庭の周りの余白（合わせる辺の 10%）

// 確認用の砂紋: 横の直線を敷き詰め、その上に同心円を掻く。配列の順番がレイヤー順（後ろほど上）。
// 図形を画面から編集できるようになったら（#7）、ここは保存された scene から読む形に置き換わる
const RAKE: Rake = { tines: 5, spacing: 0.05 }
const DEMO_SHAPES: Shape[] = [
  // 帯の幅 25cm × 8本 = 奥行き 2m なので、庭の中央を通る 8本で庭全体を敷き詰める
  { type: "straight", position: { x: 2, y: 1 }, angle: 0, rows: 8, rake: RAKE },
  { type: "concentric", center: { x: 2.75, y: 1 }, innerRadius: 0.1, rings: 3, rake: RAKE },
]

type View = "top-down" | "3d"

// Three.js のシーンを要素にマウントする。
// 編集中は真上から下絵を見せ、仮の切り替えボタンで掻いた後の 3D と見比べる（#7-5 で置き換える）。
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

  connect(): void {
    const scene = new Scene()
    scene.background = new Color(0xe8e4da)

    // 砂紋の凹凸は低い光で陰影が出るので、太陽は低めに置く。
    // 奥から照らす逆光だと溝と山が反転して見えやすいので、初期の視点と同じ手前側に置く
    scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xfff4e0, 2.5)
    sun.position.set(-3, 1.2, 1.5)
    scene.add(sun)

    const strokes = this.demoStrokes()
    const sand = createSandMesh(this.rakedField(strokes), GARDEN)
    const sketch = createSketchMesh(strokes, FIELD, GARDEN)
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
      this.toggleTarget.textContent = is3d ? "下絵を見る" : "仕上がりを見る"
    }
    this.applyView()

    const resize = (): void => {
      const { clientWidth: width, clientHeight: height } = this.element
      if (width === 0 || height === 0) return
      renderer.setSize(width, height)
      perspective.aspect = width / height
      perspective.updateProjectionMatrix()
      Object.assign(topDown, topDownFrustum(GARDEN, width / height, TOP_DOWN_MARGIN))
      topDown.updateProjectionMatrix()
    }
    resize()
    this.resizeObserver = new ResizeObserver(resize)
    this.resizeObserver.observe(this.element)

    renderer.setAnimationLoop(() => {
      this.controls?.update()
      renderer.render(scene, camera)
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

    this.disposables.forEach((resource) => resource.dispose())
    this.disposables = []
    this.applyView = undefined
  }

  toggleView(): void {
    this.view = this.view === "3d" ? "top-down" : "3d"
    this.applyView?.()
  }

  private demoStrokes(): Stroke[] {
    return DEMO_SHAPES.flatMap((shape) => shapeToStrokes(shape, GARDEN, CELLS_PER_METER))
  }

  private rakedField(strokes: Stroke[]): SandField {
    const field = new SandField(FIELD.width, FIELD.height)
    for (const { path, style } of strokes) rakeField(field, path, style)
    return field
  }
}
