import { Controller } from "@hotwired/stimulus"
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { Autosave } from "../editor/autosave"
import { changeSpacing, changeTines, inheritedTines, newShape, removeShape, SPACING, type ShapeKind } from "../editor/edit"
import { dragShape, gripsOf, hitShape, insideGarden, pickGrip, type Grip } from "../editor/grips"
import { drawOverlay, MARKER_RADIUS } from "../editor/overlay"
import { changeStoneParam, dragStone, hitStone, newStone, reshapeStone, STONE, stoneGrips, type StoneParam } from "../editor/stones"
import { gardenToScreen, screenToGarden, topDownFrustum, type Frustum } from "../editor/top_down"
import { parseScene, toScene, type Gravel } from "../garden/scene"
import { createGardenFrame } from "../gravel/frame_mesh"
import { FRAME_WIDTH } from "../gravel/scatter"
import { RakePreview } from "../preview/rake_preview"
import type { Point } from "../sand/path"
import { SandField, rakeField } from "../sand/rake"
import { createSandMesh, updateSandMesh } from "../sand/sand_mesh"
import { SEAT, seatedField } from "../sand/seating"
import type { SketchStones } from "../sand/sketch"
import { createSketchMesh } from "../sand/sketch_mesh"
import { shapeToStrokes, type Shape, type Stroke } from "../sand/shapes"
import { stoneFootprint } from "../stone/footprint"
import { StoneSideView } from "../stone/side_view"
import type { Stone } from "../stone/stone"
import { StoneLayer } from "../stone/stone_mesh"

// 庭の実寸[m] とハイトマップの解像度（1マス ≒ 4mm）。#5 時点の仮の値
const GARDEN = { width: 4, depth: 2 }
const FIELD = { width: 1024, height: 512 }
const CELLS_PER_METER = FIELD.width / GARDEN.width
const TOP_DOWN_MARGIN = 0.1 // 真上から見たときの庭の周りの余白（合わせる辺の 10%）
const TOP_BAR_GAP = 4 // 上の帯（パレット・操作ボタン）と庭の間[px]。庭の余白とは別に空ける
const GRIP_TOLERANCE = MARKER_RADIUS + 4 // 目印・ハンドルをつかめる範囲[px]

// 真上からの下絵（編集する）、斜めから見るプレビュー（掻いていく様子と音）、掻いた後の仕上がり（見るだけ）
type View = "sketch" | "preview" | "finished"
// 選んでいるもの。砂紋の図形（shapes）と石（stones）は別の配列なので、どちらの何番目かで持つ
type Selection = { layer: "shape" | "stone"; index: number }
type GripOf = { grip: Grip; target: Selection } // どの図形・石のつかみ所か
type Drag = GripOf & { start: Point; original: Shape | Stone }
// パレットから運んでいる図形・石。庭の上にある間だけ index を持つ。石の seed は運び始めに決める
type Placing = { kind: ShapeKind | "stone"; seed: number; index?: number }

