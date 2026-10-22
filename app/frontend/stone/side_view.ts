import {
  Box3,
  type BufferAttribute,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
  type WebGLRenderer,
} from 'three'

const FOV = 30 // [度]
const ELEVATION = (12 * Math.PI) / 180 // 横から少しだけ見下ろす
const MARGIN = 1.15 // 石の周りの余白（石が窓の 1 / 1.15 に収まる）

// 編集パネルの窓に、選んだ石を庭の手前から見た姿で描く（仕上がりの初期の視点と同じ方向）。
// 庭のシーンとは別の小さなシーンに石と砂の地面だけを置き、庭と同じ WebGL の窓の位置だけに描く（scissor）。
// 石の形と材質は庭の石と共有する。砂に沈めた部分は地面で隠し、庭と同じ高さに見せる
export class StoneSideView {
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.01, 50)
  private readonly stone = new Mesh()
  private readonly ground: Mesh<CircleGeometry, MeshBasicMaterial>
  private readonly box = new Box3()

  constructor(background: number) {
    this.scene.background = new Color(background)
    // 庭と同じ光を、同じ向きから当てる
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xfff4e0, 2.5)
    sun.position.set(-3, 1.2, 1.5)
    this.scene.add(sun)

    // 地面は下絵の砂と同じ色にする（光を当てると灰色に沈み、パネルの外の砂と色が合わなかった）
    this.ground = new Mesh(new CircleGeometry(10, 48), new MeshBasicMaterial({ color: 0xd9d2c3 }))
    this.ground.rotation.x = -Math.PI / 2
    this.scene.add(this.ground, this.stone)
  }

  // source は庭に置いた石の Mesh。形を作り直していることがあるので、毎回その時点の形を使う
  render(renderer: WebGLRenderer, frame: HTMLElement, source: Mesh<BufferGeometry, MeshStandardMaterial>): void {
    const canvas = renderer.domElement.getBoundingClientRect()
    const rect = frame.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return // パネルが隠れている

    this.stone.geometry = source.geometry
    this.stone.material = source.material
    this.stone.rotation.y = source.rotation.y
    this.frame(source.geometry, rect.width / rect.height)

    // WebGL の座標は左下が原点
    const x = rect.left - canvas.left
    const y = canvas.bottom - rect.bottom
    renderer.setViewport(x, y, rect.width, rect.height)
    renderer.setScissor(x, y, rect.width, rect.height)
    renderer.setScissorTest(true)
    renderer.render(this.scene, this.camera)
    // 次のフレームの庭の描画が窓の中に切り取られないよう戻す
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, canvas.width, canvas.height)
  }

  // 砂から出ている部分が窓に収まるよう、カメラを石の手前（+z）に置く。向きを変えても収まるよう、横幅は回した後の最大で見る
  private frame(geometry: BufferGeometry, aspect: number): void {
    this.box.setFromBufferAttribute(geometry.attributes.position as BufferAttribute)
    const halfWidth = Math.hypot(Math.max(-this.box.min.x, this.box.max.x), Math.max(-this.box.min.z, this.box.max.z))
    const height = this.box.max.y
    const tan = Math.tan((FOV * Math.PI) / 360)
    const distance = MARGIN * Math.max(height / 2 / tan, halfWidth / (tan * aspect))

    const target = new Vector3(0, height / 2, 0)
    this.camera.aspect = aspect
    this.camera.position.set(0, target.y + distance * Math.sin(ELEVATION), distance * Math.cos(ELEVATION))
    this.camera.lookAt(target)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.ground.geometry.dispose()
    this.ground.material.dispose()
  }
}
