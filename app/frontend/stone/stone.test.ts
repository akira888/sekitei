import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { stoneTransform, type Stone } from './stone'

const garden = { width: 4, depth: 2 }
const stone = (overrides: Partial<Stone> = {}): Stone => ({
  type: 'stone', params: { size: 0.4, tallness: 0.6, roughness: 0.5, seed: 1 }, position: { x: 1, y: 0.5 }, rotation: 0, ...overrides,
})

describe('stoneTransform', () => {
  it('庭の座標（左上が原点）を、庭の中心が原点の 3D の位置に直す。庭の y は奥から手前への +z', () => {
    expect(stoneTransform(stone(), garden)).toMatchObject({ x: -1, z: -0.5 })
  })

  it('向きは、真上から見て時計回りに増える（図形の角度と同じ向き）', () => {
    // 石の長い方（x）が、90° 回すと庭の y が増える向き（3D の +z）を向く
    const { rotationY } = stoneTransform(stone({ rotation: 90 }), garden)
    const longAxis = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), rotationY)

    expect(longAxis.x).toBeCloseTo(0)
    expect(longAxis.z).toBeCloseTo(1)
  })
})
