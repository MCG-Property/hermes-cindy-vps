export interface OverlayRect {
  hidden: boolean
  top: number
  left: number
  width: number
  height: number
}

/** Drop 1px overlay chase. Floor/ceil of a fractional slot plus xterm's
 *  canvas backing store otherwise flip width/height every frame and WINCH
 *  the PTY. */
export const OVERLAY_RECT_SLACK_PX = 1

export function stabilizeOverlayRect(
  prev: OverlayRect | null,
  next: OverlayRect,
  slackPx = OVERLAY_RECT_SLACK_PX
): OverlayRect {
  if (!prev || prev.hidden !== next.hidden) {
    return next
  }

  const snap = (value: number, previous: number) => (Math.abs(value - previous) <= slackPx ? previous : value)

  return {
    hidden: next.hidden,
    top: snap(next.top, prev.top),
    left: snap(next.left, prev.left),
    width: snap(next.width, prev.width),
    height: snap(next.height, prev.height)
  }
}
