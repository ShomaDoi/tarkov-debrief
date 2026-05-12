// Hook factory for discrete-gesture tactical-mark tools.
//
// One `useMark(spec, options)` invocation per mark type in App.tsx,
// each one parametrized by its MarkSpec. The hook owns the
// interaction lifecycle (event handlers, preview rendering, commit,
// auto-revert) and dispatches to spec.build / spec.applyPhase at
// commit time. Distinct from `useFreehand` (continuous-capture
// pencil/arrow); see design doc §3.2 for the factory split.
//
// In Phase 2 (the current pass) this file implements the
// `chained-click` interaction (sightline). The `chained-drag`,
// `point`, and `text` interactions are added in later phases.
// Their stubs throw at runtime if invoked — easier to catch a
// premature wiring than to silently no-op.
//
// Why `useEffect`-with-spec.toolType as a dep, not a stable spec
// identity: callers pass a memoized spec (see useMark.test.ts —
// the spec is created once and reused). The effect re-runs only
// when the user activates this tool or when the canvas remounts.
//
// Design references:
//   - claudedocs/design_p1_slice.md §4 (Slice E)
//   - claudedocs/design_p1_slice.md §4.5 (chained-click)
//   - claudedocs/design_p1_slice.md §4.6 (chained-drag, Phase 3)
//   - claudedocs/design_p1_slice.md §4.7 / §4.8 (point/text, Phase 4)

import * as fabric from "fabric";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { MarkSpec, MarkBuildParams } from "./types";
import type { SetToolFn, Tool } from "@/tools/tool";
import { ToolType } from "@/tools/tool";
import type { UndoApi } from "@/tools/undo";
import type { OperatorId, Operator } from "@/state/operators";
import type { Phase } from "@/state/phase";
import { tagObject, tagMarkType } from "@/tools/metadata";
import {
  snapAngle,
  sub,
  wrapToPi,
  clamp,
  type Point,
} from "./geometry";
import {
  conePathData,
  writeConeParams,
  type ConeParams,
} from "./cone";

// 15° in radians — the sightline angle snap step.
const SNAP_STEP = Math.PI / 12;
// Minimum drag-distance threshold for committing a chained-drag
// (cone) gesture. Click-cancels below this. Same number we use in
// other drag commit paths.
const MIN_DRAG = 5;
// Full revolution clamp for the cone's signed sweep. Going past
// 2π in either direction would just wrap to a degenerate cone;
// clamping keeps the geometry well-defined. Design doc §6.5.
const TWO_PI = Math.PI * 2;

// Fallback pencil color (matches the constant in App.tsx). Used
// when no operator is active and the spec opts to use operator
// color.
const FALLBACK_COLOR = "#000000";

export interface UseMarkOptions {
  canvas: fabric.Canvas | null;
  tool: Tool;
  setTool: SetToolFn;
  activeOperator: Operator | null;
  activeOperatorId: OperatorId | null;
  phase: Phase;
  lastArrowTipRef: MutableRefObject<Point | null>;
  undo: UndoApi | null;
  /**
   * Shared shortcut-suspension ref (same one MarkerRadial /
   * HotkeysOverlay use). The text-interaction effect flips it on
   * while waiting for the user's click — without this, pressing
   * an unmodified letter (e.g. `a`) before placing the IText
   * matches the arrow binding in App.tsx and tears down the text
   * tool. The textarea gets focus once editing starts, so
   * suspension is redundant from that moment on but harmless to
   * leave true. Optional so non-text marks (which don't need it)
   * can omit it.
   */
  suspendedRef?: { current: boolean };
}

function resolveColor(
  spec: MarkSpec,
  activeOperator: Operator | null,
): string {
  if (spec.colorSource === "fixed") {
    // `fixedColor` is required by the spec contract when
    // colorSource === "fixed"; defensively fall back to the
    // pencil-default if a spec mis-declares.
    return spec.fixedColor ?? FALLBACK_COLOR;
  }
  return activeOperator?.color ?? FALLBACK_COLOR;
}

/**
 * Snap the end direction to multiples of `step` around the anchor.
 * Returns the snapped end point at the same distance from anchor
 * as the original end.
 */
function applyAngleSnap(anchor: Point, end: Point, step: number): Point {
  const d = sub(end, anchor);
  const angle = Math.atan2(d.y, d.x);
  const snapped = snapAngle(angle, step);
  const range = Math.hypot(d.x, d.y);
  return {
    x: anchor.x + range * Math.cos(snapped),
    y: anchor.y + range * Math.sin(snapped),
  };
}

