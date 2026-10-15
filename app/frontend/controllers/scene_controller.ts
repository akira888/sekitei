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
import type { Point } from "../sand/path"
import { SandField, rakeField, type RakeStyle } from "../sand/rake"
import { createSandMesh } from "../sand/sand_mesh"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const RAKE: RakeStyle = { tines: 5, spacing: 12, depth: 1.5, grooveWidth: 5, pileWidth: 7 }

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

  // 確認用の砂紋: 横の直線を敷き詰め、その上に同心円を掻く。#6 の図形 → パス変換ができたら差し替える
  private demoField(): SandField {
    const field = new SandField(FIELD.width, FIELD.height)
    const band = RAKE.tines * RAKE.spacing
    for (let y = band / 2; y < FIELD.height; y += band) {
      rakeField(field, line({ x: 0, y }, { x: FIELD.width, y }), RAKE)
    }
    for (const radius of [60, 60 + band, 60 + band * 2]) {
      rakeField(field, circle({ x: 700, y: 256 }, radius), RAKE)
    }
    return field
  }
}

const STEP = 2 // パスの点の間隔[マス]

function line(from: Point, to: Point): Point[] {
  const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP)
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / n,
    y: from.y + ((to.y - from.y) * i) / n,
  }))
}

function circle(center: Point, radius: number): Point[] {
  const n = Math.ceil((2 * Math.PI * radius) / STEP)
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: center.x + radius * Math.cos((2 * Math.PI * i) / n),
    y: center.y + radius * Math.sin((2 * Math.PI * i) / n),
  }))
}
