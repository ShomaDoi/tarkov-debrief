// Mark-spec types — the shape every tactical-mark definition follows.
//
// `useMark` (./useMark.ts) consumes a `MarkSpec` and runs the
// interaction lifecycle for that mark. Each mark module (sightline,
// cone, engagementX, …) exports one `MarkSpec` plus its own per-mark
// helpers. The central registry (./registry.ts) collects them.
//
// Arrow is NOT a MarkSpec. It's a useFreehand consumer (a curved-
// path tool with a post-`path:created` arrowhead append). See design
// doc §3.2 item 3 and §5.1.
//
// Design references:
//   - claudedocs/design_p1_slice.md §4 (Slice E — shared infrastructure)
//   - claudedocs/design_p1_slice.md §4.10 (undo extension and the
//     serialize/deserialize contract this file declares)

import type * as fabric from "fabric";
import type { ToolType } from "@/tools/tool";
import type { OperatorId } from "@/state/operators";
import type { Phase } from "@/state/phase";
import type { MarkType } from "@/tools/metadata";
import type { Point } from "./geometry";

/**
 * Interaction patterns. Each pattern corresponds to a distinct
 * user-input lifecycle inside `useMark`:
 *
 *   - chained-click: anchor = lastArrowTipRef; cursor rotates a
 *                    preview; single click commits (sightline)
 *   - chained-drag:  anchor = lastArrowTipRef; drag defines arc +
 *                    range (cone)
 *   - point:         single click drops mark (engagement X, ping,
 *                    position dot)
 *   - text:          click opens inline IText editor
 *
 * `two-point` is intentionally absent — arrow uses `useFreehand`
 * instead of `useMark`. See header comment.
 */
export type MarkInteraction =
  | "chained-click"
  | "chained-drag"
  | "point"
  | "text";

/**
 * Color resolution rule. Most marks track the active operator's
 * color; engagement X and sound ping have intrinsic semantic colors
 * (a contact is a fact, not authored). Design doc §3.4.
 */
export type ColorSource = "operator" | "fixed";

/** Discriminated union passed into a spec's `build` function. */
export type MarkBuildParams =
  | { kind: "chained-click"; anchor: Point; end: Point; color: string }
  | {
      kind: "chained-drag";
      anchor: Point;
      dragStart: Point;
      dragEnd: Point;
      color: string;
    }
  | { kind: "point"; at: Point; color: string }
  | { kind: "text"; at: Point; color: string };

/**
 * Per-mark serialized state for the modify-action undo path.
 *
 * Marks that opt into direct-manipulation (Slice K — sightlines and
 * cones in P1) export a `serialize` / `deserialize` pair that
 * round-trips this blob through `JSON`-comparable values. Marks that
 * don't (point marks, text) leave the fields undefined and useUndo
 * silently ignores `object:modified` for them. See design doc §4.10.
 *
 * The shape is per-mark; useUndo treats it opaquely. Each mark
 * module is responsible for type-narrowing its own serialized data
 * in `deserialize`.
 */
export type SerializedState = Record<string, unknown>;

export interface MarkSpec {
  /** The ToolType that activates this mark. */
  toolType: ToolType;
  /** The metadata-layer discriminator for objects this spec builds. */
  markType: MarkType;
  /** Which interaction lifecycle to drive from `useMark`. */
  interaction: MarkInteraction;
  /** Whether the mark inherits operator color or uses a fixed value. */
  colorSource: ColorSource;
  /** Required iff colorSource === "fixed". */
  fixedColor?: string;
  /** Cursor hint while the tool is active (e.g. "crosshair", "cell"). */
  cursor: string;
  /**
   * When true, the tool reverts to a previous-or-revertTo tool after
   * a single commit. When false, the tool stays mounted and accepts
   * further commits.
   *
   * Defaults per design doc §4.3:
   *   - point marks (engagement X, sound ping, position dot): sticky
   *   - chained marks (sightline, cone) + text:                 one-shot
   */
  oneShot: boolean;
  /**
   * If set, `useMark` switches to this tool after a one-shot commit
   * instead of restoring the previous tool. Sightline + cone use this
   * to chain back into arrow (the narrative cycle is arrow → annotate
   * → arrow). See design doc §4.3.
   */
  revertTo?: ToolType;
  /**
   * Build the committed fabric object from the gathered build params.
   * Called once per commit. The returned object is added to the
   * canvas by `useMark` after tagging.
   */
  build: (params: MarkBuildParams) => fabric.FabricObject;
  /**
   * Apply the `plan`-vs-`record` visual treatment to a freshly-built
   * mark. Called by `useMark` right after `build`, before the object
   * enters the canvas / undo stack.
   */
  applyPhase: (obj: fabric.FabricObject, phase: Phase) => void;
  /**
   * Mutate an existing preview object to match new build params
   * during a chained-click drag. Optional: when omitted, `useMark`
   * falls back to the legacy `fabric.Line` x2/y2 mutation (the only
   * other chained-click shape historically — see useMark.ts §
   * chained-click). Marks whose preview is a `fabric.Path` (e.g.
   * sightline post-§refactor) MUST implement this — the legacy
   * fallback silently no-ops on a Path, freezing the preview at
   * zero length.
   */
  updatePreview?: (
    obj: fabric.FabricObject,
    params: MarkBuildParams,
  ) => void;
  /**
   * Optional direct-manipulation hooks. Marks that support handle
   * editing implement both functions; marks that don't omit them and
   * `useUndo` skips `object:modified` for those marks. See §4.10.
   */
  serialize?: (obj: fabric.FabricObject) => SerializedState;
  deserialize?: (obj: fabric.FabricObject, state: SerializedState) => void;
  /**
   * Optional control builder for Slice K (Phase 5). When the user
   * selects an object of this mark type, `registerControls` calls
   * this to get a per-object `fabric.Control` map, which it then
   * installs on the object. Marks that don't expose custom
   * manipulation handles (point marks, text, arrow in P1) omit
   * this — selection falls back to fabric's default move-by-body.
   * See claudedocs/design_p1_slice.md §10.
   */
  buildControls?: (obj: fabric.FabricObject) => Record<string, fabric.Control>;
}

/** Parameters the parent app passes through to `useMark` on each render. */
export interface MarkRuntimeContext {
  activeOperatorId: OperatorId | null;
  phase: Phase;
  /** The cone / sightline chain anchor; null when no arrow exists yet. */
  lastArrowTip: Point | null;
}
