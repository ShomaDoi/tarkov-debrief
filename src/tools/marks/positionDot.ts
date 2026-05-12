// Position dot mark — a small operator-colored filled circle marking
// "this operator is here" / "hold this position" / "loot here." Unlike
// engagement X and sound ping (which carry intrinsic semantic colors),
// the position dot is unambiguously authorial — whose position is
// being marked is the whole point. Design doc §3.4.

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams } from "./types";

const DOT_RADIUS = 6;
const PLAN_STROKE_WIDTH = 2;

function build(params: MarkBuildParams): fabric.FabricObject {
  if (params.kind !== "point") {
    throw new Error(
      `positionDot.build: expected 'point' params, got '${params.kind}'`,
    );
  }
  const { at, color } = params;
  return new fabric.Circle({
    left: at.x - DOT_RADIUS,
    top: at.y - DOT_RADIUS,
    radius: DOT_RADIUS,
    fill: color,
    stroke: color,
    // strokeWidth: 0 keeps the record-phase dot fully filled; plan
    // phase swaps to a hollow circle via applyPhase below.
    strokeWidth: 0,
    selectable: true,
    evented: true,
    hasControls: false,
    hasBorders: true,
  });
}

function applyPhase(
  obj: fabric.FabricObject,
  phase: "record" | "plan",
): void {
  // record = solid fill; plan = hollow (stroke-only ring). The
  // semantic: "planned position" reads as a marker of an intended
  // location, not an actual one.
  const circle = obj as fabric.Circle;
  if (phase === "plan") {
    circle.set({
      fill: undefined,
      strokeWidth: PLAN_STROKE_WIDTH,
    });
  } else {
    // Restore solid fill. Reuse the stroke color as the fill —
    // build() set stroke = color, so this preserves the operator
    // color regardless of which phase the mark was previously in.
    const color = (circle.stroke as string | undefined) ?? "#000000";
    circle.set({
      fill: color,
      strokeWidth: 0,
    });
  }
}

export const POSITION_DOT_SPEC: MarkSpec = {
  toolType: ToolType.positionDot,
  markType: "positionDot",
  interaction: "point",
  colorSource: "operator",
  cursor: "crosshair",
  oneShot: false, // sticky
  build,
  applyPhase,
};
