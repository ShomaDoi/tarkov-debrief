// Overwatch cone mark — circular sector anchored at the most-recent
// arrow tip, with the arc and range defined by a two-point drag.
//
// Origin = lastArrowTipRef. The user's mouse:down sets edge 1's
// direction from origin; the cursor's live position sets the other
// edge; the release point's distance from origin sets the range.
// `sweep` is SIGNED — the cumulative signed angular displacement of
// the cursor around `origin` during the drag — so reflex sectors
// (|sweep| > π) round-trip unambiguously.
//
// Rendered as a fabric.Path with an SVG `A` arc command (not a
// polygon — design doc §6.2, design-review C(ii)): the chord
// between the two edge endpoints is replaced by a true circular
// arc, so cones read as "fan from the operator" rather than
// "triangle with a flat back."
//
// The signed-sweep integration math lives in useMark (the
// chained-drag interaction); this file is just the spec — how to
// build / restyle / serialize a cone given its already-computed
// parameters.
//
// Design references:
//   - claudedocs/design_p1_slice.md §6 (Slice G)
//   - claudedocs/design_p1_slice.md §6.2 / §6.3 (geometry + params)
//   - claudedocs/design_p1_slice.md §6.5 (sweep integration)

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams, SerializedState } from "./types";
import type { Point } from "./geometry";
import { wrapToPi } from "./geometry";

const STROKE_WIDTH = 1.5;
const RECORD_FILL_OPACITY = 0.15;
const PLAN_FILL_OPACITY = 0.08;
const RECORD_DASH: number[] = []; // solid stroke for record cones
const PLAN_DASH: number[] = [10, 15]; // matches PLAN_DASH_ARRAY from
// src/state/phase.ts. We don't import it directly because phase.ts
// declares it as a `number[]` (not `readonly`) and re-using the
// exported reference would let callers mutate it. Cheap to duplicate.

/**
 * The cone's editable parameters. Stored on the fabric object as
 * `__cone` (writable through-`any`-cast, paralleling the existing
 * `__operatorId` / `__phase` / `__markType` tagging pattern). See
 * design doc §6.3.
 */
export interface ConeParams {
  origin: Point;
  /** Angle of edge 1 (the first drag direction) from +X, radians. */
  startAngle: number;
  /** Signed angular extent of the sector. |sweep| ≤ 2π. */
  sweep: number;
  /** Length of both radial edges. */
  range: number;
}

const CONE_KEY = "__cone" as const;

/** Read the ConeParams off a fabric object. Returns null if absent. */
export function readConeParams(obj: fabric.FabricObject): ConeParams | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[CONE_KEY];
  if (v === undefined || v === null) return null;
  return v as ConeParams;
}

/** Write ConeParams onto a fabric object. */
export function writeConeParams(
  obj: fabric.FabricObject,
  params: ConeParams,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[CONE_KEY] = params;
}

/**
 * Compute the cone's two radial-edge endpoints (B = edge 1 tip,
 * C = edge 2 tip) given its parameters.
 */
export function coneEdgeEndpoints(params: ConeParams): { B: Point; C: Point } {
  const { origin, startAngle, sweep, range } = params;
  return {
    B: {
      x: origin.x + range * Math.cos(startAngle),
      y: origin.y + range * Math.sin(startAngle),
    },
    C: {
      x: origin.x + range * Math.cos(startAngle + sweep),
      y: origin.y + range * Math.sin(startAngle + sweep),
    },
  };
}

/**
 * Build the SVG path-data string for the cone's filled sector.
 *
 * Path: M origin → L B → A radius radius 0 largeArcFlag sweepFlag C → Z
 *
 * `largeArcFlag = |sweep| > π ? 1 : 0` — reflex sectors require the
 * "long way" arc segment.
 *
 * `sweepFlag = sweep > 0 ? 1 : 0` — SVG's sweep flag selects which
 * of the two possible arcs of the given radius passes through C.
 * The sign of our `sweep` matches "the direction the user dragged
 * in"; the SVG sweep flag selects the same direction. (The on-screen
 * handedness depends on whether the canvas Y-axis is flipped, but
 * fabric.Path consumes SVG path-data directly, so the sign-of-sweep
 * → sweep-flag mapping is consistent regardless.)
 *
 * Degenerate case: zero-length sector (sweep ≈ 0) renders as
 * `M origin L B Z` — a single line back to the origin. This is what
 * the cone preview shows on `mouse:down` before the drag has
 * accumulated any sweep.
 */
