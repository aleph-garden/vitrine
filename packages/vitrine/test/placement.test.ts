import { describe, expect, test } from 'bun:test'
import { placeMenu } from '../src/placement.ts'

const viewport = { width: 400, height: 800 }
const list = { width: 272, height: 200 }

describe('placeMenu', () => {
  test('opens below the button, right edges aligned, when the list fits', () => {
    expect(placeMenu({ top: 100, bottom: 124, right: 380 }, list, viewport)).toEqual({
      top: 128,
      left: 108
    })
  })

  test('opens above when the list does not fit below and there is more room above', () => {
    expect(placeMenu({ top: 700, bottom: 724, right: 380 }, list, viewport)).toEqual({
      top: 496,
      left: 108
    })
  })

  test('stays below when neither side has room and below has more', () => {
    const tall = { width: 272, height: 900 }
    expect(placeMenu({ top: 100, bottom: 124, right: 380 }, tall, viewport).top).toBe(128)
  })

  test('keeps 8px from the left edge and from the top when opening above', () => {
    const wide = { width: 500, height: 200 }
    expect(placeMenu({ top: 150, bottom: 780, right: 300 }, wide, viewport)).toEqual({
      top: 8,
      left: 8
    })
  })
})
