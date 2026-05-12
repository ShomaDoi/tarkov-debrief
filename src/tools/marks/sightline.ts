// Sightline mark — narrow filled sector ("line-like cone") anchored
// at the most-recent arrow tip.
//
// Shape: a circular sector with FIXED ARC LENGTH (not fixed angle).
// arc = θ * r, so to keep arc constant as range grows the half-angle
// shrinks (`half_angle = arc_length / (2 * range)`). Visually this
// means the cone tapers to a thin spike at long range while keeping
// the same "observation width" at its tip — what an operator sees
// at the destination is a fixed angular sliver, not a widening fan.
//
// Direction AND range are both set by a single click — click
// position relative to the anchor defines bisector angle and length.
// "Narrow observation" = SIGHTLINE_ARC_LENGTH constant below.
//
// Short-range clamp: at small ranges, fixed-arc math wants the
// half-angle to blow up (range → 0 ⇒ half-angle → ∞). We cap at
// SIGHTLINE_MAX_HALF_ANGLE so the sector becomes a finite wedge
// instead of an N-gon approximating a full disc. Visually the cone
// "opens up" smoothly during the first few px of drag, then locks
// into fixed-arc shrinkage past the threshold range
// (= arc / (2 * max_half_angle)).
//
// Interaction is chained-click (design doc §4.5): on tool activation
// the preview emanates from `lastArrowTipRef.current`; the cursor
// rotates the preview live (with 15° snap by default; Shift disables
// snap); a single click commits the sector and the tool auto-reverts
// to arrow.
//
// Phase treatment mirrors the cone (design doc §6.4): fill alpha
// shifts (15% record / 8% plan) and the stroke goes solid → dashed.
// Pre-refactor sightlines were dashed-line-only; the new shape needs
// a fill, so we adopt cone's visual language verbatim. Plan-phase
// dashing is the same PLAN_DASH used by cone for consistency.
//
// Storage: `__sightline` custom property carries `SightlineParams`
// (origin/angle/range). Parallels `__cone` on cone.ts — sweep is
// implicit (= 2 * SIGHTLINE_HALF_ANGLE) and not serialized.
//
// Spec exposes `serialize` / `deserialize` for Slice K direct-
// manipulation undo (design doc §4.10) and `updatePreview` for
// `useMark`'s chained-click preview redraw (see types.ts for why
// that hook exists — the legacy line-mutation fallback in useMark
// silently no-ops on a Path).

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams, SerializedState } from "./types";
import type { Point } from "./geometry";

// Fixed arc length at the cone's tip, in canvas-scene px. Reads as
// a tactical "observation window" — at any range, what the operator
// sees at the destination is the same arc length. Tune to taste.
const SIGHTLINE_ARC_LENGTH = 60;

// Upper bound on the half-angle so the sector stays a finite wedge
// when the cursor is near the anchor (where fixed-arc math wants
// half-angle → ∞). At 45° the cone is a quarter-disc at the
// degenerate threshold; below that range the cone opens smoothly,
// above it the fixed-arc taper takes over. Threshold range is
// `SIGHTLINE_ARC_LENGTH / (2 * SIGHTLINE_MAX_HALF_ANGLE)` (≈ 38 px
// at the current constants).
const SIGHTLINE_MAX_HALF_ANGLE = Math.PI / 4;

/**
 * Half-angle of the cone for a given bisector length. Implements the
 * fixed-arc-length rule (arc = θ * r ⇒ θ_half = arc / (2 * r)) with
 * the short-range clamp described in the header comment.
 */
function halfAngleFor(range: number): number {
  if (range < 1e-6) return 0;
  return Math.min(
    SIGHTLINE_ARC_LENGTH / (2 * range),
    SIGHTLINE_MAX_HALF_ANGLE,
  );
}