const sameSelection = (a?: Selection, b?: Selection) => a?.layer === b?.layer && a?.index === b?.index
const randomSeed = () => Math.floor(Math.random() * 2 ** 31) // 石の形のくじ。保存するので整数にする

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
  static targets = [
    "toggle", "previewButton", "skipButton", "panel", "tines", "spacing", "spacingValue", "palette", "saveError",
    "stonePanel", "stoneView", "stoneParam", "stoneParamValue", "gravelToggle",
  ]
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
  declare readonly stonePanelTarget: HTMLElement
  declare readonly stoneViewTarget: HTMLElement // 選んだ石を横から見せる窓
  declare readonly stoneParamTargets: HTMLInputElement[] // data-param で大きさ・背の高さ・ゴツゴツ度を区別する
  declare readonly stoneParamValueTargets: HTMLOutputElement[]
  declare readonly gravelToggleTarget: HTMLButtonElement
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
  private fitTopDown?: () => void

  private shapes: Shape[] = []
  private stones: Stone[] = []
  private gravel: Gravel = { edge: false }
  private gravelEdge?: { visible: boolean }
  private selected?: Selection
  private drag?: Drag
  private placing?: Placing
  private lastTines = 0 // パレットから置く図形の歯の本数。直前に変えた本数を引き継ぐ
  private autosave?: Autosave
  private rakePreview?: RakePreview
  private audio?: AudioContext // 最初のプレビューで作り、画面を離れるまで使い回す
  private sketchDirty = false // 下絵を描き直す必要がある（ドラッグ中は描画のフレームごとにまとめて描く）
  private sandDirty = false // 仕上がりに切り替えたときに掻き直す必要がある
  private stonesDirty = false // 石の Mesh を置き直す必要がある（スライダーの途中は描画のフレームごとにまとめて作り直す）
  private stoneLayer?: StoneLayer
  private outlines?: Point[][] // 石ごとの砂の高さでの輪郭[m]。石が変わったら作り直す（stonesChanged）
  private sideView?: StoneSideView

  connect(): void {
    // 読めない scene なら、ここで止めて編集させない（空の庭として保存し直して上書きしないため）
    const saved = parseScene(this.sceneValue)
    this.shapes = saved.shapes
    this.stones = saved.stones
    this.gravel = saved.gravel
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
    // 石の影を砂に落とす。影を写す範囲は庭全体（太陽から見た向きで庭が収まる大きさ）
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.1, far: 10 })
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.01
    scene.add(sun)

    const strokes = this.strokes()
    const sand = createSandMesh(this.rakedField(strokes), GARDEN)
    const { mesh: sketch, redraw: redrawSketch } = createSketchMesh(strokes, this.sketchStones(), FIELD, GARDEN)
    sand.receiveShadow = true
    scene.add(sand, sketch)

    // 石は砂紋のレイヤーによらず常に砂の上にあり、下絵（真上から）・プレビュー・仕上がりのどれでも見せる
    const stoneLayer = new StoneLayer(GARDEN)
    stoneLayer.sync(this.stones)
    scene.add(stoneLayer.group)
    this.stoneLayer = stoneLayer
    this.sideView = new StoneSideView(0xf7f5f0)

    // 庭の外周の枠。砂のすぐ外の縁石は常に置き、その外の砂利の溝はパレットの横のボタンで敷く・外すを切り替える
    const frame = createGardenFrame(GARDEN)
    scene.add(frame.group)
    this.disposables.push(frame)
    this.gravelEdge = frame.gravel
    this.syncGravel()
    this.rakePreview = new RakePreview(sand, CELLS_PER_METER, this.onPreviewFinish)
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
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
      // パレットが隠れている間は帯の高さを測れないので、下絵に戻るたびに合わせ直す
      if (sketching) this.fitTopDown?.()
    }
    this.applyView()

    // 真上から見るときは、上の帯（パレット）の下に庭を収める。帯に庭が重なると、
    // パレットを押しただけで帯の下に図形・石が置かれ、選べなくなるため（設計メモ §17）
    this.fitTopDown = (): void => {
      const { clientWidth: width, clientHeight: height } = this.element
      if (width === 0 || height === 0 || this.paletteTarget.hidden) return
      const top = this.paletteTarget.getBoundingClientRect().bottom - this.element.getBoundingClientRect().top + TOP_BAR_GAP
      // 砂利の縁を敷いていなくても、一番外の縁石までの大きさで収める（切り替えのたびに庭の大きさが変わらないように）
      const framed = { width: GARDEN.width + 2 * FRAME_WIDTH, depth: GARDEN.depth + 2 * FRAME_WIDTH }
      this.frustum = topDownFrustum(framed, { width, height }, TOP_DOWN_MARGIN, { top })
      Object.assign(topDown, this.frustum)
      topDown.updateProjectionMatrix()
    }

    const resize = (): void => {
      const { clientWidth: width, clientHeight: height } = this.element
      if (width === 0 || height === 0) return
      renderer.setSize(width, height)
      perspective.aspect = width / height
      perspective.updateProjectionMatrix()
      this.fitTopDown?.()
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
        redrawSketch(this.strokes(), this.sketchStones())
        this.sketchDirty = false
      }
      if (this.stonesDirty) {
        stoneLayer.sync(this.stones)
        this.stonesDirty = false
      }
      this.rakePreview?.update()
      this.controls?.update()
      renderer.render(scene, camera)
      if (this.view === "sketch") {
        this.renderOverlay(overlayCtx)
        const stone = this.selected?.layer === "stone" ? stoneLayer.meshAt(this.selected.index) : undefined
        if (stone) this.sideView?.render(renderer, this.stoneViewTarget, stone)
      }
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

    this.stoneLayer?.dispose()
    this.stoneLayer = undefined
    this.sideView?.dispose()
    this.sideView = undefined
    this.disposables.forEach((resource) => resource.dispose())
    this.disposables = []
    this.applyView = undefined
    this.fitTopDown = undefined
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

  deleteSelected(): void {
    const selected = this.selected
    if (!selected) return
    if (selected.layer === "shape") {
      this.shapes = removeShape(this.shapes, selected.index)
      this.shapesChanged()
    } else {
      this.stones = this.stones.filter((_, i) => i !== selected.index)
      this.stonesChanged()
    }
    this.select(undefined)
    this.save()
  }

  // スライダーを動かしている間は形だけ変え、保存は離したとき（change）にする
  changeStoneParam(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    this.editSelectedStone((stone) => changeStoneParam(stone, input.dataset.param as StoneParam, Number(input.value)))
  }

  toggleGravel(): void {
    this.gravel = { edge: !this.gravel.edge }
    this.syncGravel()
    this.save()
  }

  reshapeStone(): void {
    this.editSelectedStone((stone) => reshapeStone(stone, randomSeed()))
    this.save()
  }

  // 操作が終わるたびに呼ぶ。ドラッグの途中など、操作の途中では呼ばない
  save(): void {
    this.autosave?.save(JSON.stringify({ scene: toScene(this.shapes, this.stones, this.gravel) }))
  }

  keydown(event: KeyboardEvent): void {
    if (this.view !== "sketch" || (event.key !== "Delete" && event.key !== "Backspace")) return
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return
    event.preventDefault()
    this.deleteSelected()
  }

  // パレットの項目をつかむ。ボタンにポインターを捕まえさせ、離すまでの動きをボタンで受ける
  startPlacing(event: PointerEvent): void {
    if (this.view !== "sketch") return
    const button = event.currentTarget as HTMLButtonElement
    this.placing = { kind: button.dataset.kind as Placing["kind"], seed: randomSeed() }
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
    const layer = placing.kind === "stone" ? "stone" : "shape"
    if (insideGarden(point, GARDEN)) {
      if (placing.kind === "stone") {
        const stone = newStone(point, placing.seed)
        placing.index ??= this.stones.push(stone) - 1
        this.stones[placing.index] = stone
      } else {
        const shape = newShape(placing.kind, point, this.lastTines)
        placing.index ??= this.shapes.push(shape) - 1
        this.shapes[placing.index] = shape
      }
      this.select({ layer, index: placing.index })
    } else if (placing.index !== undefined) {
      this.removePlaced(placing)
    }
    this.layerChanged(layer)
  }

  // 庭の上で離せば置いたまま選んだ状態にする。庭の外で離せば何も置かれていない
  private onPlacingEnd = (event: PointerEvent): void => {
    this.onPlacingMove(event)
    if (this.placing?.index !== undefined) this.save()
    this.finishPlacing(event)
  }

  private onPlacingCancel = (event: PointerEvent): void => {
    const placing = this.placing
    if (placing?.index !== undefined) {
      this.removePlaced(placing)
      this.layerChanged(placing.kind === "stone" ? "stone" : "shape")
    }
    this.finishPlacing(event)
  }

  // 運んでいる途中で庭の外に出たとき・取り消したときに、仮に置いた図形・石を引っ込める
  private removePlaced(placing: Placing): void {
    if (placing.index === undefined) return
    const index = placing.index
    if (placing.kind === "stone") this.stones = this.stones.filter((_, i) => i !== index)
    else this.shapes = removeShape(this.shapes, index)
    placing.index = undefined
    this.select(undefined)
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
    this.rakePreview.start(this.strokesByShape(), this.seatedSand(), this.audio)
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
      this.select(picked.target)
      this.drag = { ...picked, start: point, original: this.itemOf(picked.target) }
      this.overlay!.setPointerCapture(event.pointerId)
      return
    }
    this.select(this.hitAt(point))
  }

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.gardenPoint(event)
    if (!point) return
    if (!this.drag) {
      this.overlay!.style.cursor = this.pickAt(point) ? "grab" : "default"
      return
    }
    const { target, grip, start, original } = this.drag
    if (target.layer === "stone") {
      this.stones[target.index] = dragStone(original as Stone, grip, start, point)
      this.stonesChanged()
    } else {
      this.shapes[target.index] = dragShape(original as Shape, grip, start, point)
      this.shapesChanged()
    }
    this.overlay!.style.cursor = "grabbing"
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag) return
    const { target, original } = this.drag
    if (this.itemOf(target) !== original) this.save() // つかんだだけで動かしていなければ送らない
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

  private select(selection: Selection | undefined): void {
    this.selected = selection
    this.syncPanel()
  }

  private itemOf({ layer, index }: Selection): Shape | Stone {
    return layer === "stone" ? this.stones[index] : this.shapes[index]
  }

  // 石は常に砂の上にあるので、帯より先に石を当てる
  private hitAt(point: Point): Selection | undefined {
    const stone = hitStone(this.stones, point)
    if (stone !== undefined) return { layer: "stone", index: stone }
    const shape = hitShape(this.shapes, point, GARDEN)
    return shape === undefined ? undefined : { layer: "shape", index: shape }
  }

  private editSelectedStone(edit: (stone: Stone) => Stone): void {
    if (this.selected?.layer !== "stone") return
    this.stones[this.selected.index] = edit(this.stones[this.selected.index])
    this.syncPanel()
    this.stonesChanged()
  }

  private editSelected(edit: (shape: Shape) => Shape): void {
    if (this.selected?.layer !== "shape") return
    const index = this.selected.index
    const before = this.shapes[index]
    const after = edit(before)
    this.shapes[index] = after
    if (after.rake.tines !== before.rake.tines) this.lastTines = after.rake.tines
    this.syncPanel()
    this.shapesChanged()
  }

  private shapesChanged(): void {
    this.sketchDirty = true
    this.sandDirty = true
  }

  // 石の周りは掻かずに残し根元に砂を盛るので、石を変えたら下絵も砂も描き直す
  private stonesChanged(): void {
    this.stonesDirty = true
    this.outlines = undefined
    this.sketchDirty = true
    this.sandDirty = true
  }

  private stoneOutlines(): Point[][] {
    return (this.outlines ??= this.stones.map(stoneFootprint))
  }

  // 掻く前の砂。石の輪郭から余白までは掻かずに残し、根元の砂を盛る
  private seatedSand(): SandField {
    return seatedField(this.stoneOutlines(), FIELD.width, FIELD.height, CELLS_PER_METER)
  }

  // 下絵は Canvas の 1px = 1マスで描くので、輪郭と余白をマスに直す
  private sketchStones(): SketchStones {
    return {
      outlines: this.stoneOutlines().map((outline) => outline.map(({ x, y }) => ({ x: x * CELLS_PER_METER, y: y * CELLS_PER_METER }))),
      margin: SEAT.margin * CELLS_PER_METER,
    }
  }

  private layerChanged(layer: Selection["layer"]): void {
    if (layer === "stone") this.stonesChanged()
    else this.shapesChanged()
  }

  // パネルは図形を選んでいる間だけ、真上からの画面で開く。中身は選んだ図形のレーキに合わせる
  private syncPanel(): void {
    const sketching = this.view === "sketch"
    const stone = this.selected?.layer === "stone" ? this.stones[this.selected.index] : undefined
    this.stonePanelTarget.hidden = !stone || !sketching
    if (stone) this.syncStonePanel(stone)

    const shape = this.selected?.layer === "shape" ? this.shapes[this.selected.index] : undefined
    this.panelTarget.hidden = !shape || !sketching
    if (!shape) return
    // 単位を出すと庭の実寸の感覚とずれるので、数字だけを見せる（間隔は cm の値）
    this.tinesTarget.value = String(shape.rake.tines)
    Object.assign(this.spacingTarget, { min: SPACING.min, max: SPACING.max, step: SPACING.step })
    this.spacingTarget.value = String(shape.rake.spacing)
    this.spacingValueTarget.value = (shape.rake.spacing * 100).toFixed(1)
  }

  private syncGravel(): void {
    if (this.gravelEdge) this.gravelEdge.visible = this.gravel.edge
    this.gravelToggleTarget.setAttribute("aria-pressed", String(this.gravel.edge))
  }

  // スライダーは図形と同じく単位なしで、値をそのまま見せる
  private syncStonePanel(stone: Stone): void {
    for (const input of this.stoneParamTargets) {
      const param = input.dataset.param as StoneParam
      Object.assign(input, { min: STONE[param].min, max: STONE[param].max, step: STONE[param].step })
      input.value = String(stone.params[param])
    }
    for (const output of this.stoneParamValueTargets) {
      output.value = stone.params[output.dataset.param as StoneParam].toFixed(2)
    }
  }

  // 選んでいる図形のハンドルと、すべての図形の目印。上の図形の目印ほど後ろに並ぶので、
  // 重なったときは上に描かれた方が選ばれるよう、近さが同じなら後ろを優先する
  private gripsOnScreen(): GripOf[] {
    const selected = this.selected
    const handles = selected
      ? this.gripsOfItem(selected)
        .filter(({ kind }) => kind !== "move")
        .map((grip) => ({ grip, target: selected }))
      : []
    // 石は常に砂の上にあるので、石の目印を図形の後ろに並べて、重なったときは石を選ぶ
    const markers = [
      ...this.shapes.map((shape, index) => ({ grip: gripsOf(shape)[0], target: { layer: "shape" as const, index } })),
      ...this.stones.map((stone, index) => ({ grip: stoneGrips(stone)[0], target: { layer: "stone" as const, index } })),
    ]
    return [...handles, ...markers]
  }

  private gripsOfItem(selection: Selection): Grip[] {
    return selection.layer === "stone" ? stoneGrips(this.stones[selection.index]) : gripsOf(this.shapes[selection.index])
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
    drawOverlay(ctx, this.gripsOnScreen().map(({ grip, target }) => ({
      grip,
      selected: sameSelection(target, this.selected),
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
    return this.strokesByShape().flat()
  }

  // 図形ごとのストローク。プレビューは、重ならない図形をまとめて同時に掻くために図形の区切りを使う
  private strokesByShape(): Stroke[][] {
    return this.shapes.map((shape) => shapeToStrokes(shape, GARDEN, CELLS_PER_METER))
  }

  private rakedField(strokes: Stroke[]): SandField {
    const field = this.seatedSand()
    for (const { path, style } of strokes) rakeField(field, path, style)
    return field
  }
}
