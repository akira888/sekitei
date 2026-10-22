import { describe, expect, it } from 'vitest'
import { SandField } from './rake'
import { SEAT, seatedField } from './seating'

// 1m = 100 マスの 100 × 100 マスの砂。石の輪郭は 0.4〜0.6m の正方形（40〜60 マス）。余白は 3cm = 3 マス
const square = [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }]
const seated = () => seatedField([square], 100, 100, 100)
const blocked = (field: SandField, x: number, y: number) => field.blocked![y * field.width + x] === 1
const lifted = (field: SandField, x: number, y: number) => field.liftArea![y * field.width + x] === 1

describe('seatedField', () => {
  it('石の輪郭の内側（石の下）には、掻かない印を付ける', () => {
    const field = seated()

    expect(blocked(field, 50, 50)).toBe(true)
    expect(blocked(field, 62, 50)).toBe(false) // 輪郭の外
  })

  it('輪郭から余白までには、歯を持ち上げる印を付ける（歯がここに入ると溝を止める）', () => {
    const field = seated()

    expect(lifted(field, 50, 50)).toBe(true)
    expect(lifted(field, 62, 50)).toBe(true) // 輪郭から 2cm
    expect(lifted(field, 64, 50)).toBe(false) // 輪郭から 4cm
    expect(lifted(field, 10, 10)).toBe(false)
  })

  it('石の根元の砂を盛る。石に近いほど高く、余白の外では平らなまま', () => {
    const field = seated()

    expect(field.at(60, 50)).toBeCloseTo(SEAT.mound)
    expect(field.at(61, 50)).toBeGreaterThan(field.at(62, 50))
    expect(field.at(62, 50)).toBeGreaterThan(0)
    expect(field.at(64, 50)).toBe(0)
  })

  it('石がなければ、平らで掻かない所のない砂', () => {
    const field = seatedField([], 100, 100, 100)

    expect(field.blocked!.every((v) => v === 0)).toBe(true)
    expect(field.liftArea!.every((v) => v === 0)).toBe(true)
    expect(field.h.every((v) => v === 0)).toBe(true)
  })
})
