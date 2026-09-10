const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Coordinates use the layout viewport, matching getBoundingClientRect() and
// fixed positioning. Visual viewport offsets also keep zoomed menus in view.
export function getDropdownPosition(anchor, menu, viewport, margin = 8, gap = 4) {
  const viewportTop = viewport.top ?? 0
  const viewportLeft = viewport.left ?? 0
  const maxWidth = Math.max(0, viewport.width - margin * 2)
  const viewportHeight = Math.max(0, viewport.height - margin * 2)
  const minTop = viewportTop + margin
  const minLeft = viewportLeft + margin
  const bottom = viewportTop + viewport.height - margin
  const spaceBelow = clamp(bottom - anchor.bottom - gap, 0, viewportHeight)
  const spaceAbove = clamp(anchor.top - gap - minTop, 0, viewportHeight)
  const placeAbove = menu.height > spaceBelow && spaceAbove > spaceBelow
  const maxHeight = placeAbove ? spaceAbove : spaceBelow
  const height = Math.min(menu.height, maxHeight)
  const width = Math.min(menu.width, maxWidth)

  return {
    top: clamp(placeAbove ? anchor.top - gap - height : anchor.bottom + gap, minTop, bottom - height),
    left: clamp(anchor.left, minLeft, viewportLeft + viewport.width - margin - width),
    maxHeight,
    maxWidth,
  }
}
