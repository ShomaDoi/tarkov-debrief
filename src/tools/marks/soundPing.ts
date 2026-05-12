// Sound ping mark — concentric rings indicating "I heard something
// here." Fixed neutral-yellow, parallel rationale to engagement X
// (a heard sound is environmental, not authored). Design doc §3.4.
//
// Three concentric circles with diminishing stroke widths — the
// outer ring is thinnest, the inner thickest, to imply origin.

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams } from "./types";

const PING_YELLOW = "#E6C229";
const RING_RADII = [4, 9, 14] as const;
const RING_STROKES = [2, 1.5, 1] as const;

function build(params: MarkBuildParams): fabric.FabricObject {
  if (params.kind !== "point") {
    throw new Error(
      `soundPing.build: expected 'point' params, got '${params.kind}'`,
    );
  }
  const { at } = params;
  const rings = RING_RADII.map(
    (radius, i) =>
      new fabric.Circle({
        left: at.x - radius,
        top: at.y - radius,
        radius,
        fill: undefined,
        stroke: PING_YELLOW,
        strokeWidth: RING_STROKES[i],
        selectable: false,
        evented: false,
        // originX/Y default to "left"/"top" in fabric v7; we use
        // left = at.x - radius so the ring is centered on `at`.
      }),
  );
  return new fabric.Group(rings, {
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
  // Same opacity rule as engagement X — fixed color, halved opacity
  // for plan-phase pings.
  obj.set({ opacity: phase === "plan" ? 0.5 : 1 });
}

export const SOUND_PING_SPEC: MarkSpec = {
  toolType: ToolType.soundPing,
  markType: "soundPing",
  interaction: "point",
  colorSource: "fixed",
  fixedColor: PING_YELLOW,
  cursor: "crosshair",
  oneShot: false, // sticky
  build,
  applyPhase,
};