const STROKE_WIDTH = 1.5;
const RECORD_FILL_OPACITY = 0.15;
const PLAN_FILL_OPACITY = 0.08;
const RECORD_DASH: number[] = []; // solid stroke for record
const PLAN_DASH: number[] = [10, 15]; // matches cone.ts's PLAN_DASH;
// duplicated rather than imported to keep cone.ts and sightline.ts
// decoupled (cone.ts itself duplicates the value from phase.ts for
// the same reason — readonly-vs-mutable mismatch).
const HANDLE_RADIUS = 6;

/**
 * The sightline's editable parameters. The half-angle is derived
 * from `range` via `halfAngleFor` (fixed-arc rule); it's not part
 * of the stored shape because the rule is a global invariant, not
 * a per-mark setting.
 */
export interface SightlineParams {
  origin: Point;
  /** Bisector angle from +X, radians. */
  angle: number;
  /** Length of the sector (cursor distance from origin). */
  range: number;
}

const SIGHTLINE_KEY = "__sightline" as const;

/** Read SightlineParams off a fabric object. Returns null if absent. */
export function readSightlineParams(
  obj: fabric.FabricObject,
): SightlineParams | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[SIGHTLINE_KEY];
  if (v === undefined || v === null) return null;
  return v as SightlineParams;
}

/** Write SightlineParams onto a fabric object. */
export function writeSightlineParams(
  obj: fabric.FabricObject,
  params: SightlineParams,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[SIGHTLINE_KEY] = params;
}

/**
 * Derive SightlineParams from a chained-click anchor + end point.
 * angle = atan2(end - anchor); range = |end - anchor|.
 */
function deriveParams(anchor: Point, end: Point): SightlineParams {
  const dx = end.x - anchor.x;
  const dy = end.y - anchor.y;
  return {
    origin: { x: anchor.x, y: anchor.y },
    angle: Math.atan2(dy, dx),
    range: Math.hypot(dx, dy),
  };
}

/**
 * Build the SVG path-data string for a fixed-arc sightline sector.
 *
 * Path: M origin → L B → A r r 0 0 1 C → Z, where B and C are the
 * sector's two radial-edge endpoints positioned symmetrically around
 * the bisector by ±halfAngleFor(range).
 *
 * largeArcFlag is always 0 — `SIGHTLINE_MAX_HALF_ANGLE = π/4`
 * (header) caps the half-angle below π/2, so 2*half < π by
 * construction. The constant would have to nearly double before
 * this stopped holding. sweepFlag is fixed at 1 because B is
 * "before" C in the positive-sweep direction.
 *
 * Degenerate case: range < epsilon (the zero-range preview on
 * activation, before the first mouse:move) collapses to `M origin Z`
 * — invisibly small. The first mousemove redraws it normally.
 */
export function sightlinePathData(params: SightlineParams): string {
  const { origin, angle, range } = params;
  if (range < 1e-6) return `M ${origin.x} ${origin.y} Z`;

  const halfAngle = halfAngleFor(range);
  const startAngle = angle - halfAngle;
  const endAngle = angle + halfAngle;
  const B = {
    x: origin.x + range * Math.cos(startAngle),
    y: origin.y + range * Math.sin(startAngle),
  };
  const C = {
    x: origin.x + range * Math.cos(endAngle),
    y: origin.y + range * Math.sin(endAngle),
  };
  return (
    `M ${origin.x} ${origin.y} ` +
    `L ${B.x} ${B.y} ` +
    `A ${range} ${range} 0 0 1 ${C.x} ${C.y} Z`
  );
}

/**
 * Parse an SVG path-data string into fabric's NORMALIZED command
 * representation. Identical pattern to cone.ts — fabric's raw
 * `util.parsePath` leaves `A` commands as `A`, which fabric's
 * renderer can't draw (you get a thin line instead of an arc).
 * Constructing `new fabric.Path(d)` runs both the parser AND the
 * normalizer, exposing the renderer-ready array on `.path`.
 *
 * Cost is one throwaway Path allocation per preview frame / commit,
 * which is negligible at chained-click cadence.
 */
function parsePath(d: string): unknown[] {
  const tmp = new fabric.Path(d);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tmp as any).path as unknown[];
}

