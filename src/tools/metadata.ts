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
// MarkType discriminator added in P1, extended in P2.
// Tagged on every tactical-mark fabric object (arrow groups,
// sightlines, cones, point marks, text) plus — as of P2 — pencil
// strokes. Used by direct-manipulation, undo, eraser, visibility,
// and the P2 replay animator dispatcher (see
// src/tools/marks/animators.ts) so they can dispatch without
// inspecting fabric subclasses.
// Untagged objects (the loaded map image, legacy fabric.Image
// markers) read back as null — callers treat that as "no special
// behavior."
// Design references:
//   - claudedocs/design_p1_slice.md §3.6, §4.10
//   - claudedocs/design_p2_slice.md §4.2 (pencil/arrow tagged so
//     the animator dispatch has a reliable key)
const MARK_TYPE_KEY = "__markType" as const;
// Mark identity fields added in P2. Every tagged object carries
// a stable globally-unique id (used as a primary key by the
// replay timeline and by future cooperative-editing sync) and a
// monotonic per-session sequence number (defines creation order
// for the replay timeline projection — see timeline.ts).
// Design reference: claudedocs/design_p2_slice.md §3.4, §4.2.
const ID_KEY = "__id" as const;
const SEQ_KEY = "__seq" as const;

// Module-scoped monotonic counter. Incremented on every tagObject
// call; never resets within a session. Map switch does NOT reset
// it — the timeline only needs monotonicity across the session,
// and maps share the session. Full page reload re-initializes the
// module and the counter restarts from 1.
//
// This is deliberately a JS module-level value rather than React
// state: the counter is consumed inside fabric handlers and at
// canvas-add time, neither of which has a clean React state hook
// position. The Lamport-style "this session's mark #N" semantic
// only requires monotonicity, which a plain integer gives us.
let nextSeq = 1;

// String literal union rather than enum: keeps the tag value
// stringly-typed for serialization (e.g. future JSON export) without
// dragging in another enum-import dependency. Matches the existing
// Phase = "record"|"plan" pattern.
export type MarkType =
  | "pencil"
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
  // P2: assign identity + sequence. Both are write-once — every
  // re-tagObject would generate a new id/seq, which is wrong for
  // any object that's already in the timeline. tagObject is only
  // called from create-time paths today (the freehand path:created
  // handler, each MarkSpec.build), so this guard catches accidental
  // double-tags rather than papering over a real bug.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bag = obj as any;
  if (typeof bag[ID_KEY] !== "string") {
    bag[ID_KEY] = generateId();
    bag[SEQ_KEY] = nextSeq++;
  }
}

// Indirected so test setup can swap to a deterministic id source if
// needed; the production path always uses crypto.randomUUID().
function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older
  // jsdom in particular). Sufficient for in-session uniqueness; not
  // cryptographically strong but the use case isn't cryptographic.
  return (
    "mark-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
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

/**
 * Read the per-mark stable identifier. Returns null for objects
 * that were never tagged (legacy strokes from before P2, the
 * loaded map image). Stable across the mark's lifetime — every
 * subscriber that needs to refer to a mark across events (timeline
 * projection, future cooperative sync) reads through this.
 */
export function readId(obj: fabric.FabricObject): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[ID_KEY];
  return typeof v === "string" ? v : null;
}

/**
 * Read the per-mark sequence number. Returns null for untagged
 * objects. Sequence is module-scoped monotonic — comparing two
 * non-null seqs gives a strict total order matching creation
 * order. Used by the timeline projection (timeline.ts) and the
 * chained-anchor recomputer in App.tsx (which currently iterates
 * by canvas order, but could switch to seq order if reordering
 * ever becomes necessary).
 */
export function readSeq(obj: fabric.FabricObject): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[SEQ_KEY];
  return typeof v === "number" ? v : null;
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
    case "pencil":
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
