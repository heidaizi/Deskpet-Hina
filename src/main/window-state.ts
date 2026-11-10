import type { Bounds, DisplayDescriptor, HitArea, Point2D, SavedWindowState } from '../shared/types'

interface WindowSize {
  width: number
  height: number
}

export interface AutonomousWalkPlan {
  direction: -1 | 1
  targetX: number
  distance: number
  durationMs: number
}

export function chooseAutonomousWalkPlan(
  startX: number,
  minX: number,
  maxX: number,
  random: () => number,
  previousDirection?: -1 | 1,
): AutonomousWalkPlan | null {
  const minDistance = 35
  const canWalkLeft = startX - minX >= minDistance
  const canWalkRight = maxX - startX >= minDistance
  if (!canWalkLeft && !canWalkRight) {
    return null
  }

  let direction: -1 | 1
  if (canWalkLeft && canWalkRight) {
    direction = random() < 0.5 ? -1 : 1
    if (direction === previousDirection && random() < 0.7) {
      direction = direction === 1 ? -1 : 1
    }
  } else {
    direction = canWalkLeft ? -1 : 1
  }

  const availableDistance = direction === -1 ? startX - minX : maxX - startX
  const preferredMin = Math.min(90, availableDistance)
  const preferredMax = Math.min(260, availableDistance)
  const distance = preferredMin + random() * Math.max(0, preferredMax - preferredMin)
  const targetX = Math.round(startX + direction * distance)

  return {
    direction,
    targetX,
    distance,
    durationMs: Math.min(4_800, Math.max(1_800, distance * 12)),
  }
}

function isFiniteBounds(bounds: Partial<Bounds> | null | undefined): bounds is Bounds {
  return Boolean(
    bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width! > 0 &&
    bounds.height! > 0,
  )
}

function intersectionArea(left: Bounds, right: Bounds): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

export function clampBoundsToWorkArea(bounds: Bounds, workArea: Bounds): Bounds {
  const width = Math.min(bounds.width, workArea.width)
  const height = Math.min(bounds.height, workArea.height)
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY),
    width,
    height,
  }
}

export function defaultBounds(workArea: Bounds, size: WindowSize): Bounds {
  return {
    x: workArea.x + workArea.width - size.width - 36,
    y: workArea.y + workArea.height - size.height - 28,
    width: size.width,
    height: size.height,
  }
}

export function resolveWindowBounds(
  saved: Partial<SavedWindowState> | null,
  displays: DisplayDescriptor[],
  primaryDisplayId: number,
  size: WindowSize,
): SavedWindowState {
  const primaryDisplay = displays.find((display) => display.id === primaryDisplayId) ?? displays[0]

  if (!primaryDisplay) {
    return {
      ...defaultBounds({ x: 0, y: 0, width: 1440, height: 900 }, size),
      displayId: 0,
    }
  }

  const savedDisplayId = saved && Number.isFinite(saved.displayId) ? saved.displayId : undefined

  if (!isFiniteBounds(saved)) {
    return {
      ...defaultBounds(primaryDisplay.workArea, size),
      displayId: primaryDisplay.id,
    }
  }

  const requestedBounds: Bounds = {
    x: saved.x,
    y: saved.y,
    width: size.width,
    height: size.height,
  }

  let targetDisplay = displays.find((display) => display.id === savedDisplayId)

  if (targetDisplay) {
    return {
      ...clampBoundsToWorkArea(requestedBounds, targetDisplay.workArea),
      displayId: targetDisplay.id,
    }
  }

  const bestOverlap = displays
    .map((display) => ({
      display,
      area: intersectionArea(requestedBounds, display.workArea),
    }))
    .sort((left, right) => right.area - left.area)[0]

  targetDisplay = bestOverlap && bestOverlap.area > 0 ? bestOverlap.display : undefined

  if (!targetDisplay) {
    targetDisplay = primaryDisplay
  }

  return {
    ...clampBoundsToWorkArea(requestedBounds, targetDisplay.workArea),
    displayId: targetDisplay.id,
  }
}

export function isPointInsideHitArea(point: Point2D, area: HitArea, padding = 0): boolean {
  if (area.type === 'circle') {
    const dx = point.x - area.x
    const dy = point.y - area.y
    const radius = area.radius + padding
    return dx * dx + dy * dy <= radius * radius
  }

  return (
    point.x >= area.x - padding &&
    point.x <= area.x + area.width + padding &&
    point.y >= area.y - padding &&
    point.y <= area.y + area.height + padding
  )
}

export function isPointInsideAnyHitArea(
  point: Point2D,
  areas: readonly HitArea[],
  padding = 0,
): boolean {
  return areas.some((area) => isPointInsideHitArea(point, area, padding))
}
