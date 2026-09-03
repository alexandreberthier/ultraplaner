/** Clamp a fixed dropdown under a trigger so it stays inside the viewport + safe areas. */
export function clampFixedPanelStyle(
  trigger: DOMRect,
  opts?: { preferredWidth?: number; gap?: number; margin?: number }
): Record<string, string> {
  const gap = opts?.gap ?? 8
  const margin = opts?.margin ?? 8
  const preferredWidth = opts?.preferredWidth ?? 22 * 16

  const vv = window.visualViewport
  const viewW = vv?.width ?? window.innerWidth
  const viewH = vv?.height ?? window.innerHeight
  const offsetLeft = vv?.offsetLeft ?? 0
  const offsetTop = vv?.offsetTop ?? 0

  const minLeft = offsetLeft + margin
  const maxRight = offsetLeft + viewW - margin
  const maxWidth = Math.max(160, maxRight - minLeft)
  const width = Math.min(preferredWidth, maxWidth)

  // Prefer aligning the panel's right edge to the trigger; never leave the viewport.
  let left = trigger.right - width
  if (left < minLeft) left = minLeft
  if (left + width > maxRight) left = Math.max(minLeft, maxRight - width)

  const top = Math.max(offsetTop + margin, trigger.bottom + gap)
  const maxHeight = Math.max(140, offsetTop + viewH - top - margin)

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    right: 'auto',
    width: `${Math.round(width)}px`,
    maxWidth: `${Math.round(maxWidth)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
}
