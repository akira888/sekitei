import { Controller } from "@hotwired/stimulus"
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { SandField, rakeField } from "../sand/rake"
import { createSandMesh } from "../sand/sand_mesh"
import { shapeToStrokes, type Rake, type Shape } from "../sand/shapes"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const CELLS_PER_METER = FIELD.width / GARDEN.width

// 確認用の砂紋: 横の直線を敷き詰め、その上に同心円を掻く。配列の順番がレイヤー順（後ろほど上）。
// 図形を画面から編集できるようになったら（#7）、ここは保存された scene から読む形に置き換わる
const RAKE: Rake = { tines: 5, spacing: 0.05 }
const DEMO_SHAPES: Shape[] = [
  // 帯の幅 25cm × 8本 = 奥行き 2m なので、庭の中央を通る 8本で庭全体を敷き詰める
  { type: "straight", position: { x: 2, y: 1 }, angle: 0, rows: 8, rake: RAKE },
  { type: "concentric", center: { x: 2.75, y: 1 }, innerRadius: 0.1, rings: 3, rake: RAKE },
]

// Three.js のシーンを要素にマウントする。
// Turbo 遷移で要素が外れたときに WebGL リソースを確実に解放するため、
// 生成と破棄を connect / disconnect に対応させている。
export default class extends Controller<HTMLElement> {
  private renderer?: WebGLRenderer
  private controls?: OrbitControls
  private resizeObserver?: ResizeObserver
  private disposables: { dispose(): void }[] = []

  connect(): void {
    const scene = new Scene()
    scene.background = new Color(0xe8e4da)

    const camera = new PerspectiveCamera(45, 1, 0.05, 100)
    camera.position.set(0, 1.6, 2.6)

    // 砂紋の凹凸は低い光で陰影が出るので、太陽は低めに置く
    scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xfff4e0, 2.5)
    sun.position.set(-3, 1.2, -1.5)
    scene.add(sun)

    const sand = createSandMesh(this.demoField(), GARDEN)
    scene.add(sand)
    this.disposables.push(sand.geometry, sand.material, sand.material.normalMap!)

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    this.element.appendChild(renderer.domElement)
    this.renderer = renderer

    // 凹凸の見え方を確かめるための仮のカメラ操作。鑑賞モードの制限は #12 で決める
    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enableDamping = true
    this.controls.rotateSpeed = 0.35
    // 地面の下に回り込んで庭が裏返らないよう、真横から約 11° 上で止める
    this.controls.maxPolarAngle = Math.PI / 2 - 0.2

    const resize = (): void => {
      const { clientWidth: width, clientHeight: height } = this.element
      if (width === 0 || height === 0) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
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
  }

  private demoField(): SandField {
    const field = new SandField(FIELD.width, FIELD.height)
    for (const shape of DEMO_SHAPES) {
      for (const { path, style } of shapeToStrokes(shape, GARDEN, CELLS_PER_METER)) {
        rakeField(field, path, style)
      }
    }
    return field
  }
}
