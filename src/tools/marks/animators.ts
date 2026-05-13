// Per-mark animators for the replay scrubber.
//
// Each animator takes a fabric object and a normalized progress
// `t ∈ [0, 1]` and mutates the object so its rendered state
// matches "this mark, partially drawn." The dispatcher
// `applyAnimation` routes by __markType.
//
// Animation lifecycle (called from the render-composition effect
// in App.tsx):
//   - The render effect determines visibility from operator ∧
//     within-playhead-slot, sets obj.visible accordingly.
//   - For marks mid-animation (playhead inside the slot's window),
//     applyAnimation(obj, t) is called with t in (0, 1).
//   - For marks fully past their slot end, applyAnimation(obj, 1)
//     resets to fully-committed state.
//
// Two animators ship in P2:
//   - pathReveal: for pencil + arrow. Progressively truncates the
//     freehand path command array. Arrow's head child is hidden
//     until t === 1.
//   - coneSweep: for cone. Rebuilds the SVG path with sweep scaled
//     by t. Hides at near-zero sweep.
//
// All other mark types have no entry in the dispatcher and are
// instant-appear (visibility flips on at slot start; no partial
// state).
//
// State caching pattern:
//   - pathReveal caches __pathOriginal + __pathCumulative on first
//     mid-animation call; cleared on t === 1.
//   - coneSweep reads __cone directly (the canonical params); no
//     cache needed.
//
// Matching the __transient / __arrowTip / __REPLAY custom-property
// convention; ESLint's no-explicit-any is permitted for these
// fabric-integration tags (eslint.config.js).
//
// Design references:
//   - claudedocs/design_p2_slice.md §6 (per-mark animators)

import * as fabric from "fabric";
import { readMarkType, type MarkType } from "@/tools/metadata";
import { getBodyPath } from "@/state/timeline";
import { conePathData, parsePath, readConeParams } from "./cone";

// ===== Custom-property keys =====

const PATH_ORIGINAL_KEY = "__pathOriginal" as const;
const PATH_CUMULATIVE_KEY = "__pathCumulative" as const;
const ROLE_KEY = "__role" as const;

// ===== Path geometry helpers =====
//
// Mirrors computePathArcLength in src/state/timeline.ts at the
// per-command level. The two functions share the same chord
// approximation contract (sub-pixel-spaced brush emission makes
// chord ≈ arc length). Kept separate because the animator needs
// per-command cumulative lengths (for partial-segment lerp), while
// the timeline only needs the total.

// Tuple-ish: [opLetter, ...numericArgs]. Modeled loosely because
// fabric path-array types fluctuate across patch releases; the
// structural contract is "first element is the SVG-style op
// letter, rest are numeric (or nullable padding in some
// versions)."
type PathCommand = Array<string | number | null | undefined>;