export function useMark(spec: MarkSpec, options: UseMarkOptions) {
  const {
    canvas,
    tool,
    setTool,
    activeOperator,
    activeOperatorId,
    phase,
    lastArrowTipRef,
    undo,
    suspendedRef,
  } = options;

  // Ref-mirror live values so the fabric event handlers (registered
  // once per activation) always read fresh values. Same pattern as
  // pan.ts and the pencil's pre-P1 implementation.
  const activeOperatorRef = useRef(activeOperator);
  const activeOperatorIdRef = useRef(activeOperatorId);
  const phaseRef = useRef(phase);
  activeOperatorRef.current = activeOperator;
  activeOperatorIdRef.current = activeOperatorId;
  phaseRef.current = phase;

  const onChoice = useCallback(() => {
    setTool({ ...tool, type: spec.toolType, cursor: spec.cursor });
  }, [setTool, tool, spec.toolType, spec.cursor]);

  // Track the tool to revert to after a one-shot commit (or Esc).
  // For chained marks (sightline, cone) spec.revertTo is set —
  // always returns to arrow. For non-chained one-shots (text), we
  // restore the *previous* tool instead.
  //
  // The "previous tool" is the value of tool.type from the LAST
  // render (the tool the user was on before they activated us).
  // We track it via a lag-one-render pattern: a ref that holds
  // the prior render's value during the current render's effects,
  // then advances after the effects run. The "advance" effect is
  // declared at the very bottom of this hook so it runs *after*
  // the activation effects within the same render flush. Until
  // it runs, activation effects read the still-stale value, which
  // is exactly the previous tool.
  const previousToolTypeRef = useRef<ToolType>(tool.type);

  // ----- chained-click lifecycle (sightline) ------------------------
  //
  // Activated by the effect below when `tool.type === spec.toolType
  // && spec.interaction === 'chained-click'`. The effect:
  //   1. Reads the chain anchor from lastArrowTipRef.
  //   2. If null, soft-fails (revert to spec.revertTo) and returns.
  //   3. Builds a preview line via spec.build({ kind: 'chained-click',
  //      anchor, end: anchor, color }) and marks it transient + non-
  //      evented so it doesn't enter undo and doesn't intercept mouse
  //      events.
  //   4. Subscribes to canvas mouse:move (update preview), canvas
  //      mouse:down (commit), and window keydown for Esc (cancel).
  //   5. Tears everything down on cleanup.
  //
  // No useState involved — fabric is the source of truth for the
  // preview's geometry; we just mutate it on each mouse:move and
  // rely on canvas.requestRenderAll().

  useEffect(() => {
    if (!canvas) return;
    if (tool.type !== spec.toolType) return;
    if (spec.interaction !== "chained-click") return;

    // Soft-fail when no chain anchor exists yet — design doc §4.5.
    // Revert to `arrow` (spec.revertTo) so the user lands somewhere
    // useful and the toolbar reflects the actual mode.
    const anchor = lastArrowTipRef.current;
    if (anchor === null) {
      // The transient hint UI is App-level; we don't render it from
      // here. The contract is "revert to revertTo (or pencil); the
      // App may surface a hint by watching tool transitions." A
      // future polish slice can add a callback for hints.
      const target = spec.revertTo ?? ToolType.pencil;
      setTool({ ...tool, type: target, cursor: null });
      return;
    }

    // Snapshot the previous tool BEFORE we swap into spec.toolType.
    // It's already-mutated by the time this effect runs (the user
    // hit the binding to activate us), so we rely on the ref the
    // App.tsx keyboard binding sets up. For now we use the spec
    // revertTo unconditionally for chained-click — the contract is
    // "chained marks always loop back to arrow" (§5.3).
    // Snapshot the "previous tool" at activation time. The lag
    // effect at the bottom of this hook will overwrite the ref
    // before commit/Esc fires — we need a stable closure-local
    // copy.
    const previousAtActivation = previousToolTypeRef.current;

    const color = resolveColor(spec, activeOperatorRef.current);

    // Build the initial preview. `end` starts at the anchor (zero-
    // length preview) — the first mouse:move event will move it to
    // the cursor.
    const previewParams: MarkBuildParams = {
      kind: "chained-click",
      anchor,
      end: { ...anchor },
      color,
    };
    const preview = spec.build(previewParams);
    spec.applyPhase(preview, phaseRef.current);
    // Suppress preview events: don't intercept clicks (we want
    // them on the canvas), don't enter selection, don't enter the
    // undo stack on add/remove.
    preview.set({
      selectable: false,
      evented: false,
      hoverCursor: spec.cursor,
    });
    if (undo) undo.markTransient(preview);
    canvas.add(preview);
    canvas.requestRenderAll();

    // Helper for both mouse:move and mouse:down: compute the
    // (possibly snapped) preview end given the current pointer
    // event. Shift inverts the default (sightline default = snap).
    const computeEnd = (e: { e: MouseEvent | TouchEvent }): Point => {
      // canvas.getScenePoint walks the viewport transform so we
      // get scene-space coordinates regardless of pan/zoom.
      const raw = canvas.getScenePoint(e.e);
      // Mouse: Shift held → snap off. Touch: no modifier → keep
      // snap on.
      const shiftHeld =
        e.e instanceof MouseEvent ? (e.e as MouseEvent).shiftKey : false;
      const shouldSnap = !shiftHeld;
      return shouldSnap ? applyAngleSnap(anchor, raw, SNAP_STEP) : raw;
    };

    const onMouseMove = (e: { e: MouseEvent | TouchEvent }) => {
      const end = computeEnd(e);
      // Sightline is a fabric.Line so we mutate x2/y2 directly. If
      // future chained-click marks have a different shape, they'd
      // expose an `updatePreview` hook on the spec; for now, line
      // is the only chained-click shape.
      (preview as fabric.Line).set({ x2: end.x, y2: end.y });
      canvas.requestRenderAll();
    };

    const onMouseDown = (e: { e: MouseEvent | TouchEvent }) => {
      // Only left-click commits (mirrors the button-reservation
      // contract from useStamp / useEraser — design doc §4.5).
      const me = e.e as MouseEvent;
      if (typeof me.button === "number" && me.button !== 0) return;

      const end = computeEnd(e);
      const commitParams: MarkBuildParams = {
        kind: "chained-click",
        anchor,
        end,
        color,
      };
      const committed = spec.build(commitParams);
      tagObject(committed, activeOperatorIdRef.current, phaseRef.current);
      tagMarkType(committed, spec.markType);
      spec.applyPhase(committed, phaseRef.current);

      // Tear down the preview first (its remove is transient, so
      // it doesn't enter the undo stack). Then add the committed
      // mark — its add fires object:added and useUndo records it
      // normally.
      canvas.remove(preview);
      canvas.add(committed);
      canvas.requestRenderAll();

      // Auto-revert to spec.revertTo (or previous tool if unset).
      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      // Cancel the preview without committing; revert to the same
      // tool the commit would've reverted to.
      canvas.remove(preview);
      canvas.requestRenderAll();
      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });
    };

    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:down", onMouseDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:down", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      // If we're tearing down because the user switched tools (not
      // because of a commit), remove the preview. After a commit
      // the preview was already removed; canvas.remove is a safe
      // no-op for already-removed objects.
      canvas.remove(preview);
      canvas.requestRenderAll();
    };
    // The effect depends on `tool.type` to re-run on activation /
    // deactivation. Other deps are either refs (stable identity)
    // or values used only at activation time (anchor captured into
    // closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tool.type, spec.toolType, spec.interaction]);

  // ----- chained-drag lifecycle (cone) -----------------------------
  //
  // Soft-fails identically to chained-click when lastArrowTipRef is
  // null. Differs in the gesture: instead of "single click commits,"
  // the user does mouse:down → drag → mouse:up. During the drag
  // the signed angular sweep around `origin` is integrated frame by
  // frame (design doc §6.5), so reflex sectors round-trip without
  // ambiguity. The preview path is regenerated on every move.
  //
  // Commit on mouse:up. Click-cancel if |cursor - mouseDown| <
  // MIN_DRAG at release.

  useEffect(() => {
    if (!canvas) return;
    if (tool.type !== spec.toolType) return;
    if (spec.interaction !== "chained-drag") return;

    const origin = lastArrowTipRef.current;
    if (origin === null) {
      const target = spec.revertTo ?? ToolType.pencil;
      setTool({ ...tool, type: target, cursor: null });
      return;
    }

    // Snapshot the "previous tool" at activation time. See the
    // chained-click effect above for the rationale; the lag-effect
    // at the bottom of this hook would advance the ref out from
    // under us before commit fires.
    const previousAtActivation = previousToolTypeRef.current;
    const color = resolveColor(spec, activeOperatorRef.current);

    // Drag state. Allocated per activation; mutated by mouse:* and
    // read by the commit path. Held inside the effect closure so
    // teardown's cleanup is straightforward.
    let preview: fabric.FabricObject | null = null;
    let dragStart: Point | null = null;
    let mouseDownClientPoint: Point | null = null;
    let startAngle = 0;
    let prevAngle = 0;
    let sweep = 0;

    /**
     * Build (or rebuild) the preview path from the current
     * `(startAngle, sweep, range)`. The preview is removed and
     * re-added because fabric.Path's internal command array is
     * hard to mutate in place — the path-data string is the
     * cleanest source of truth.
     */
    const refreshPreview = (rangeNow: number) => {
      const params: ConeParams = {
        origin,
        startAngle,
        sweep,
        range: rangeNow,
      };
      // If preview exists, tear it down first. Its remove is
      // transient (marked at creation), so this doesn't pollute
      // the undo stack.
      if (preview) {
        canvas.remove(preview);
      }
      const previewParams: MarkBuildParams = {
        kind: "chained-drag",
        anchor: origin,
        // The build helper computes its own sweep from
        // (anchor, dragStart, dragEnd). For the live preview we
        // need the *integrated* sweep instead, so we build, then
        // overwrite the __cone params and regenerate the path.
        dragStart: dragStart ?? origin,
        dragEnd: {
          x: origin.x + rangeNow * Math.cos(startAngle + sweep),
          y: origin.y + rangeNow * Math.sin(startAngle + sweep),
        },
        color,
      };
      preview = spec.build(previewParams);
      writeConeParams(preview, params);
      // Regenerate the SVG path-data string from the integrated
      // params so the preview reflects reflex sweeps that the
      // single-shot build helper couldn't represent.
      const d = conePathData(params);
      // Get the renderer-ready (normalized) command array. fabric's
      // parsePath returns RAW commands (A arcs survive as ["A",
      // ...] entries) — fabric's renderer can't draw those. The
      // `new fabric.Path(d)` route runs the normalizer that
      // converts A → C; we steal its `.path`. See cone.ts's
      // parsePath() comment for the long-form rationale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cmds = (new fabric.Path(d) as any).path as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (preview as any).set({ path: cmds });
      spec.applyPhase(preview, phaseRef.current);
      preview.set({
        selectable: false,
        evented: false,
      });
      if (undo) undo.markTransient(preview);
      canvas.add(preview);
      canvas.requestRenderAll();
    };

    const onMouseDown = (e: { e: MouseEvent | TouchEvent }) => {
      const me = e.e as MouseEvent;
      if (typeof me.button === "number" && me.button !== 0) return;
      // Don't re-enter if we're already dragging.
      if (dragStart !== null) return;
      const p = canvas.getScenePoint(e.e);
      dragStart = p;
      mouseDownClientPoint = p;
      startAngle = Math.atan2(p.y - origin.y, p.x - origin.x);
      prevAngle = startAngle;
      sweep = 0;
      // Initial preview: degenerate sliver at the drag start.
      refreshPreview(Math.hypot(p.x - origin.x, p.y - origin.y));
    };

    const onMouseMove = (e: { e: MouseEvent | TouchEvent }) => {
      if (dragStart === null) return;
      const p = canvas.getScenePoint(e.e);
      const curAngle = Math.atan2(p.y - origin.y, p.x - origin.x);
      // Integrate signed angular delta. wrapToPi keeps each frame's
      // contribution bounded so the ±π branch-cut crossing doesn't
      // flip the integrated sweep by 2π.
      const dθ = wrapToPi(curAngle - prevAngle);
      sweep = clamp(sweep + dθ, -TWO_PI, TWO_PI);
      prevAngle = curAngle;
      const range = Math.hypot(p.x - origin.x, p.y - origin.y);
      refreshPreview(range);
    };

    const onMouseUp = (e: { e: MouseEvent | TouchEvent }) => {
      if (dragStart === null) return;
      const release = canvas.getScenePoint(e.e);
      const dx = release.x - (mouseDownClientPoint?.x ?? release.x);
      const dy = release.y - (mouseDownClientPoint?.y ?? release.y);
      const clickCancelled = Math.hypot(dx, dy) < MIN_DRAG;

      // Always remove the preview — its remove is transient.
      if (preview) {
        canvas.remove(preview);
        preview = null;
      }

      if (clickCancelled) {
        // No commit; tool stays mounted (the spec.oneShot revert
        // only fires on a successful commit).
        dragStart = null;
        canvas.requestRenderAll();
        return;
      }

      // Commit the cone with the FINAL integrated params. We
      // bypass spec.build's wrapToPi-based derivation (which can't
      // see reflex sectors) and construct the ConeParams ourselves.
      const range = Math.hypot(
        release.x - origin.x,
        release.y - origin.y,
      );
      const finalParams: ConeParams = {
        origin,
        startAngle,
        sweep,
        range,
      };
      // Still call spec.build to get a styled fabric.Path with the
      // operator-color stroke + selection flags + initial fill.
      // Then overwrite the params and regenerate the path-data.
      const committed = spec.build({
        kind: "chained-drag",
        anchor: origin,
        // Provide dragStart / dragEnd that match the integrated
        // sweep for any future spec.build implementations that
        // re-derive them; cone.ts's deriveConeParams will compute
        // a wrapToPi-based sweep that we then overwrite below.
        dragStart: {
          x: origin.x + range * Math.cos(startAngle),
          y: origin.y + range * Math.sin(startAngle),
        },
        dragEnd: {
          x: origin.x + range * Math.cos(startAngle + sweep),
          y: origin.y + range * Math.sin(startAngle + sweep),
        },
        color,
      });
      writeConeParams(committed, finalParams);
      // Regenerate the SVG path-data string from the integrated
      // params (reflex-safe). Use new fabric.Path(d).path to get
      // normalized commands — parsePath leaves A arcs unrendered.
      // See cone.ts parsePath() comment.
      const d = conePathData(finalParams);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cmds = (new fabric.Path(d) as any).path as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (committed as any).set({ path: cmds });
      tagObject(committed, activeOperatorIdRef.current, phaseRef.current);
      tagMarkType(committed, spec.markType);
      spec.applyPhase(committed, phaseRef.current);

      canvas.add(committed);
      canvas.requestRenderAll();

      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });

      dragStart = null;
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (preview) {
        canvas.remove(preview);
        preview = null;
      }
      dragStart = null;
      canvas.requestRenderAll();
      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      if (preview) {
        canvas.remove(preview);
        canvas.requestRenderAll();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tool.type, spec.toolType, spec.interaction]);

  // ----- point lifecycle (engagement X / sound ping / position dot) -
  //
  // Single mouse:down commits at the cursor. Sticky by default
  // (spec.oneShot === false) — tool stays active so the user can
  // drop a sequence of marks. Design doc §4.7.

  useEffect(() => {
    if (!canvas) return;
    if (tool.type !== spec.toolType) return;
    if (spec.interaction !== "point") return;

    // Snapshot the "previous tool" at activation time so a one-shot
    // commit reverts to the right target. (No P1 point marks are
    // one-shot, but the snapshot keeps the spec.oneShot branch
    // consistent with the other interaction types.)
    const previousAtActivation = previousToolTypeRef.current;

    const onMouseDown = (e: { e: MouseEvent | TouchEvent }) => {
      // Button-reservation: left-only. Right is the eraser
      // quasi-mode (§4.5).
      const me = e.e as MouseEvent;
      if (typeof me.button === "number" && me.button !== 0) return;

      const at = canvas.getScenePoint(e.e);
      const color = resolveColor(spec, activeOperatorRef.current);
      const committed = spec.build({ kind: "point", at, color });
      tagObject(committed, activeOperatorIdRef.current, phaseRef.current);
      tagMarkType(committed, spec.markType);
      spec.applyPhase(committed, phaseRef.current);
      canvas.add(committed);
      canvas.requestRenderAll();

      // One-shot point marks (none in P1, but the spec field is
      // honored for future use) revert to previous tool here.
      if (spec.oneShot) {
        const target = spec.revertTo ?? previousAtActivation;
        setTool({ ...tool, type: target, cursor: null });
      }
      // Otherwise (sticky): tool stays mounted; the next mouse:down
      // drops another mark.
    };

    canvas.on("mouse:down", onMouseDown);
    return () => {
      canvas.off("mouse:down", onMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tool.type, spec.toolType, spec.interaction, spec.oneShot]);

  // ----- text lifecycle ---------------------------------------------
  //
  // mouse:down creates an IText in edit mode at the cursor. The
  // IText is marked transient so neither its initial empty-add nor
  // a possible auto-delete-on-empty enters the undo stack. Commit
  // on `editing:exited`: if the final text is non-empty, unmark
  // transient + tag + recordAdd; if empty, canvas.remove (still
  // transient, so silently skipped from undo).

  useEffect(() => {
    if (!canvas) return;
    if (tool.type !== spec.toolType) return;
    if (spec.interaction !== "text") return;

    // Snapshot the previous tool. Text is one-shot and falls back
    // to the previous tool (spec.revertTo is unset for TEXT_SPEC).
    const previousAtActivation = previousToolTypeRef.current;

    // Track the in-flight IText so we can attach editing:exited
    // ONCE, and so a tool teardown during edit can clean up.
    let editing: fabric.IText | null = null;

    const handleEditingExited = () => {
      if (!editing) return;
      const it = editing;
      editing = null;
      const finalText = (it.text ?? "").trim();
      if (finalText === "") {
        // Auto-delete: still transient, so remove is silently
        // skipped by useUndo.
        canvas.remove(it);
        canvas.requestRenderAll();
      } else {
        // Commit: unmark transient, tag with metadata, push a
        // manual add to the undo stack (no fresh object:added
        // will fire — the IText is already on the canvas).
        if (undo) undo.unmarkTransient(it);
        tagObject(it, activeOperatorIdRef.current, phaseRef.current);
        tagMarkType(it, spec.markType);
        spec.applyPhase(it, phaseRef.current);
        if (undo) undo.recordAdd(it);
        canvas.requestRenderAll();
      }
      // Auto-revert to the previous tool. Text is one-shot.
      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });
    };

    const onMouseDown = (e: { e: MouseEvent | TouchEvent }) => {
      const me = e.e as MouseEvent;
      if (typeof me.button === "number" && me.button !== 0) return;
      // If we already have an in-flight editor, ignore additional
      // clicks (let the existing edit complete first).
      if (editing) return;

      const at = canvas.getScenePoint(e.e);
      const color = resolveColor(spec, activeOperatorRef.current);
      const it = spec.build({ kind: "text", at, color }) as fabric.IText;
      // Pre-style the editor by phase so the live preview matches
      // the eventual commit.
      spec.applyPhase(it, phaseRef.current);
      // Mark transient BEFORE add so the empty-text add is invisible
      // to undo (design doc §8.2). We unmark on commit if the text
      // is non-empty.
      if (undo) undo.markTransient(it);
      canvas.add(it);
      it.enterEditing();
      // Some fabric versions don't auto-focus the hidden textarea
      // on enterEditing in headless test environments. Calling focus
      // explicitly is harmless in real browsers and fixes the
      // headless case.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hiddenTextarea = (it as any).hiddenTextarea as
        | HTMLTextAreaElement
        | undefined;
      hiddenTextarea?.focus();

      it.on("editing:exited", handleEditingExited);
      editing = it;
    };

    // Suspend the global shortcut hook while the text tool is
    // active. Without this, pressing an unmodified letter (e.g.
    // `a`) BEFORE the user has clicked to place the IText would
    // match the arrow binding in App.tsx, switch the active
    // tool, and tear text mode down — the user perceives this as
    // "I typed and it popped me out." Once they click and the
    // IText takes focus, useKeyboardShortcuts's `isInput` guard
    // handles things on its own; suspension is redundant from
    // that moment on but harmless to leave on.
    if (suspendedRef) suspendedRef.current = true;

    // Esc cancels text mode WHEN NO IText is in flight yet — gives
    // the user an out from "I pressed T by accident." When an
    // IText IS editing, Esc is consumed by fabric.IText's own
    // keysMap (keyCode 27 → exitEditing) and fires editing:exited
    // through the normal path. Window-level so we catch it
    // regardless of focus.
    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (editing) return; // fabric.IText handles Esc during edit
      ev.preventDefault();
      const target = spec.revertTo ?? previousAtActivation;
      setTool({ ...tool, type: target, cursor: null });
    };

    canvas.on("mouse:down", onMouseDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      canvas.off("mouse:down", onMouseDown);
      window.removeEventListener("keydown", onWindowKeyDown);
      if (suspendedRef) suspendedRef.current = false;
      if (editing) {
        // Switching tools during an edit: exit gracefully. The
        // editing:exited handler fires synchronously from
        // exitEditing, taking the standard commit-or-delete path.
        editing.exitEditing();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tool.type, spec.toolType, spec.interaction]);

  // Lag effect: shift the "previous tool" tracker forward AFTER the
  // activation effects above have run. By declaration order, this
  // effect runs last in the same flush, so the activation effects
  // see the still-stale value (= what tool the user was on BEFORE
  // they activated this mark), then this effect advances the ref
  // for the next round.
  useEffect(() => {
    previousToolTypeRef.current = tool.type;
  });

  return { onChoice };
}