/**
 * Refresh a sightline's underlying fabric.Path from its current
 * `__sightline` params. Used by both `updatePreview` (preview redraw
 * on mouse:move) and the endpoint control's actionHandler. Keeps
 * sightline.ts as the single source of truth for path-data
 * generation — same shape as cone.ts's `refreshConePath`.
 *
 * `dirty: true` is load-bearing: build() sets `objectCaching: true`,
 * which means fabric blits the cached bitmap on the next render
 * unless we explicitly invalidate. Without this flag the live
 * preview path would freeze visually even though `.path` mutates
 * correctly. (Cone sidesteps this by removing + re-adding its
 * preview every frame — see useMark.ts §chained-drag `refreshPreview`
 * "fabric.Path's internal command array is hard to mutate in place."
 * For chained-click we mutate in place and pay the cache-invalidation
 * tax instead, because there's only one preview object per gesture.)
 */
function refreshPath(obj: fabric.Path): void {
  const params = readSightlineParams(obj);
  if (!params) return;
  const d = sightlinePathData(params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).set({ path: parsePath(d), dirty: true });
  obj.setCoords();
}

function build(params: MarkBuildParams): fabric.FabricObject {
  // Defensive: the spec's `interaction` field already pins us to
  // chained-click, but a future refactor could mis-route us.
  if (params.kind !== "chained-click") {
    throw new Error(
      `sightline.build: expected 'chained-click' params, got '${params.kind}'`,
    );
  }
  const { anchor, end, color } = params;
  const sightlineParams = deriveParams(anchor, end);
  const d = sightlinePathData(sightlineParams);
  const path = new fabric.Path(d, {
    fill: color,
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeDashArray: undefined,
    selectable: true,
    evented: true,
    // No default fabric scale/rotate controls — same rationale as
    // cone (§10.2): they don't make sense for a chained mark and
    // would invite a class of accidental edits. Slice K wires a
    // custom endpoint handle below.
    hasControls: false,
    hasBorders: true,
    objectCaching: true,
  });
  writeSightlineParams(path, sightlineParams);
  // applyPhase is called immediately after build by useMark; the
  // fill we set above is the base color and gets re-written to rgba
  // there. No need to compute alpha here.
  return path;
}

/**
 * Update an existing preview Path in-place to match new build params.
 * Called by `useMark` on each mouse:move during the chained-click
 * preview — see types.ts `MarkSpec.updatePreview` and useMark.ts §
 * chained-click. Cheaper than rebuilding the fabric.Path on every
 * frame because it skips the constructor's options + caching setup.
 */
function updatePreview(
  obj: fabric.FabricObject,
  params: MarkBuildParams,
): void {
  if (params.kind !== "chained-click") {
    throw new Error(
      `sightline.updatePreview: expected 'chained-click' params, got '${params.kind}'`,
    );
  }
  const next = deriveParams(params.anchor, params.end);
  writeSightlineParams(obj, next);
  refreshPath(obj as fabric.Path);
}

/**
 * Apply phase-conditioned styling. Mirrors cone.ts's pattern —
 * fill alpha shifts via rgba, stroke goes solid (record) → dashed
 * (plan). Stroke alpha stays 1 so the outline reads crisply over
 * both light and dark map backgrounds.
 */
function applyPhase(
  obj: fabric.FabricObject,
  phase: "record" | "plan",
): void {
  const path = obj as fabric.Path;
  // Strip back to the base hex via `path.stroke` — that field is
  // never overwritten as rgba in our code paths, so it's the safe
  // source of truth for re-deriving the fill alpha. Same trick
  // cone.ts uses.
  const base = (path.stroke as string | undefined) ?? "#000000";
  const fillOpacity =
    phase === "plan" ? PLAN_FILL_OPACITY : RECORD_FILL_OPACITY;
  path.set({
    fill: hexToRgba(base, fillOpacity),
    strokeDashArray: phase === "plan" ? [...PLAN_DASH] : [...RECORD_DASH],
  });
}

