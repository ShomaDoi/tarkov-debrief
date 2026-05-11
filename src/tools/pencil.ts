// Pencil tool with stroke-metadata tagging.
//
// Refactored in Phase 4: gains ref-mirrored access to the currently
// active operator and phase. We can't read them as plain props
// inside the fabric `path:created` handler because that handler
// outlives React renders — by the time it runs, the captured
// `activeOperatorId`/`phase` may be stale. The ref-mirror pattern
// (canonical example: src/tools/pan.ts toolRef/setToolRef) keeps
// the handler reading the live values.
//
// What gets attached:
//   - operatorId: tag for filtering / visibility (see §5.6)
//   - phase: "plan" or "record"; plan-phase strokes additionally
//     get a strokeDashArray applied post-creation
//
// Design references:
//   - claudedocs/design_p0_slice.md §5.4 (where metadata is
//     attached — path:created not object:added)
//   - claudedocs/design_p0_slice.md §6.3 (dashArray behavior)

import * as fabric from "fabric";
import { useCallback, useEffect, useRef } from "react";
import { ColorResult } from "react-color";
import { Tool, ToolType, SetToolFn } from "./tool";
import { tagObject } from "./metadata";
import type { OperatorId } from "@/state/operators";
import type { Phase } from "@/state/phase";

export const usePencil = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
  setColor: (color: string) => void,
  // Phase 4 additions. Defaults make the hook backward-compatible
  // for the (transient) period before App.tsx threads them in.
  activeOperatorId: OperatorId | null = null,
  phase: Phase = "record",
) => {
  // Ref-mirror so the path:created handler reads live values, not
  // a stale closure captured at effect-mount time.
  const operatorRef = useRef<OperatorId | null>(activeOperatorId);
  const phaseRef = useRef<Phase>(phase);
  operatorRef.current = activeOperatorId;
  phaseRef.current = phase;

  const onChoice = useCallback(() => {
    setTool({ ...tool, type: ToolType.pencil, cursor: null });
  }, [setTool, tool]);

  const onColorChoice = useCallback(
    (color: ColorResult) => {
      setColor(color.hex);
      if (canvas?.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = color.hex;
      }
    },
    [canvas, setColor],
  );

  useEffect(() => {
    if (!canvas || tool.type !== ToolType.pencil) return;

    canvas.isDrawingMode = true;

    // Tag freshly-created paths with the current operator + phase.
    // We use fabric's `path:created` (fires once per completed
    // stroke) rather than `object:added` because we want to mutate
    // the path before any other listener sees it — see design doc
    // §5.4. The `object:added` listener in useUndo runs AFTER this
    // and reads the path as-tagged, which is correct.
    //
    // Note: strokeDashArray is intentionally NOT applied here.
    // It's set on the brush itself by the "Brush strokeDashArray
    // follows phase" effect in src/App.tsx, and fabric's
    // PencilBrush.createPath copies brush.strokeDashArray onto the
    // finalized Path automatically (PencilBrush.ts line 231). This
    // keeps the live preview in sync with the finalized stroke
    // (both come from a single source of truth — the brush
    // setting).
    const onPathCreated = (opt: { path: fabric.FabricObject }) => {
      tagObject(opt.path, operatorRef.current, phaseRef.current);
    };
    canvas.on("path:created", onPathCreated);

    return () => {
      canvas.isDrawingMode = false;
      canvas.off("path:created", onPathCreated);
    };
  }, [canvas, tool.type]);

  return { onChoice, onColorChoice };
};