export function conePathData(params: ConeParams): string {
  const { origin, range } = params;
  const { B, C } = coneEdgeEndpoints(params);
  const sweep = params.sweep;

  if (Math.abs(sweep) < 1e-6) {
    // Degenerate: collapse to a single edge.
    return `M ${origin.x} ${origin.y} L ${B.x} ${B.y} Z`;
  }

  const largeArcFlag = Math.abs(sweep) > Math.PI ? 1 : 0;
  const sweepFlag = sweep > 0 ? 1 : 0;
  return (
    `M ${origin.x} ${origin.y} ` +
    `L ${B.x} ${B.y} ` +
    `A ${range} ${range} 0 ${largeArcFlag} ${sweepFlag} ${C.x} ${C.y} Z`
  );
}

/**
 * Compute initial ConeParams from a chained-drag commit. The
 * signed-sweep computation lives in useMark's drag integrator
 * (so the params come in pre-integrated); this helper is used
 * by the spec.build path which receives the integrated sweep
 * via a custom build params extension OR derives it from
 * (anchor, dragStart, dragEnd) for the simple non-integrated
 * case. See design doc §6.3.
 *
 * Here we derive sweep as the *single-step* signed angular delta
 * between (dragStart - origin) and (dragEnd - origin). This is
 * exactly correct ONLY when the drag stayed within (−π, π) of
 * sweep — i.e., never crossed the anti-bisector. For reflex
 * cones, useMark's integrator threads the cumulative sweep into
 * the cone via writeConeParams AFTER the spec.build call.
 *
 * The two paths converge: small drags use spec.build's derivation
 * directly; large drags overwrite with the integrated value.
 */
export function deriveConeParams(
  anchor: Point,
  dragStart: Point,
  dragEnd: Point,
): ConeParams {
  const startAngle = Math.atan2(
    dragStart.y - anchor.y,
    dragStart.x - anchor.x,
  );
  const endAngle = Math.atan2(
    dragEnd.y - anchor.y,
    dragEnd.x - anchor.x,
  );
  // Signed delta in (−π, π]. Good enough for sub-half-revolution
  // drags; useMark's integrator handles the reflex case.
  const sweep = wrapToPi(endAngle - startAngle);
  const range = Math.hypot(dragEnd.x - anchor.x, dragEnd.y - anchor.y);
  return { origin: anchor, startAngle, sweep, range };
}

function build(params: MarkBuildParams): fabric.FabricObject {
  if (params.kind !== "chained-drag") {
    throw new Error(
      `cone.build: expected 'chained-drag' params, got '${params.kind}'`,
    );
  }
  const { anchor, dragStart, dragEnd, color } = params;
  const coneParams = deriveConeParams(anchor, dragStart, dragEnd);
  const d = conePathData(coneParams);
  const path = new fabric.Path(d, {
    fill: color,
    opacity: 1, // overall opacity stays 1; we modulate fill via rgba/opacity below via applyPhase
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeDashArray: undefined,
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: true,
    objectCaching: true,
  });
  writeConeParams(path, coneParams);
  // The fill-opacity / stroke-opacity split below is applied by
  // applyPhase, which is called immediately after build by useMark.
  return path;
}

/**
 * Apply phase-conditioned styling. Cones differentiate phase by
 * (a) fill opacity (15% record / 8% plan) and (b) stroke dash
 * pattern (solid record / dashed plan).
 *
 * fabric.Path doesn't have a native fill-opacity property
 * independent of the object's global `opacity`. We get the effect
 * by translating the fill color to rgba with the appropriate
 * alpha. Stroke alpha stays at 1 so the outline always reads
 * crisply.
 */
function applyPhase(
  obj: fabric.FabricObject,
  phase: "record" | "plan",
): void {
  const path = obj as fabric.Path;
  // The fill at this point is either a hex color (from build) or
  // an rgba (from a prior applyPhase call). Strip back to base
  // hex by reading via `path.stroke` (which is never rewritten as
  // rgba in our code paths) and re-deriving the rgba fill.
  const base = (path.stroke as string | undefined) ?? "#000000";
  const fillOpacity =
    phase === "plan" ? PLAN_FILL_OPACITY : RECORD_FILL_OPACITY;
  path.set({
    fill: hexToRgba(base, fillOpacity),
    strokeDashArray: phase === "plan" ? [...PLAN_DASH] : [...RECORD_DASH],
  });
}

