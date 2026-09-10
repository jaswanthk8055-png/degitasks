import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Dropdown, { DropdownItem } from '../src/components/ui/Dropdown'

let anchorRect
let contentHeight
let resizeObservers
let measureAnchor

// jsdom does not lay out elements. Supply geometry only; all event handling,
// portal rendering, positioning, selection, and dismissal use the real component.
beforeEach(() => {
  anchorRect = { top: 200, bottom: 224, left: 100, right: 260, width: 160, height: 24 }
  contentHeight = 220
  resizeObservers = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) {
      this.callback = callback
      this.observe = vi.fn()
      this.disconnect = vi.fn()
      resizeObservers.push(this)
    }
  })
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('innerHeight', 768)
  vi.stubGlobal('visualViewport', undefined)
  measureAnchor = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ ...anchorRect, x: anchorRect.left, y: anchorRect.top, toJSON() {} }))
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(102)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function DropdownHarness({ onClose = () => {}, onSelect = () => {}, optionCount = 5 }) {
  const anchorRef = useRef(null)
  const [open, setOpen] = useState(false)
  const close = () => {
    onClose()
    setOpen(false)
  }
  return (
    <>
      <button ref={anchorRef} onClick={() => setOpen((value) => !value)}>Change status</button>
      <div data-testid="outside-scroll"><div>Board content</div></div>
      <Dropdown open={open} onClose={close} anchorRef={anchorRef}>
        <div data-testid="option-list">
          {Array.from({ length: optionCount }, (_, index) => (
            <DropdownItem key={index} onClick={() => { onSelect(index); close() }}>
              {`Status ${index + 1}`}
            </DropdownItem>
          ))}
        </div>
      </Dropdown>
    </>
  )
}

function openMenu(props) {
  const rendered = render(<DropdownHarness {...props} />)
  const trigger = screen.getByRole('button', { name: 'Change status' })
  fireEvent.click(trigger)
  const options = screen.getByTestId('option-list')
  return { ...rendered, trigger, options, menu: options.parentElement }
}

describe('Dropdown interaction and viewport behavior', () => {
  it('keeps internal and nested scrolling open', () => {
    const onClose = vi.fn()
    const { menu, options } = openMenu({ onClose })
    fireEvent.scroll(menu, { target: { scrollTop: 40 } })
    fireEvent.scroll(options, { target: { scrollTop: 20 } })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Status 5' })).toBeTruthy()
  })

  it('closes when the surrounding table scrolls', () => {
    const onClose = vi.fn()
    openMenu({ onClose })
    fireEvent.scroll(screen.getByTestId('outside-scroll'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('option-list')).toBeNull()
  })

  it('closes with Escape and returns focus to the trigger', () => {
    const onClose = vi.fn()
    const { trigger } = openMenu({ onClose })
    const option = screen.getByRole('button', { name: 'Status 5' })
    option.focus()
    expect(document.activeElement).toBe(option)
    fireEvent.keyDown(option, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('option-list')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps the final option of a long list selectable after scrolling', () => {
    contentHeight = 1600
    const onClose = vi.fn()
    const onSelect = vi.fn()
    const { menu } = openMenu({ onClose, onSelect, optionCount: 40 })
    expect(menu.style.overflowY).toBe('auto')
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThan(contentHeight)
    fireEvent.scroll(menu, { target: { scrollTop: 1500 } })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Status 40' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(39)
    expect(screen.queryByTestId('option-list')).toBeNull()
  })

  it('opens a last-row menu above the trigger and inside the right edge', () => {
    anchorRect = { ...anchorRect, top: 710, bottom: 734, left: 920 }
    const { menu, container } = openMenu()
    expect(container.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.visibility).toBe('visible')
    expect(Number.parseFloat(menu.style.top) + contentHeight + 2).toBeLessThan(anchorRect.top)
    expect(Number.parseFloat(menu.style.left) + 192).toBeLessThan(window.innerWidth)
  })

  it('remeasures and repositions when the window is resized', () => {
    const { menu } = openMenu()
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThan(anchorRect.bottom)
    const initialMeasurements = measureAnchor.mock.calls.length
    vi.stubGlobal('innerWidth', 360)
    vi.stubGlobal('innerHeight', 480)
    anchorRect = { ...anchorRect, top: 420, bottom: 444, left: 330 }
    fireEvent(window, new Event('resize'))
    expect(measureAnchor.mock.calls.length).toBeGreaterThan(initialMeasurements)
    expect(Number.parseFloat(menu.style.top) + contentHeight + 2).toBeLessThan(anchorRect.top)
    expect(Number.parseFloat(menu.style.left) + 192).toBeLessThan(window.innerWidth)
    expect(menu.style.maxWidth).toBe('344px')
  })

  it('remeasures changed menu content and disconnects the observer on close', () => {
    anchorRect = { ...anchorRect, top: 500, bottom: 524 }
    contentHeight = 100
    const { menu } = openMenu()
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThan(anchorRect.bottom)
    expect(resizeObservers).toHaveLength(1)
    const observer = resizeObservers[0]
    expect(observer.observe).toHaveBeenCalledTimes(2)
    contentHeight = 1600
    observer.callback()
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(anchorRect.top)
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThan(contentHeight)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('ignores mouse-down inside the menu or trigger but closes on outside mouse-down', () => {
    const onClose = vi.fn()
    const { trigger, options } = openMenu({ onClose })
    fireEvent.mouseDown(options)
    fireEvent.mouseDown(trigger)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('option-list')).toBeNull()
  })

  it('preserves unanchored inline dropdown rendering', () => {
    const { container } = render(
      <Dropdown open onClose={() => {}}><DropdownItem>Inline option</DropdownItem></Dropdown>,
    )
    const menu = screen.getByRole('button', { name: 'Inline option' }).parentElement
    expect(container.contains(menu)).toBe(true)
    expect(menu.className).toContain('absolute')
    expect(menu.style.position).toBe('')
  })
})
