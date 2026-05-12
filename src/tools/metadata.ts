// Fabric object metadata: operator + phase tagging.
//
// Strokes (pencil paths) and markers (images) carry custom
// properties so we can later:
//   - filter by operator (visibility toggle, see App.tsx +
//     useOperatorVisibility plumbing)
//   - distinguish plan vs record (visual dashArray applied at
//     creation time inside usePencil)
//
// Pattern: fabric objects accept arbitrary JS properties. The
// codebase already uses this pattern for the `REPLAY` sentinel in
// src/tools/undo.ts — see that file for the canonical example.
// Type-cast through `any` is the accepted shape; eslint.config.js
// permits no-explicit-any for fabric integration.
//
// Design reference: claudedocs/design_p0_slice.md §5.3.

import type * as fabric from "fabric";
import type { OperatorId } from "@/state/operators";
import type { Phase } from "@/state/phase";

const OPERATOR_KEY = "__operatorId" as const;
const PHASE_KEY = "__phase" as const;
// MarkType discriminator added in P1. Tagged on every tactical-mark
// fabric object (arrow groups, sightlines, cones, point marks, text)
// so direct-manipulation, undo, eraser, and visibility logic can
// dispatch on it without inspecting the fabric subclass.
// Untagged objects (legacy P0 strokes, fabric.Image markers) read
// back as null — callers treat that as "no special behavior."
// Design reference: claudedocs/design_p1_slice.md §3.6, §4.10.
const MARK_TYPE_KEY = "__markType" as const;

// String literal union rather than enum: keeps the tag value
// stringly-typed for serialization (e.g. future JSON export) without
// dragging in another enum-import dependency. Matches the existing
// Phase = "record"|"plan" pattern.
export type MarkType =
  | "arrow"
  | "sightline"
  | "cone"
  | "engagementX"
  | "soundPing"
  | "positionDot"
  | "text";

// Augment fabric object with custom keys. The keys are deliberately
// double-underscore-prefixed to signal "internal sentinel, not part
// of fabric's public schema."

export function tagObject(
  obj: fabric.FabricObject,
  operatorId: OperatorId | null,
  phase: Phase,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[OPERATOR_KEY] = operatorId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[PHASE_KEY] = phase;
}

export function readOperator(
  obj: fabric.FabricObject,
): OperatorId | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[OPERATOR_KEY];
  // Three possible reads: undefined (untagged, legacy stroke), null
  // (tagged but no active operator at creation time), or a string.
  // We treat undefined the same as null — "no operator association".
  return typeof v === "string" ? v : null;
}

export function readPhase(obj: fabric.FabricObject): Phase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[PHASE_KEY];
  return v === "plan" || v === "record" ? v : "record";
}

// Mark-type tagging. Distinct from tagObject because P0 (operator +
// phase) and P1 (mark-type) were designed in different passes, and
// some callers — e.g. the freehand pencil tool — set operator+phase
// but no mark type. Keeping them as separate calls avoids forcing
// the pencil hook to invent a fake mark-type string.
export function tagMarkType(
  obj: fabric.FabricObject,
  markType: MarkType,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[MARK_TYPE_KEY] = markType;
}

export function readMarkType(obj: fabric.FabricObject): MarkType | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[MARK_TYPE_KEY];
  // Validate against the known set — a stray legacy value or a
  // typo'd write should read back as null rather than smuggling an
  // unknown string further into the system.
  switch (v) {
    case "arrow":
    case "sightline":
    case "cone":
    case "engagementX":
    case "soundPing":
    case "positionDot":
    case "text":
      return v;
    default:
      return null;
  }
}

// Arrow-tip storage. Attached to each arrow group at construction
// time (see tools/arrow.ts) and read by the App-level
// `lastArrowTipRef` recomputer which walks canvas objects in
// reverse on every add/remove to find the most-recent arrow's tip.
//
// Storing the tip on the OBJECT (not just in a ref outside fabric)
// is what makes undo / eraser / redo Just Work for the chain
// anchor: the tip lives wherever the arrow does. If the arrow is
// removed, its tip goes with it; the recomputer picks the next-
// most-recent arrow's tip (or null if there isn't one).
const ARROW_TIP_KEY = "__arrowTip" as const;

export interface ArrowTip {
  x: number;
  y: number;
}

export function tagArrowTip(obj: fabric.FabricObject, tip: ArrowTip): void {
  // Defensive copy — we don't want callers to mutate the polygon's
  // tip vertex and have it propagate into the chain-anchor read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[ARROW_TIP_KEY] = { x: tip.x, y: tip.y };
}

export function readArrowTip(obj: fabric.FabricObject): ArrowTip | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[ARROW_TIP_KEY];
  if (
    v &&
    typeof v === "object" &&
    typeof v.x === "number" &&
    typeof v.y === "number"
  ) {
    return { x: v.x, y: v.y };
  }
  return null;
}
