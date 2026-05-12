// Engagement X mark — fixed-red crossed-lines glyph dropped at the
// click point.
//
// Engagement X carries operator metadata (so the operator-visibility
// toggle still hides it when its author is hidden) but its FILL is
// a fixed tactical red — a contact is a fact, not an authorship
// statement. Design doc §3.4 "Mark color resolution."
//
// Interaction is `point`: single mouse:down commits at the cursor.
// Tool is sticky — tactical narration places sequences of these.

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams } from "./types";

// Tactical red. Distinct from operator palette (operator colors
// excluded red specifically to reserve it here — see operators.ts).
const ENGAGEMENT_RED = "#D0312D";
const ARM_HALF_LENGTH = 8;
const STROKE_WIDTH = 3;

function build(params: MarkBuildParams): fabric.FabricObject {
  if (params.kind !== "point") {
    throw new Error(
      `engagementX.build: expected 'point' params, got '${params.kind}'`,
    );
  }
  const { at } = params;
  // Two crossed lines forming the X. Build them in absolute
  // coordinates and wrap in a Group so the X is one selectable /
  // erasable unit.
  const line1 = new fabric.Line(
    [
      at.x - ARM_HALF_LENGTH,
      at.y - ARM_HALF_LENGTH,
      at.x + ARM_HALF_LENGTH,
      at.y + ARM_HALF_LENGTH,
    ],
    {
      stroke: ENGAGEMENT_RED,
      strokeWidth: STROKE_WIDTH,
      strokeLineCap: "round",
      selectable: false,
      evented: false,
    },
  );
  const line2 = new fabric.Line(
    [
      at.x - ARM_HALF_LENGTH,
      at.y + ARM_HALF_LENGTH,
      at.x + ARM_HALF_LENGTH,
      at.y - ARM_HALF_LENGTH,
    ],
    {
      stroke: ENGAGEMENT_RED,
      strokeWidth: STROKE_WIDTH,
      strokeLineCap: "round",
      selectable: false,
      evented: false,
    },
  );
  return new fabric.Group([line1, line2], {
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
  // Engagement X under `plan` reads as half-opacity. Stays fully red
  // — the color carries the contact semantic regardless of phase.
  obj.set({ opacity: phase === "plan" ? 0.5 : 1 });
}

export const ENGAGEMENT_X_SPEC: MarkSpec = {
  toolType: ToolType.engagementX,
  markType: "engagementX",
  interaction: "point",
  colorSource: "fixed",
  fixedColor: ENGAGEMENT_RED,
  cursor: "crosshair",
  oneShot: false, // sticky — design doc §4.3
  build,
  applyPhase,
};
