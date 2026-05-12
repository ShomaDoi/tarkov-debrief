// Text label mark — operator-colored inline IText editor.
//
// Click on the canvas opens a fabric.IText in edit mode at the click
// point. Empty text auto-deletes on commit; non-empty text persists.
// Design doc §8.
//
// The IText is added to the canvas immediately (in edit mode) so the
// user has a visible cursor to type into. To keep the empty-add and
// auto-delete out of the undo stack, useMark marks the IText
// transient via the §4.10 undo API before adding; on commit (non-
// empty), useMark unmarks transient and pushes a manual recordAdd.

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams } from "./types";

const FONT_FAMILY = "Bender, sans-serif";
const FONT_SIZE = 16;
const PLAN_FONT_STYLE = "italic" as const;
const RECORD_FONT_STYLE = "normal" as const;

function build(params: MarkBuildParams): fabric.FabricObject {
  if (params.kind !== "text") {
    throw new Error(
      `text.build: expected 'text' params, got '${params.kind}'`,
    );
  }
  const { at, color } = params;
  return new fabric.IText("", {
    left: at.x,
    top: at.y,
    fill: color,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: true,
    // Empty text in fabric.IText would otherwise collapse to zero
    // size — keep a small cursor width so the user has somewhere to
    // start typing.
    editable: true,
  });
}

function applyPhase(
  obj: fabric.FabricObject,
  phase: "record" | "plan",
): void {
  const text = obj as fabric.IText;
  text.set({
    fontStyle: phase === "plan" ? PLAN_FONT_STYLE : RECORD_FONT_STYLE,
    // Dashed underline isn't natively supported by fabric.IText;
    // a solid underline is the cleanest fallback for plan-phase
    // labels. Design doc §8.3 acknowledges this fallback.
    underline: phase === "plan",
  });
}

function serialize(obj: fabric.FabricObject) {
  const text = obj as fabric.IText;
  return {
    text: text.text ?? "",
    left: text.left ?? 0,
    top: text.top ?? 0,
  };
}

function deserialize(
  obj: fabric.FabricObject,
  state: Record<string, unknown>,
): void {
  const text = obj as fabric.IText;
  const s = state as { text: string; left: number; top: number };
  text.set({
    text: s.text,
    left: s.left,
    top: s.top,
  });
  text.setCoords();
}

export const TEXT_SPEC: MarkSpec = {
  toolType: ToolType.text,
  markType: "text",
  interaction: "text",
  colorSource: "operator",
  cursor: "text",
  oneShot: true,
  // Text reverts to the previous tool, not arrow — text labels
  // aren't part of the arrow/sightline/cone narrative cycle.
  // (No revertTo set; useMark falls back to previousToolType.)
  build,
  applyPhase,
  // Text supports re-editing through fabric's double-click; we
  // expose serialize/deserialize so a future "track text edits"
  // pass can integrate with useUndo's modify action. Today no
  // direct-manipulation handles touch text labels.
  serialize,
  deserialize,
};
