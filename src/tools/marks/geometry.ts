// Pure geometric utilities shared across mark types.
//
// No fabric imports here — these are framework-agnostic helpers so
// tests stay fast and the math can be reused from preview code,
// commit code, control handlers, and the signed-sweep cone
// integration (design doc §6.5).
//
// Conventions used everywhere in the marks subsystem:
//   - Angles are in radians.
//   - `atan2(dy, dx)` returns the canonical [-π, π] range.
//   - Y axis follows fabric's screen-coord convention (positive Y is
//     down). Sweep sign in cone math is consequently flipped relative
//     to math-class convention — but as long as we're consistent
//     about it across creation and rendering, the rendered visual
//     matches the user's drag direction.

export interface Point {
  x: number;
  y: number;
}

/** Vector subtraction: `a - b`. */
export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Euclidean length of a 2D vector. */
export function length(v: Point): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Wrap an angle into the half-open interval (-π, π].
 *
 * Used by the cone signed-sweep integration (design doc §6.5):
 * frame-to-frame `dθ = wrapToPi(curAngle - prevAngle)` ensures
 * crossing the ±π branch cut of atan2 doesn't flip the integrated
 * sweep by 2π. Valid as long as the cursor doesn't jump more than
 * π in a single frame — at typical mouse-move rates this is
 * always true.
 */
export function wrapToPi(angle: number): number {
  // The natural range of (x mod 2π) places branch cuts inconveniently.
  // Take (angle + π) mod 2π → [0, 2π), then subtract π → [-π, π).
  // Adjust the boundary so we get (-π, π] rather than [-π, π).
  const TWO_PI = Math.PI * 2;
  let a = ((angle + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  // JavaScript's `%` operator can leave -π for exact π inputs; flip
  // that to +π so the boundary is consistently in the upper end.
  if (a === -Math.PI) a = Math.PI;
  return a;
}

/**
 * Snap an angle (radians) to the nearest multiple of `step` (also
 * radians). Used by sightline angle-snap (design doc §4.5) and by
 * direct-manipulation handles that want 15° increments.
 *
 * `step = Math.PI/12` snaps to 15° increments (the sightline
 * default).
 */
export function snapAngle(angle: number, step: number): number {
  return Math.round(angle / step) * step;
}

/**
 * Rotate a 2D vector by `angle` radians (CCW in math convention;
 * because fabric's Y axis is flipped, this appears CW on screen
 * — adjust callers' expectations accordingly).
 */
export function rotate(v: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Clamp `n` to the closed interval [`lo`, `hi`]. Tiny helper, but
 * having it as a named function keeps the cone-sweep clamp readable.
 */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
