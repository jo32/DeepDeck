export interface GazePoint {
  readonly x: number
  readonly y: number
}

export interface GazeBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface CharacterGazePose {
  readonly eyeX: number
  readonly eyeY: number
  readonly headYaw: number
  readonly headPitch: number
  readonly headRoll: number
  readonly lift: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Convert a viewport pointer position into a circular -1…1 gaze target.
 * The viewport-aware falloff lets the character reach a full glance before
 * the cursor reaches a distant screen edge while preserving fine motion nearby.
 */
export function normalizeGazePoint(
  clientX: number,
  clientY: number,
  bounds: GazeBounds,
  viewportWidth: number,
  viewportHeight: number,
): GazePoint {
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2
  const horizontalReach = Math.max(bounds.width * 2.5, viewportWidth * 0.36, 1)
  const verticalReach = Math.max(bounds.height * 2.5, viewportHeight * 0.4, 1)
  let x = clamp((clientX - centerX) / horizontalReach, -1, 1)
  let y = clamp((clientY - centerY) / verticalReach, -1, 1)
  const distance = Math.hypot(x, y)

  if (distance > 1) {
    x /= distance
    y /= distance
  }

  return { x, y }
}

export function isPointInsideBounds(
  clientX: number,
  clientY: number,
  bounds: GazeBounds,
) {
  return (
    clientX >= bounds.left &&
    clientX <= bounds.left + bounds.width &&
    clientY >= bounds.top &&
    clientY <= bounds.top + bounds.height
  )
}

/** Eyes lead the motion; the head follows with restrained anatomical angles. */
export function mapGazeToCharacter({ x, y }: GazePoint): CharacterGazePose {
  const clampedX = clamp(x, -1, 1)
  const clampedY = clamp(y, -1, 1)

  return {
    eyeX: clampedX * 0.066,
    eyeY: -clampedY * 0.056,
    headYaw: clampedX * 0.22,
    headPitch: clampedY * 0.15,
    headRoll: -clampedX * 0.026,
    lift: -clampedY * 0.008,
  }
}
