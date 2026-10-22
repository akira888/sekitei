import { describe, expect, it } from 'vitest'
import { changeSpacing, changeTines, inheritedTines, newShape, removeShape } from './edit'
import type { ConcentricShape, Shape, StraightShape } from '../sand/shapes'

const straight = (tines = 5, spacing = 0.05): StraightShape => ({
  type: 'straight', position: { x: 2, y: 1 }, angle: 30, rows: 4, rake: { tines, spacing },
})

describe('changeTines', () => {
  it('歯の本数を増減し、帯の本数・位置・向きは変えない', () => {
    expect(changeTines(straight(), 1)).toEqual({ ...straight(), rake: { tines: 6, spacing: 0.05 } })
    expect(changeTines(straight(), -1).rake.tines).toBe(4)
  })

  it('2〜10本の範囲に収める', () => {
    expect(changeTines(straight(2), -1).rake.tines).toBe(2)
    expect(changeTines(straight(10), 1).rake.tines).toBe(10)
  })

  it('元の図形は書き換えない', () => {
    const shape = straight()
    changeTines(shape, 1)

    expect(shape.rake.tines).toBe(5)
  })
})

describe('changeSpacing', () => {
  it('歯の間隔を 0.5cm 刻みに丸めて変える', () => {
    expect(changeSpacing(straight(), 0.0712).rake.spacing).toBeCloseTo(0.07)
    expect(changeSpacing(straight(), 0.0738).rake.spacing).toBeCloseTo(0.075)
  })

  it('3〜10cm の範囲に収める', () => {
    expect(changeSpacing(straight(), 0.01).rake.spacing).toBeCloseTo(0.03)
    expect(changeSpacing(straight(), 0.2).rake.spacing).toBeCloseTo(0.1)
  })
})

describe('newShape', () => {
  const at = { x: 1.2, y: 0.8 }

  it('直線は、置いた点を通る角度 0° の帯 1本で、間隔は 5cm', () => {
    expect(newShape('straight', at, 7)).toEqual({
      type: 'straight', position: at, angle: 0, rows: 1, rake: { tines: 7, spacing: 0.05 },
    })
  })

  it('同心円は、置いた点を中心に内側の余白 10cm・輪 3つで、間隔は 5cm', () => {
    expect(newShape('concentric', at, 4)).toEqual({
      type: 'concentric', center: at, innerRadius: 0.1, rings: 3, rake: { tines: 4, spacing: 0.05 },
    } satisfies ConcentricShape)
  })

  it('置いた点を後から動かしても、図形の位置は変わらない', () => {
    const point = { x: 1, y: 1 }
    const shape = newShape('straight', point, 5) as StraightShape
    point.x = 3

    expect(shape.position.x).toBe(1)
  })
})

describe('removeShape', () => {
  it('指定した番号の図形を除き、残りの順番（レイヤー順）は保つ', () => {
    const shapes: Shape[] = [straight(2), straight(3), straight(4)]

    expect(removeShape(shapes, 1).map(({ rake }) => rake.tines)).toEqual([2, 4])
    expect(shapes).toHaveLength(3)
  })
})

describe('inheritedTines', () => {
  it('開き直した庭では、一番上（最後に置いた）図形の歯の本数を引き継ぐ', () => {
    expect(inheritedTines([straight(3), straight(7)])).toBe(7)
  })

  it('図形のない庭では 5本から始める', () => {
    expect(inheritedTines([])).toBe(5)
  })
})
