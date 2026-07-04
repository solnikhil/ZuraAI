export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotCoordinateContext {
  displayId?: string
  displayLabel?: string
  renderedWidth: number
  renderedHeight: number
  nativeWidth: number
  nativeHeight: number
  displayBounds: DisplayBounds
  scaleFactor: number
}

export interface DesktopPoint {
  x: number
  y: number
}

function assertFiniteCoordinate(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name} coordinate: expected a finite number`)
  }
}

function assertPositiveDimension(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid screen context: ${name} must be greater than 0`)
  }
}

export function mapScreenshotPointToDesktop(
  point: DesktopPoint,
  context: ScreenshotCoordinateContext
): DesktopPoint {
  assertFiniteCoordinate('x', point.x)
  assertFiniteCoordinate('y', point.y)
  assertPositiveDimension('renderedWidth', context.renderedWidth)
  assertPositiveDimension('renderedHeight', context.renderedHeight)
  assertPositiveDimension('displayBounds.width', context.displayBounds.width)
  assertPositiveDimension('displayBounds.height', context.displayBounds.height)

  if (
    point.x < 0 ||
    point.x >= context.renderedWidth ||
    point.y < 0 ||
    point.y >= context.renderedHeight
  ) {
    throw new Error(
      `Screen coordinates (${point.x}, ${point.y}) are outside the latest screen bounds (${context.renderedWidth}x${context.renderedHeight})`
    )
  }

  const normalizedX = point.x / context.renderedWidth
  const normalizedY = point.y / context.renderedHeight

  return {
    x: context.displayBounds.x + Math.round(normalizedX * context.displayBounds.width),
    y: context.displayBounds.y + Math.round(normalizedY * context.displayBounds.height),
  }
}

export function serializeCoordinateContext(context: ScreenshotCoordinateContext) {
  return {
    displayId: context.displayId,
    displayLabel: context.displayLabel,
    renderedWidth: context.renderedWidth,
    renderedHeight: context.renderedHeight,
    nativeWidth: context.nativeWidth,
    nativeHeight: context.nativeHeight,
    displayBounds: context.displayBounds,
    scaleFactor: context.scaleFactor,
  }
}
