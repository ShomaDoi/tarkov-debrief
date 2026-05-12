// Sightline mark — straight dashed line representing line of sight /
// line of fire, anchored at the most-recent arrow tip.
//
// Interaction is chained-click (design doc §4.5): on tool activation
// the preview emanates from `lastArrowTipRef.current`; the cursor
// rotates the preview live (with 15° snap by default; Shift disables
// snap); a single click commits the line and the tool auto-reverts
// to arrow.
//
// Phase treatment (design doc §3.5):
//   - record: dash [6, 6] — the default
//   - plan:   dash [4, 4] — tighter dash distinguishes plan from
//                           record at a glance
//
// Spec exposes a `serialize` / `deserialize` pair so Slice K
// direct-manipulation handle drags become undoable (design doc
// §4.10). The serialized blob is `{ x1, y1, x2, y2 }` — small,
// JSON-clean.

import * as fabric from "fabric";
import { ToolType } from "@/tools/tool";
import type { MarkSpec, MarkBuildParams } from "./types";
import { snapAngle } from "./geometry";

const STROKE_WIDTH = 1.5;
const RECORD_DASH: [number, number] = [6, 6];
const PLAN_DASH: [number, number] = [4, 4];
const HANDLE_RADIUS = 6;
const SNAP_STEP = Math.PI / 12;

function build(params: MarkBuildParams): fabric.FabricObject {
  // The runtime kind is enforced by the spec's `interaction` field
  // matching the params we receive. The switch here defends against
  // a misuse from a future refactor — better to fail loudly than to
  // commit a half-built object.
  if (params.kind !== "chained-click") {
    throw new Error(
      `sightline.build: expected 'chained-click' params, got '${params.kind}'`,
    );
  }
  const { anchor, end, color } = params;
  return new fabric.Line([anchor.x, anchor.y, end.x, end.y], {
    stroke: color,
    strokeWidth: STROKE_WIDTH,
    strokeDashArray: [...RECORD_DASH],
    selectable: true,
    evented: true,
    // No custom controls in P1 yet; Slice K (Phase 5) wires the
    // endpoint handle. Default scaling/rotation corners stay hidden
    // for the same reason as arrow (§10.2): they don't make sense
    // for a chained mark and would invite a class of accidental
    // edits.
    hasControls: false,
    hasBorders: true,
    // No fill — fabric.Line has no body to fill, but setting it
    // explicitly stops fabric from inferring one.
    fill: undefined,
  });
}

function applyPhase(obj: fabric.FabricObject, phase: "record" | "plan"): void {
  // Sightlines are dashed regardless of phase; what changes is the
  // dash density. record = breathy; plan = tight.
  const line = obj as fabric.Line;
  line.set({
    strokeDashArray: phase === "plan" ? [...PLAN_DASH] : [...RECORD_DASH],
  });
}

// Serialize the editable shape — just the four endpoint coordinates.
// `anchor` is also implicit in (x1, y1) but we don't store it
// separately because the line's geometry IS its endpoints.
function serialize(obj: fabric.FabricObject) {
  const line = obj as fabric.Line;
  return {
    x1: line.x1 ?? 0,
    y1: line.y1 ?? 0,
    x2: line.x2 ?? 0,
    y2: line.y2 ?? 0,
  };
}

function deserialize(
  obj: fabric.FabricObject,
  state: Record<string, unknown>,
): void {
  const line = obj as fabric.Line;
  const { x1, y1, x2, y2 } = state as Record<string, number>;
  line.set({ x1, y1, x2, y2 });
  line.setCoords();
}

/**
 * Render a small circular handle at (left, top) in screen-space.
 * Reused by the endpoint control's render hook.
 */
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
 * Build the per-object control map for a sightline. Only the
 * cursor-side endpoint is editable; the anchor end is frozen, body
 * is non-draggable (design doc §10.2).
 *
 * The endpoint's screen position is computed each render by
 * mapping (x2, y2) through the canvas viewport transform — fabric
 * exposes that via `fabric.util.transformPoint`. We use the line's
 * own coords directly (they're in canvas scene space) and let
 * fabric's positionHandler signature handle the screen-coord
 * conversion.
 */
function buildControls(
  obj: fabric.FabricObject,
): Record<string, fabric.Control> {
  return {
    endpoint: new fabric.Control({
      // positionHandler returns the control's CENTER in canvas-
      // scene coordinates. fabric multiplies by the viewport
      // transform to get screen pixels for rendering and
      // hit-testing.
      positionHandler: () => {
        const line = obj as fabric.Line;
        return new fabric.Point(line.x2 ?? 0, line.y2 ?? 0);
      },
      // actionHandler fires on every mouse:move during the drag.
      // (eventData, transform, x, y) — x/y are in scene coords.
      // The actionHandler returns whether the action mutated the
      // object; fabric uses that to suppress redundant `object:
      // modified` events.
      actionHandler: (
        eventData: MouseEvent | TouchEvent,
        _transform: unknown,
        x: number,
        y: number,
      ) => {
        const line = obj as fabric.Line;
        const anchorX = line.x1 ?? 0;
        const anchorY = line.y1 ?? 0;
        // Apply 15° snap from anchor unless Shift is held. Mirrors
        // the creation-time snap (see useMark.ts chained-click).
        // Touch events have no shiftKey; default to "snap on".
        const shiftHeld =
          eventData instanceof MouseEvent ? eventData.shiftKey : false;
        if (shiftHeld) {
          line.set({ x2: x, y2: y });
        } else {
          const dx = x - anchorX;
          const dy = y - anchorY;
          const range = Math.hypot(dx, dy);
          const snapped = snapAngle(Math.atan2(dy, dx), SNAP_STEP);
          line.set({
            x2: anchorX + range * Math.cos(snapped),
            y2: anchorY + range * Math.sin(snapped),
          });
        }
        line.setCoords();
        return true;
      },
      actionName: "modifyEndpoint",
      cursorStyleHandler: () => "crosshair",
      render: (ctx, left, top) => {
        // White-filled handle reads against both light and dark
        // map backgrounds. Stroke supplies contrast on the white.
        renderHandle(ctx, left, top, "#FFFFFF");
      },
      sizeX: HANDLE_RADIUS * 2,
      sizeY: HANDLE_RADIUS * 2,
      // The endpoint control's logical attachment point in object-
      // local coords. fabric uses these when its internal bounding-
      // box logic positions a control; we override via
      // positionHandler so the actual values don't matter, but the
      // class wants them.
      x: 0,
      y: 0,
    }),
  };
}

export const SIGHTLINE_SPEC: MarkSpec = {
  toolType: ToolType.sightline,
  markType: "sightline",
  interaction: "chained-click",
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