function hexToRgba(hex: string, alpha: number): string {
  // Accept #RGB / #RRGGBB. Anything else (rgb(), named colors)
  // passes through unmodified — fabric won't crash, alpha just
  // isn't honored. The operator-color palette is all hex so the
  // strict path covers production usage.
  if (!hex.startsWith("#")) return hex;
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function serialize(obj: fabric.FabricObject): SerializedState {
  const params = readSightlineParams(obj);
  if (!params) {
    // No params attached — return a zero-shape blob so the round-trip
    // (deserialize) is a safe no-op rather than NaN-propagating.
    return { origin: { x: 0, y: 0 }, angle: 0, range: 0 };
  }
  // Spread into a plain object so undo's JSON.stringify equality
  // doesn't share a reference with the live params.
  return {
    origin: { x: params.origin.x, y: params.origin.y },
    angle: params.angle,
    range: params.range,
  };
}

function deserialize(
  obj: fabric.FabricObject,
  state: SerializedState,
): void {
  const s = state as {
    origin: Point;
    angle: number;
    range: number;
  };
  const params: SightlineParams = {
    origin: { x: s.origin.x, y: s.origin.y },
    angle: s.angle,
    range: s.range,
  };
  writeSightlineParams(obj, params);
  refreshPath(obj as fabric.Path);
}

function renderHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  fill: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Single endpoint control at the bisector tip. Drag updates BOTH
 * `angle` and `range` — the half-angle is a derived function of
 * range (fixed-arc rule, see `halfAngleFor`), so the user can never
 * directly widen or narrow the cone, only point it elsewhere or
 * extend/shrink it. Extending the cone implicitly narrows the
 * angle; shrinking it widens — that's the whole point of this mark.
 *
 * No 15° snap on the drag: the creation-time snap (handled in
 * useMark via applyAngleSnap) is meant to make the INITIAL placement
 * angles read as clean tactical bearings. After commit, freeform
 * adjustment is more useful than re-snapping every drag, and matches
 * the cone's apex-handle behavior (also unsnapped). Same as cone's
 * spread handle: design doc §10.2.
 */
function buildControls(
  obj: fabric.FabricObject,
): Record<string, fabric.Control> {
  const path = obj as fabric.Path;
  return {
    endpoint: new fabric.Control({
      positionHandler: () => {
        const params = readSightlineParams(path);
        if (!params) return new fabric.Point(0, 0);
        return new fabric.Point(
          params.origin.x + params.range * Math.cos(params.angle),
          params.origin.y + params.range * Math.sin(params.angle),
        );
      },
      actionHandler: (
        _eventData: unknown,
        _transform: unknown,
        x: number,
        y: number,
      ) => {
        const params = readSightlineParams(path);
        if (!params) return false;
        const dx = x - params.origin.x;
        const dy = y - params.origin.y;
        const newRange = Math.hypot(dx, dy);
        // Tiny range collapses the sector to invisible; refuse the
        // mutation rather than commit a degenerate undo entry.
        if (newRange < 1e-6) return false;
        const newAngle = Math.atan2(dy, dx);
        writeSightlineParams(path, {
          ...params,
          angle: newAngle,
          range: newRange,
        });
        refreshPath(path);
        return true;
      },
      actionName: "modifyEndpoint",
      cursorStyleHandler: () => "crosshair",
      render: (ctx, left, top) => renderHandle(ctx, left, top, "#FFFFFF"),
      sizeX: HANDLE_RADIUS * 2,
      sizeY: HANDLE_RADIUS * 2,
      x: 0,
      y: 0,
    }),
  };
}

export const SIGHTLINE_SPEC: MarkSpec = {
  toolType: ToolType.sightline,
  markType: "sightline",
  interaction: "chained-click",
  colorSource: "operator",
  cursor: "crosshair",
  oneShot: true,
  revertTo: ToolType.arrow,
  build,
  applyPhase,
  serialize,
  deserialize,
  buildControls,
  updatePreview,
};