function endpointOf(cmd: PathCommand): { x: number; y: number } {
  const op = String(cmd[0]);
  switch (op) {
    case "M":
    case "L":
      return { x: Number(cmd[1]), y: Number(cmd[2]) };
    case "Q":
      return { x: Number(cmd[3]), y: Number(cmd[4]) };
    case "C":
      return { x: Number(cmd[5]), y: Number(cmd[6]) };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Cumulative arc length after each command. cumulative[i] is the
 * total chord length from the path's start up to and including
 * the endpoint of commands[i]. cumulative[0] is 0 (M command
 * contributes no length); each subsequent entry adds the chord
 * from the previous endpoint to the current command's endpoint.
 *
 * Used by pathReveal to find which segment a target arc-length
 * falls inside (linear scan since segment counts are bounded by
 * brush emission rate; a binary search is overkill at these
 * sizes).
 */
export function computeCumulative(commands: PathCommand[]): number[] {
  const cum: number[] = [];
  let running = 0;
  let cx = 0;
  let cy = 0;
  for (const cmd of commands) {
    const op = String(cmd[0]);
    if (op === "M") {
      cx = Number(cmd[1]);
      cy = Number(cmd[2]);
      cum.push(running);
      continue;
    }
    if (op === "L" || op === "Q" || op === "C") {
      const e = endpointOf(cmd);
      running += Math.hypot(e.x - cx, e.y - cy);
      cx = e.x;
      cy = e.y;
      cum.push(running);
      continue;
    }
    // Z / unknown: no length contribution.
    cum.push(running);
  }
  return cum;
}

/**
 * Build a path command array truncated at the given target arc
 * length. The truncated path contains every fully-traversed
 * command, plus a partial L (straight line) to the partial
 * endpoint of the segment that target falls inside.
 *
 * Why convert the partial segment to an L: simpler than partial
 * de Casteljau on a Q/C, and visually indistinguishable for the
 * brush's sub-pixel-spaced commands. The visible "tail" of the
 * animated path is one segment long (~4px) so even if it's a
 * straight chord vs. the original curve, you can't see the
 * difference.
 */
export function computePartialPath(
  original: PathCommand[],
  cumulative: number[],
  target: number,
): PathCommand[] {
  if (original.length === 0) return [];
  if (target <= 0) {
    // Just the M command; no visible content.
    return [Array.from(original[0]!) as PathCommand];
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (target >= total) {
    // Fully revealed.
    return original.map((c) => Array.from(c) as PathCommand);
  }
  // Find the first command whose cumulative >= target.
  let i = 0;
  while (i < cumulative.length && cumulative[i]! < target) i++;
  if (i === 0) {
    return [Array.from(original[0]!) as PathCommand];
  }
  const prefix = original
    .slice(0, i)
    .map((c) => Array.from(c) as PathCommand);
  if (i >= original.length) return prefix;

  const prevEnd = endpointOf(original[i - 1]!);
  const curEnd = endpointOf(original[i]!);
  const prevLen = cumulative[i - 1] ?? 0;
  const segLen = (cumulative[i] ?? 0) - prevLen;
  if (segLen <= 0) return prefix;
  const ratio = (target - prevLen) / segLen;
  const px = prevEnd.x + ratio * (curEnd.x - prevEnd.x);
  const py = prevEnd.y + ratio * (curEnd.y - prevEnd.y);
  return [...prefix, ["L", px, py] as PathCommand];
}

// ===== Arrow group introspection =====

function getArrowHead(obj: fabric.FabricObject): fabric.FabricObject | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((obj as any).type !== "group") return null;
  const group = obj as unknown as fabric.Group;
  for (const child of group.getObjects()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((child as any)[ROLE_KEY] === "head") return child;
  }
  return null;
}

// ===== pathReveal =====

/**
 * Progressive freehand-path reveal.
 *
 * For pencil: obj is a fabric.Path; the animator truncates its
 * `path` command array to a prefix corresponding to t × total arc
 * length.
 *
 * For arrow: obj is a fabric.Group; the animator finds the body
 * child (via __role) and truncates its path. The head child stays
 * invisible until t === 1.
 *
 * On t === 1 (or via resetAnimation), restores the cached original
 * path and clears the cache.
 */
export function pathReveal(obj: fabric.FabricObject, t: number): void {
  const body = getBodyPath(obj);
  if (!body) return;
  const head = getArrowHead(obj);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyBag = body as any;

  if (t >= 1) {
    // Restore from cache if present (i.e. we had been animating).
    const original = bodyBag[PATH_ORIGINAL_KEY] as
      | PathCommand[]
      | undefined;
    if (original !== undefined) {
      writePath(body, original.map((c) => Array.from(c)));
      delete bodyBag[PATH_ORIGINAL_KEY];
      delete bodyBag[PATH_CUMULATIVE_KEY];
    }
    if (head) head.visible = true;
    return;
  }

  // Mid-animation. Cache original on first call.
  if (bodyBag[PATH_ORIGINAL_KEY] === undefined) {
    const current = (bodyBag.path as PathCommand[] | undefined) ?? [];
    bodyBag[PATH_ORIGINAL_KEY] = current.map((c) => Array.from(c));
    bodyBag[PATH_CUMULATIVE_KEY] = computeCumulative(current);
  }

  const original = bodyBag[PATH_ORIGINAL_KEY] as PathCommand[];
  const cumulative = bodyBag[PATH_CUMULATIVE_KEY] as number[];
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = Math.max(0, t) * total;
  const partial = computePartialPath(original, cumulative, target);
  writePath(body, partial);

  if (head) head.visible = false;
}

/**
 * Write a new path command array onto a fabric.Path-like object,
 * preferring the `.set()` setter (which invalidates fabric's
 * internal caches: pathOffset, bounding box) over direct
 * assignment. Falls back to direct assignment for the plain-JS
 * test fixtures that don't implement `.set()`.
 *
 * Also calls setCoords() after to refresh the object's transform
 * coordinates so hit-testing and rendering see the new geometry.
 */
function writePath(
  body: fabric.FabricObject,
  newPath: PathCommand[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bag = body as any;
  if (typeof bag.set === "function") {
    bag.set({ path: newPath });
  } else {
    bag.path = newPath;
  }
  if (typeof bag.setCoords === "function") {
    bag.setCoords();
  }
}

// ===== coneSweep =====

/**
 * Progressive cone-sweep reveal.
 *
 * Reads the canonical ConeParams from __cone (set at build time by
 * the cone spec) and re-renders the path at `t × sweep` extent.
 * No cache needed — the canonical params stay clean; only the
 * rendered SVG path is mutated.
 *
 * At near-zero sweep (|t × sweep| < threshold), hides the cone
 * outright to avoid a flash of zero-area path. The next call at
 * higher t un-hides because the render effect resets obj.visible
 * from the operator + slot filter on every tick.
 */
export function coneSweep(obj: fabric.FabricObject, t: number): void {
  const params = readConeParams(obj);
  if (!params) return;

  const effectiveSweep = t >= 1 ? params.sweep : params.sweep * t;
  const scaled = {
    origin: { ...params.origin },
    startAngle: params.startAngle,
    sweep: effectiveSweep,
    range: params.range,
  };
  const d = conePathData(scaled);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).set({ path: parsePath(d) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).setCoords?.();

  // Hide while degenerate. Threshold matches the sweep < 1e-6 guard
  // in conePathData itself, but uses a slightly larger value so the
  // hide kicks in BEFORE the path collapses to its degenerate
  // single-edge form (which would look like a thin line jutting out
  // of the origin for one frame).
  if (t < 1 && Math.abs(effectiveSweep) < 0.02) {
    obj.visible = false;
  }
}

// ===== Dispatcher =====

type AnimatorFn = (obj: fabric.FabricObject, t: number) => void;

const ANIMATORS: Partial<Record<MarkType, AnimatorFn>> = {
  pencil: pathReveal,
  arrow: pathReveal,
  cone: coneSweep,
};

/**
 * Dispatch the animator for a mark, if any. Marks with no
 * registered animator (sightline, engagement X, sound ping,
 * position dot, text) are no-ops — they instant-appear at slot
 * start and never need partial-state rendering.
 *
 * Future marks with intrinsic temporal structure (e.g. sightline
 * after its geometry change to a narrow-cone-extension model) add
 * an entry here without restructuring the dispatcher.
 */
export function applyAnimation(
  obj: fabric.FabricObject,
  t: number,
): void {
  const mt = readMarkType(obj);
  if (!mt) return;
  const fn = ANIMATORS[mt];
  if (fn) fn(obj, t);
}

/**
 * Force a mark back to its fully-committed render state and clear
 * any animation caches. Called by the render-composition effect
 * for marks whose slot the playhead has passed.
 *
 * Semantically equivalent to applyAnimation(obj, 1) for marks with
 * animators; a no-op for marks without one.
 */
export function resetAnimation(obj: fabric.FabricObject): void {
  applyAnimation(obj, 1);
}