function hexToRgba(hex: string, alpha: number): string {
  // Accept #RGB / #RRGGBB. For any other format (rgb(), already-rgba,
  // named colors) fall back to the input — fabric won't crash on
  // those, the alpha just won't be honored. The strict path covers
  // the operator-color set which is all hex.
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
  const params = readConeParams(obj);
  if (!params) {
    // No params attached — return a zero-shape blob. Round-trip
    // (deserialize) will then no-op since the object has no ConeParams
    // to mutate.
    return { origin: { x: 0, y: 0 }, startAngle: 0, sweep: 0, range: 0 };
  }
  // Spread the params into a plain object so undo's JSON.stringify
  // comparison treats it as data (not a reference share).
  return {
    origin: { x: params.origin.x, y: params.origin.y },
    startAngle: params.startAngle,
    sweep: params.sweep,
    range: params.range,
  };
}

function deserialize(
  obj: fabric.FabricObject,
  state: SerializedState,
): void {
  const s = state as {
    origin: Point;
    startAngle: number;
    sweep: number;
    range: number;
  };
  const params: ConeParams = {
    origin: { x: s.origin.x, y: s.origin.y },
    startAngle: s.startAngle,
    sweep: s.sweep,
    range: s.range,
  };
  writeConeParams(obj, params);
  // Regenerate the SVG path-data string and let fabric reparse it
  // so the underlying geometry caches refresh. fabric.Path.set
  // accepts the new `path` string via the path-data setter (v7).
  const path = obj as fabric.Path;
  const d = conePathData(params);
  // fabric.Path internally accepts an SVG path-data string by
  // re-parsing it through the path-parser; the property is mutable
  // via the standard `set` flow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (path as any).set({ path: parsePath(d) });
  path.setCoords();
}

/**
 * Parse an SVG path-data string into fabric's internal NORMALIZED
 * command-array representation.
 *
 * `fabric.util.parsePath` exists and looks like the right entry
 * point, BUT it returns RAW commands (e.g. SVG `A` arc commands
 * survive as `["A", ...]` entries). fabric's path renderer expects
 * NORMALIZED commands — everything reduced to `M`, `L`, `Q`, `C`,
 * `Z`. fabric's `new Path(d)` constructor runs both the parser AND
 * the normalizer (`util.makePathSimpler`), so its `.path` property
 * holds the renderer-ready form.
 *
 * Using `parsePath` directly here gave us cones with unrendered
 * `A` segments — visually a "thin line" because only the `L`
 * commands drew. Constructing a throwaway `fabric.Path` is the
 * cheapest way to get the normalized form on every fabric version
 * we'd reasonably support.
 *
 * If profiling ever shows this throwaway-allocation cost matters,
 * the alternative is to call `fabric.util.makePathSimpler` directly
 * on `parsePath`'s output — but at one allocation per cone commit
 * or per cone preview frame, the cost is negligible.
 */
export function parsePath(d: string): unknown[] {
  const tmp = new fabric.Path(d);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tmp as any).path as unknown[];
}

const HANDLE_RADIUS = 6;

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
 * Refresh a cone's underlying `fabric.Path` from its `__cone`
 * params. Used by every actionHandler so the control drag updates
 * the visible geometry in real time. Keeps cone.ts as the single
 * source of truth for path-data generation.
 */
function refreshConePath(obj: fabric.Path): void {
  const params = readConeParams(obj);
  if (!params) return;
  const d = conePathData(params);
  // Use the shared parsePath helper that returns NORMALIZED commands
  // (A arcs converted to C). The earlier draft used
  // fabric.util.parsePath directly, which leaves A commands in the
  // array — fabric's path renderer can't draw those, producing the
  // "thin line instead of arc" bug. See parsePath() comment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any).set({ path: parsePath(d) });
  obj.setCoords();
}

/**
 * Per-object control map for a cone — origin / apex / spread.
 * Design doc §10.2.
 *
 *   - origin: at the cone's apex (vertex A). Drag translates the
 *     whole cone (origin updates; startAngle/sweep/range preserved).
 *   - apex: at the midpoint of the arc (origin + range *
 *     bisector). Drag updates the bisector angle θ_b and range;
 *     |sweep| AND its sign are preserved.
 *   - spread: at the first edge endpoint (origin + range *
 *     (cos(startAngle), sin(startAngle))). Drag rotates that
 *     endpoint tangentially around the origin — widening or
 *     narrowing the sweep symmetrically around the bisector
 *     (so the bisector direction stays put), preserving sign.
 *
 * `sweep` stays unclamped (per §15.1 R-D) at all three handles.
 */
