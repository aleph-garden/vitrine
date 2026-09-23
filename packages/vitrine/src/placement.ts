// Where a popover opens when the browser has no CSS anchor positioning. Kept
// out of the package's exports: `menu` is its only caller.

type Box = { top: number; bottom: number; right: number }
type Size = { width: number; height: number }

/** Below the button, right edges aligned, unless the list does not fit below
 *  and there is more room above, in which case it opens above. `gap` is the
 *  space between button and list; the list keeps 8px from the left edge. */
export function placeMenu(
  button: Box,
  list: Size,
  viewport: Size,
  gap = 4
): { top: number; left: number } {
  const below = viewport.height - button.bottom - gap
  const above = button.top - gap
  const up = list.height > below && above > below
  return {
    top: up ? Math.max(8, button.top - gap - list.height) : button.bottom + gap,
    left: Math.max(8, button.right - list.width)
  }
}
