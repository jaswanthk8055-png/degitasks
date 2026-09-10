import assert from 'node:assert/strict'
import test from 'node:test'
import { getDropdownPosition } from '../src/lib/dropdownPosition.js'

test('opens below the trigger when all options fit', () => {
  const position = getDropdownPosition(
    { top: 100, bottom: 124, left: 200 },
    { width: 192, height: 220 },
    { width: 1024, height: 768 },
  )
  assert.equal(position.top, 128)
  assert.equal(position.left, 200)
  assert.ok(position.maxHeight >= 220)
})

test('last-row status menu flips above and stays inside the right edge', () => {
  const position = getDropdownPosition(
    { top: 710, bottom: 734, left: 920 },
    { width: 192, height: 220 },
    { width: 1024, height: 768 },
  )
  assert.equal(position.top, 486)
  assert.equal(position.left, 824)
  assert.ok(position.top + 220 <= 710)
})

test('long menu uses the larger available side with a scrollable height', () => {
  const position = getDropdownPosition(
    { top: 200, bottom: 224, left: 20 },
    { width: 208, height: 1200 },
    { width: 1024, height: 768 },
  )
  assert.equal(position.top, 228)
  assert.equal(position.maxHeight, 532)
  assert.equal(position.top + position.maxHeight, 760)
})

test('narrow viewport constrains menu width and left edge', () => {
  const position = getDropdownPosition(
    { top: 100, bottom: 124, left: -30 },
    { width: 208, height: 220 },
    { width: 180, height: 400 },
  )
  assert.equal(position.left, 8)
  assert.equal(position.maxWidth, 164)
})

test('zoomed visual viewport includes its offsets', () => {
  const position = getDropdownPosition(
    { top: 540, bottom: 564, left: 480 },
    { width: 192, height: 220 },
    { top: 200, left: 100, width: 400, height: 400 },
  )
  assert.equal(position.top, 316)
  assert.equal(position.left, 300)
})
