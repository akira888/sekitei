import { Controller } from "@hotwired/stimulus"
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { Autosave } from "../editor/autosave"
import { changeSpacing, changeTines, inheritedTines, newShape, removeShape, SPACING, type ShapeKind } from "../editor/edit"
import { dragShape, gripsOf, hitShape, insideGarden, pickGrip, type Grip } from "../editor/grips"
import { drawOverlay, MARKER_RADIUS } from "../editor/overlay"
import { gardenToScreen, screenToGarden, topDownFrustum, type Frustum } from "../editor/top_down"
import { parseScene, toScene } from "../garden/scene"
import { RakePreview } from "../preview/rake_preview"
import type { Point } from "../sand/path"
import { SandField, rakeField } from "../sand/rake"
import { createSandMesh, updateSandMesh } from "../sand/sand_mesh"
import { createSketchMesh } from "../sand/sketch_mesh"
import { shapeToStrokes, type Shape, type Stroke } from "../sand/shapes"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const CELLS_PER_METER = FIELD.width / GARDEN.width
const TOP_DOWN_MARGIN = 0.1 // 真上から見たときの庭の周りの余白（合わせる辺の 10%）
const GRIP_TOLERANCE = MARKER_RADIUS + 4 // 目印・ハンドルをつかめる範囲[px]

// 真上からの下絵（編集する）、斜めから見るプレビュー（掻いていく様子と音）、掻いた後の仕上がり（見るだけ）
type View = "sketch" | "preview" | "finished"
type GripOf = { grip: Grip; index: number } // どの図形のつかみ所か
type Drag = GripOf & { start: Point; original: Shape }
type Placing = { kind: ShapeKind; index?: number } // パレットから運んでいる図形。庭の上にある間だけ index を持つ

// Three.js のシーンを要素にマウントする。
// 図形はページに埋め込まれた scene から読み、操作が終わるたびに同じ URL へ保存する。
// 編集中は真上から下絵を見せ、目印・ハンドルのドラッグで図形を動かす。
// 選んだ図形のレーキは編集パネルで変え、新しい図形はフッターのパレットから運んで置く。
// 右上のボタンで、掻いた後の仕上がりを斜めからの 3D で見る。仕上がりではカメラを回せるが、編集はしない。
// プレビューでは、平らな砂を下のレイヤーから順にレーキが掻いていく様子を、同じ斜めの視点で音と合わせて見せる。
// 真上からでは下絵とほぼ同じ形しか見えずプレビューにならないため、立体感の出る斜めの視点にしている。
// Turbo 遷移で要素が外れたときに WebGL リソースを確実に解放するため、
// 生成と破棄を connect / disconnect に対応させている。
export default class extends Controller<HTMLElement> {
  static targets = ["toggle", "previewButton", "skipButton", "panel", "tines", "spacing", "spacingValue", "palette", "saveError"]
  static values = { scene: Object, url: String }
  declare readonly toggleTarget: HTMLButtonElement
  declare readonly previewButtonTarget: HTMLButtonElement
  declare readonly skipButtonTarget: HTMLButtonElement
  declare readonly panelTarget: HTMLElement
  declare readonly tinesTarget: HTMLOutputElement
  declare readonly spacingTarget: HTMLInputElement
  declare readonly spacingValueTarget: HTMLOutputElement
  declare readonly paletteTarget: HTMLElement
  declare readonly saveErrorTarget: HTMLElement
  declare readonly sceneValue: unknown // 保存されている scene（Rails が埋め込む）
  declare readonly urlValue: string // 保存先

  private renderer?: WebGLRenderer
  private controls?: OrbitControls
  private resizeObserver?: ResizeObserver
  private disposables: { dispose(): void }[] = []
  private view: View = "sketch"
  private applyView?: () => void
  private overlay?: HTMLCanvasElement
  private frustum?: Frustum

  private shapes: Shape[] = []
  private selected?: number
  private drag?: Drag
  private placing?: Placing
  private lastTines = 0 // パレットから置く図形の歯の本数。直前に変えた本数を引き継ぐ
  private autosave?: Autosave
  private rakePreview?: RakePreview
  private audio?: AudioContext // 最初のプレビューで作り、画面を離れるまで使い回す
  private sketchDirty = false // 下絵を描き直す必要がある（ドラッグ中は描画のフレームごとにまとめて描く）
  private sandDirty = false // 仕上がりに切り替えたときに掻き直す必要がある

