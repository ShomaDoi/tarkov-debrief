// Custom-fabric-control registration for direct-manipulation marks.
//
// On selection:created, look up each selected object's mark spec
// and ask it for a control map. Install the map onto the object
// and flip its hasControls flag so fabric renders the custom
// handles. The mark's serialize/deserialize pair (consumed by
// useUndo's modify-action path — §4.10) handles undo support
// automatically; this file just wires the controls themselves.
//
// On selection:cleared we don't need to do anything — fabric only
// renders controls for the currently-selected object, so the
// installed map sits dormant on the object until it's re-selected.
//
// Marks WITHOUT a buildControls (arrow, point marks, text) opt out
// at the registry level: getSpecByMarkType returns a spec without
// the field, so the early-return short-circuits. Move-by-body via
// fabric's default selection still works for those marks.
//
// Design reference: claudedocs/design_p1_slice.md §10 (Slice K).

import type * as fabric from "fabric";
import { readMarkType } from "@/tools/metadata";
import { getSpecByMarkType } from "./registry";

type SelectionEvent = { selected?: fabric.FabricObject[] };

/**
 * Install canvas-level subscriptions that apply per-mark controls
 * on selection. Returns a cleanup function for the React effect.
 */
export function registerControls(canvas: fabric.Canvas | null): () => void {
  if (!canvas) return () => {};

  const handleSelected = (e: SelectionEvent) => {
    const selected = e.selected ?? [];
    for (const obj of selected) {
      applyControlsForObject(obj);
    }
  };

  // selection:updated fires when the active selection changes
  // (e.g., shift-click adds an object to a multi-select). Treat
  // it the same — install controls on any newly-included objects.
  canvas.on("selection:created", handleSelected);
  canvas.on("selection:updated", handleSelected);

  return () => {
    canvas.off("selection:created", handleSelected);
    canvas.off("selection:updated", handleSelected);
  };
}

function applyControlsForObject(obj: fabric.FabricObject): void {
  const markType = readMarkType(obj);
  if (markType === null) return; // untagged (legacy strokes, markers)
  const spec = getSpecByMarkType(markType);
  if (!spec?.buildControls) return; // mark doesn't opt into custom controls

  // Install the spec's controls. The mark sets hasControls=false at
  // build time (no controls during a fresh in-flight gesture);
  // re-enable here so fabric renders them while selected.
  obj.controls = spec.buildControls(obj);
  obj.set({ hasControls: true });
  // requestRenderAll so the controls appear immediately rather
  // than waiting for the next interaction tick.
  obj.canvas?.requestRenderAll();
}
