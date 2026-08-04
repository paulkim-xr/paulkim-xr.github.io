import { describe, expect, test } from 'vitest'
import { fitDistance, orthoZoom } from '../../../src/lib/framing'

/** The hub's field of view, and the aspects of a desktop window and a phone. */
const FOV = 50
const DESKTOP = 1000 / 640
const PHONE = 390 / 664

describe('fitDistance', () => {
  test('holds the composed distance when the frame is already wide enough', () => {
    // A landscape window fits the subject at the distance the shot was set up
    // at; moving in to "fit" it would re-frame a composition that was right.
    expect(fitDistance(1.25, FOV, DESKTOP, 3.3)).toBe(3.3)
  })

  test('pulls back on a portrait frame, where width is the tight axis', () => {
    const portrait = fitDistance(1.25, FOV, PHONE, 3.3)

    expect(portrait).toBeGreaterThan(3.3)
    // Far enough that the subject's full width lands inside the frame.
    const halfWidth = portrait * Math.tan((FOV / 2) * (Math.PI / 180)) * PHONE
    expect(halfWidth).toBeGreaterThanOrEqual(1.25)
  })

  test('fits against height once the frame is wider than it is tall', () => {
    // Past square, the vertical field is the tighter one and stays so however
    // wide the window gets — a very wide window must not keep pushing back.
    const wide = fitDistance(1, FOV, 4, 0)
    const wider = fitDistance(1, FOV, 40, 0)

    expect(wider).toBeCloseTo(wide, 10)
  })

  test('a bigger subject needs more room, in proportion', () => {
    expect(fitDistance(2, FOV, PHONE, 0)).toBeCloseTo(fitDistance(1, FOV, PHONE, 0) * 2, 10)
  })

  test.each([
    ['zero aspect', 0],
    ['a canvas with no size yet', Number.NaN],
    ['a negative aspect', -1.5],
  ])('keeps the composed distance for %s', (_label, aspect) => {
    // Before layout the canvas is 0x0. Dividing by that would fling the camera
    // to Infinity and the scene would be gone by the time it had a size.
    expect(fitDistance(1.25, FOV, aspect, 3.3)).toBe(3.3)
  })
})

describe('orthoZoom', () => {
  test('contains the extent on whichever axis is tighter', () => {
    // 390 wide over 9.56 units is 40.8/unit; 664 tall over 7.22 is 92/unit.
    // Width is the constraint, so it sets the zoom.
    const zoom = orthoZoom({ width: 390, height: 664 }, { width: 9.56, height: 7.22 })

    expect(zoom).toBeCloseTo(390 / 9.56, 6)
  })

  test('the whole piece lands inside the viewport on both axes', () => {
    const viewport = { width: 390, height: 664 }
    const extent = { width: 9.56, height: 7.22 }
    const zoom = orthoZoom(viewport, extent)

    expect(extent.width * zoom).toBeLessThanOrEqual(viewport.width + 1e-9)
    expect(extent.height * zoom).toBeLessThanOrEqual(viewport.height + 1e-9)
  })

  test('a margin leaves the piece clear of the edges', () => {
    const full = orthoZoom({ width: 390, height: 664 }, { width: 9.56, height: 7.22 })
    const inset = orthoZoom({ width: 390, height: 664 }, { width: 9.56, height: 7.22 }, 0.92)

    expect(inset).toBeCloseTo(full * 0.92, 6)
  })

  test.each([
    ['an empty viewport', { width: 0, height: 0 }, { width: 9.56, height: 7.22 }],
    ['an empty piece', { width: 390, height: 664 }, { width: 0, height: 0 }],
  ])('falls back to 1 rather than dividing by zero for %s', (_label, viewport, extent) => {
    expect(orthoZoom(viewport, extent)).toBe(1)
  })
})