  connect(): void {
    // 読めない scene なら、ここで止めて編集させない（空の庭として保存し直して上書きしないため）
    this.shapes = parseScene(this.sceneValue).shapes
    this.lastTines = inheritedTines(this.shapes)
    this.autosave = new Autosave(this.sendScene, this.showSaveResult)
    // リロードやタブを閉じたときは disconnect が呼ばれないので、ここで送れていない変更を送る
    window.addEventListener("pagehide", this.flushSave)

    const scene = new Scene()
    scene.background = new Color(0xe8e4da)

    // 砂紋の凹凸は低い光で陰影が出るので、太陽は低めに置く。
    // 奥から照らす逆光だと溝と山が反転して見えやすいので、仕上がりの初期の視点と同じ手前側に置く
    scene.add(new HemisphereLight(0xffffff, 0x8a8170, 1.2))
    const sun = new DirectionalLight(0xfff4e0, 2.5)
    sun.position.set(-3, 1.2, 1.5)
    scene.add(sun)

    const strokes = this.strokes()
    const sand = createSandMesh(this.rakedField(strokes), GARDEN)
    const { mesh: sketch, redraw: redrawSketch } = createSketchMesh(strokes, FIELD, GARDEN)
    scene.add(sand, sketch)
    this.rakePreview = new RakePreview(sand, FIELD, CELLS_PER_METER, this.onPreviewFinish)
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

    // 凹凸を回り込んで確かめるためのカメラ操作。鑑賞モードの制限は #12 で決める
    this.controls = new OrbitControls(perspective, renderer.domElement)
    this.controls.enableDamping = true
    this.controls.rotateSpeed = 0.35
    // 地面の下に回り込んで庭が裏返らないよう、真横から約 11° 上で止める
    this.controls.maxPolarAngle = Math.PI / 2 - 0.2

    let camera: PerspectiveCamera | OrthographicCamera = topDown
    this.applyView = () => {
      const sketching = this.view === "sketch"
      camera = sketching ? topDown : perspective
      this.controls!.enabled = !sketching
      sand.visible = !sketching
      sketch.visible = sketching
      overlay.hidden = !sketching
      this.paletteTarget.hidden = !sketching
      this.syncPanel()
      if (this.view === "finished" && this.sandDirty) {
        const startedAt = performance.now()
        updateSandMesh(sand, this.rakedField(this.strokes()))
        console.info(`[sekitei] 全面の掻き直し: ${Math.round(performance.now() - startedAt)}ms`)
        this.sandDirty = false
      }
      this.previewButtonTarget.hidden = this.view === "preview"
      this.previewButtonTarget.textContent = this.view === "finished" ? "もう一度プレビュー" : "プレビュー"
      this.skipButtonTarget.hidden = this.view !== "preview"
      this.toggleTarget.textContent = sketching ? "仕上がりを見る" : "下絵に戻る"
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
      this.rakePreview?.update()
      this.controls?.update()
      renderer.render(scene, camera)
      if (this.view === "sketch") this.renderOverlay(overlayCtx)
    })
  }

  disconnect(): void {
    // Turbo の遷移でページを離れるとき
    window.removeEventListener("pagehide", this.flushSave)
    this.autosave?.flush()
    this.autosave = undefined

    this.rakePreview?.stop()
    this.rakePreview = undefined
    void this.audio?.close()
    this.audio = undefined

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
    this.placing = undefined

    this.disposables.forEach((resource) => resource.dispose())
    this.disposables = []
    this.applyView = undefined
  }

  increaseTines(): void {
    this.editSelected((shape) => changeTines(shape, 1))
    this.save()
  }

  decreaseTines(): void {
    this.editSelected((shape) => changeTines(shape, -1))
    this.save()
  }

  // スライダーを動かしている間は形だけ変え、保存は離したとき（change）にする
  changeSpacing(): void {
    this.editSelected((shape) => changeSpacing(shape, Number(this.spacingTarget.value)))
  }

  deleteShape(): void {
    if (this.selected === undefined) return
    this.shapes = removeShape(this.shapes, this.selected)
    this.select(undefined)
    this.shapesChanged()
    this.save()
  }

  // 操作が終わるたびに呼ぶ。ドラッグの途中など、操作の途中では呼ばない
  save(): void {
    this.autosave?.save(JSON.stringify({ scene: toScene(this.shapes) }))
  }

  keydown(event: KeyboardEvent): void {
    if (this.view !== "sketch" || (event.key !== "Delete" && event.key !== "Backspace")) return
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return
    event.preventDefault()
    this.deleteShape()
  }

  // パレットの項目をつかむ。ボタンにポインターを捕まえさせ、離すまでの動きをボタンで受ける
  startPlacing(event: PointerEvent): void {
    if (this.view !== "sketch") return
    const button = event.currentTarget as HTMLButtonElement
    this.placing = { kind: button.dataset.kind as ShapeKind }
    button.setPointerCapture(event.pointerId)
    button.addEventListener("pointermove", this.onPlacingMove)
    button.addEventListener("pointerup", this.onPlacingEnd)
    button.addEventListener("pointercancel", this.onPlacingCancel)
  }

  // 庭の上にある間は置く予定の図形を一番上に出してポインターに付いてこさせ、庭の外に出たら引っ込める
  private onPlacingMove = (event: PointerEvent): void => {
    const placing = this.placing
    const point = this.gardenPoint(event)
    if (!placing || !point) return
    if (insideGarden(point, GARDEN)) {
      const shape = newShape(placing.kind, point, this.lastTines)
      if (placing.index === undefined) {
        placing.index = this.shapes.length
        this.shapes = [...this.shapes, shape]
      } else {
        this.shapes[placing.index] = shape
      }
      this.select(placing.index)
    } else if (placing.index !== undefined) {
      this.shapes = removeShape(this.shapes, placing.index)
      placing.index = undefined
      this.select(undefined)
    }
    this.shapesChanged()
  }

  // 庭の上で離せば置いたまま選んだ状態にする。庭の外で離せば何も置かれていない
  private onPlacingEnd = (event: PointerEvent): void => {
    this.onPlacingMove(event)
    if (this.placing?.index !== undefined) this.save()
    this.finishPlacing(event)
  }

  private onPlacingCancel = (event: PointerEvent): void => {
    if (this.placing?.index !== undefined) {
      this.shapes = removeShape(this.shapes, this.placing.index)
      this.select(undefined)
      this.shapesChanged()
    }
    this.finishPlacing(event)
  }

  private finishPlacing(event: PointerEvent): void {
    const button = event.currentTarget as HTMLButtonElement
    button.releasePointerCapture(event.pointerId)
    button.removeEventListener("pointermove", this.onPlacingMove)
    button.removeEventListener("pointerup", this.onPlacingEnd)
    button.removeEventListener("pointercancel", this.onPlacingCancel)
    this.placing = undefined
  }

  // 下絵からは仕上がりへ、それ以外からは下絵へ戻る。プレビューの途中で戻ると、砂は掻いた途中のまま残る
  // （sandDirty のままなので、次に仕上がりを見るときに全面を掻き直す）
  toggleView(): void {
    if (this.view === "preview") this.rakePreview?.stop()
    this.view = this.view === "sketch" ? "finished" : "sketch"
    this.applyView?.()
  }

  // AudioContext はクリックの中で作る・再開する（ブラウザの自動再生の制限のため）
  startPreview(): void {
    if (!this.rakePreview) return
    this.audio ??= new AudioContext()
    void this.audio.resume()
    this.rakePreview.start(this.strokes(), this.audio)
    this.sandDirty = true // 終わるまで砂は掻いている途中
    this.view = "preview"
    this.applyView?.()
  }

  skipPreview(): void {
    this.rakePreview?.skip()
  }

  // 最後まで掻き終えたら（飛ばしたときも）、仕上がりの画面に留まる
  private onPreviewFinish = (): void => {
    this.sandDirty = false
    this.view = "finished"
    this.applyView?.()
  }

  // 目印・ハンドルをつかめばその図形を選んでドラッグを始め、それ以外はクリックした地点で一番上の図形を選ぶ
  private onPointerDown = (event: PointerEvent): void => {
    const point = this.gardenPoint(event)
    if (!point) return
    const picked = this.pickAt(point)
    if (picked) {
      this.select(picked.index)
      this.drag = { ...picked, start: point, original: this.shapes[picked.index] }
      this.overlay!.setPointerCapture(event.pointerId)
      return
    }
    this.select(hitShape(this.shapes, point, GARDEN))
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
    this.shapesChanged()
    this.overlay!.style.cursor = "grabbing"
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag) return
    const { index, original } = this.drag
    if (this.shapes[index] !== original) this.save() // つかんだだけで動かしていなければ送らない
    this.drag = undefined
    this.overlay!.releasePointerCapture(event.pointerId)
    this.overlay!.style.cursor = "grab"
  }

  private sendScene = async (body: string): Promise<void> => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ""
    // keepalive: ページを離れた後も送信を続けさせる（リロードの直前の保存を落とさないため）
    const response = await fetch(this.urlValue, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": token },
      body,
      keepalive: true,
    })
    if (!response.ok) throw new Error(`保存に失敗しました（${response.status}）`)
  }

  // 保存に失敗したときだけ知らせる。次に保存できたら消す
  private showSaveResult = (saved: boolean): void => {
    if (!this.element.isConnected) return // ページを離れた後に返事が来たとき
    this.saveErrorTarget.hidden = saved
  }

  private flushSave = (): void => {
    this.autosave?.flush()
  }

  private select(index: number | undefined): void {
    this.selected = index
    this.syncPanel()
  }

  private editSelected(edit: (shape: Shape) => Shape): void {
    if (this.selected === undefined) return
    const before = this.shapes[this.selected]
    const after = edit(before)
    this.shapes[this.selected] = after
    if (after.rake.tines !== before.rake.tines) this.lastTines = after.rake.tines
    this.syncPanel()
    this.shapesChanged()
  }

  private shapesChanged(): void {
    this.sketchDirty = true
    this.sandDirty = true
  }

  // パネルは図形を選んでいる間だけ、真上からの画面で開く。中身は選んだ図形のレーキに合わせる
  private syncPanel(): void {
    const shape = this.selected === undefined ? undefined : this.shapes[this.selected]
    this.panelTarget.hidden = !shape || this.view !== "sketch"
    if (!shape) return
    // 単位を出すと庭の実寸の感覚とずれるので、数字だけを見せる（間隔は cm の値）
    this.tinesTarget.value = String(shape.rake.tines)
    Object.assign(this.spacingTarget, { min: SPACING.min, max: SPACING.max, step: SPACING.step })
    this.spacingTarget.value = String(shape.rake.spacing)
    this.spacingValueTarget.value = (shape.rake.spacing * 100).toFixed(1)
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
