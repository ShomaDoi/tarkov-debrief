// Pencil tool with stroke-metadata tagging.
//
// As of P1, the brush + path:created + tagging lifecycle is shared
// with the new arrow tool via the `useFreehand` factory
// (src/tools/freehand/useFreehand.ts). usePencil is now a thin
// wrapper that supplies a no-postprocess spec and adds the pencil-
// specific color-picker handler (`onColorChoice`).
//
// What stays here vs. moves to useFreehand:
//   - Lifecycle (brush mode, path:created listener, metadata tag):
//     useFreehand.
//   - Ref-mirror for operator + phase: useFreehand.
//   - onColorChoice (react-color integration): here. Pencil is the
//     only freehand tool with a freeform palette picker; arrow's
//     color is driven by the active operator.
//
// What this file does NOT do:
//   - Apply strokeDashArray. That's done on the BRUSH itself via the
//     "Brush strokeDashArray follows phase" effect in src/App.tsx;
//     fabric's PencilBrush.createPath copies brush.strokeDashArray
//     onto the finalized Path. This keeps the live preview in sync
//     with the finalized stroke — single source of truth.
//
// Design references:
//   - claudedocs/design_p0_slice.md §5.4 (where metadata is attached)
//   - claudedocs/design_p1_slice.md §5.1 (useFreehand factory)
//   - claudedocs/design_p1_slice.md §15.1 R-G (refactor decision)

import * as fabric from "fabric";
import { useCallback } from "react";
import { ColorResult } from "react-color";
import { Tool, ToolType, SetToolFn } from "./tool";
import { useFreehand, type FreehandSpec } from "./freehand/useFreehand";
import type { OperatorId } from "@/state/operators";
import type { Phase } from "@/state/phase";
import type { UndoApi } from "./undo";

// The pencil's freehand spec is a degenerate one: no markType (legacy
// P0 strokes carry no markType, and we preserve that), no
// onPathCreated postprocess.
const PENCIL_SPEC: FreehandSpec = {
  toolType: ToolType.pencil,
};

export const usePencil = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
  setColor: (color: string) => void,
  // Defaulted for backward-compat with any caller that hasn't been
  // updated to thread operators/phase. App.tsx threads them all.
  activeOperatorId: OperatorId | null = null,
  phase: Phase = "record",
  // P1 addition. Pencil itself doesn't consume the undo API, but the
  // FreehandSpec interface offers it to postprocesses; we pass null
  // here since pencil has no postprocess.
  undoApi: UndoApi | null = null,
) => {
  const { onChoice } = useFreehand(
    canvas,
    setTool,
    tool,
    PENCIL_SPEC,
    activeOperatorId,
    phase,
    undoApi,
  );

  // Pencil-specific: legacy react-color picker integration. Mutates
  // both the App-level color state AND the brush color directly —
  // duplicate with the App.tsx-level "brush color follows operator"
  // effect, but harmless (last write wins). Preserved from P0 to
  // avoid changing the picker's behavior in P1.
  const onColorChoice = useCallback(
    (color: ColorResult) => {
      setColor(color.hex);
      if (canvas?.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = color.hex;
      }
    },
    [canvas, setColor],
  );

  return { onChoice, onColorChoice };
};