function buildControls(
  obj: fabric.FabricObject,
): Record<string, fabric.Control> {
  const path = obj as fabric.Path;

  return {
    origin: new fabric.Control({
      positionHandler: () => {
        const params = readConeParams(path);
        return new fabric.Point(
          params?.origin.x ?? 0,
          params?.origin.y ?? 0,
        );
      },
      actionHandler: (
        _eventData: unknown,
        _transform: unknown,
        x: number,
        y: number,
      ) => {
        const params = readConeParams(path);
        if (!params) return false;
        writeConeParams(path, { ...params, origin: { x, y } });
        refreshConePath(path);
        return true;
      },
      actionName: "modifyOrigin",
      cursorStyleHandler: () => "move",
      render: (ctx, left, top) => renderHandle(ctx, left, top, "#FFFFFF"),
      sizeX: HANDLE_RADIUS * 2,
      sizeY: HANDLE_RADIUS * 2,
      x: 0,
      y: 0,
    }),

    apex: new fabric.Control({
      positionHandler: () => {
        const params = readConeParams(path);
        if (!params) return new fabric.Point(0, 0);
        const θ = params.startAngle + params.sweep / 2;
        return new fabric.Point(
          params.origin.x + params.range * Math.cos(θ),
          params.origin.y + params.range * Math.sin(θ),
        );
      },
      actionHandler: (
        _eventData: unknown,
        _transform: unknown,
        x: number,
        y: number,
      ) => {
        const params = readConeParams(path);
        if (!params) return false;
        const dx = x - params.origin.x;
        const dy = y - params.origin.y;
        const newRange = Math.hypot(dx, dy);
        if (newRange < 1e-6) return false;
        const newθ_b = Math.atan2(dy, dx);
        // New startAngle = bisector - sweep/2 (preserve sweep
        // magnitude AND sign).
        const newStartAngle = newθ_b - params.sweep / 2;
        writeConeParams(path, {
          ...params,
          startAngle: newStartAngle,
          range: newRange,
        });
        refreshConePath(path);
        return true;
      },
      actionName: "modifyApex",
      cursorStyleHandler: () => "crosshair",
      render: (ctx, left, top) => renderHandle(ctx, left, top, "#FFFFFF"),
      sizeX: HANDLE_RADIUS * 2,
      sizeY: HANDLE_RADIUS * 2,
      x: 0,
      y: 0,
    }),

    spread: new fabric.Control({
      positionHandler: () => {
        const params = readConeParams(path);
        if (!params) return new fabric.Point(0, 0);
        return new fabric.Point(
          params.origin.x + params.range * Math.cos(params.startAngle),
          params.origin.y + params.range * Math.sin(params.startAngle),
        );
      },
      actionHandler: (
        _eventData: unknown,
        _transform: unknown,
        x: number,
        y: number,
      ) => {
        const params = readConeParams(path);
        if (!params) return false;
        const dx = x - params.origin.x;
        const dy = y - params.origin.y;
        if (Math.hypot(dx, dy) < 1e-6) return false;
        // Compute the user's intended "first edge angle" from the
        // drag point. That, combined with the EXISTING bisector
        // angle, gives a new sweep that keeps the bisector
        // direction fixed while opening/narrowing the cone.
        const θ_b = params.startAngle + params.sweep / 2;
        const newθ1 = Math.atan2(dy, dx);
        // The new half-sweep is the signed angular distance from
        // the bisector to the new first edge. Use wrapToPi so the
        // user can drag past π/2 and we get a reflex result.
        const newHalfSweep = wrapToPi(θ_b - newθ1);
        // We preserve the bisector direction; the new sweep is
        // 2 * newHalfSweep. The sign of newHalfSweep also matches
        // the sign of the original sweep when the user's drag
        // stays on the same side as the original bisector —
        // intuitive open/close behavior. (Negate to align with the
        // (θ_b − newθ1) sign convention.)
        const newSweep = 2 * newHalfSweep;
        const newStartAngle = θ_b - newSweep / 2;
        writeConeParams(path, {
          ...params,
          startAngle: newStartAngle,
          sweep: newSweep,
        });
        refreshConePath(path);
        return true;
      },
      actionName: "modifySpread",
      cursorStyleHandler: () => "ew-resize",
      render: (ctx, left, top) => renderHandle(ctx, left, top, "#FFFFFF"),
      sizeX: HANDLE_RADIUS * 2,
      sizeY: HANDLE_RADIUS * 2,
      x: 0,
      y: 0,
    }),
  };
}

export const CONE_SPEC: MarkSpec = {
  toolType: ToolType.cone,
  markType: "cone",
  interaction: "chained-drag",
  colorSource: "operator",
  cursor: "crosshair",
  oneShot: true,
  revertTo: ToolType.arrow,
  build,
  applyPhase,
  serialize,
  deserialize,
  buildControls,
};
