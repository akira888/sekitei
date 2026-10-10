import { Controller } from "@hotwired/stimulus"
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"

// Three.js のシーンを要素にマウントする。
// Turbo 遷移で要素が外れたときに WebGL リソースを確実に解放するため、
// 生成と破棄を connect / disconnect に対応させている。
export default class extends Controller<HTMLElement> {
  private renderer?: WebGLRenderer
  private resizeObserver?: ResizeObserver
  private disposables: { dispose(): void }[] = []

  connect(): void {
    const scene = new Scene()
    scene.background = new Color(0xe8e4da)

    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(2.5, 2, 3.5)
    camera.lookAt(0, 0, 0)

    scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xffffff, 2)
    sun.position.set(3, 5, 2)
    scene.add(sun)

    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial({ color: 0x7a7468 })
    const cube = new Mesh(geometry, material)
    scene.add(cube)
    this.disposables.push(geometry, material)

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    this.element.appendChild(renderer.domElement)
    this.renderer = renderer

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

    renderer.setAnimationLoop((time) => {
      cube.rotation.x = time / 2000
      cube.rotation.y = time / 1000
      renderer.render(scene, camera)
    })
  }

  disconnect(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined

    if (this.renderer) {
      this.renderer.setAnimationLoop(null)
      this.renderer.dispose()
      this.renderer.domElement.remove()
      this.renderer = undefined
    }

    this.disposables.forEach((resource) => resource.dispose())
    this.disposables = []
  }
}
