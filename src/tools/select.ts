import * as fabric from "fabric";
import { useCallback, useEffect } from "react";
import { Tool, ToolType, SetToolFn } from "./tool";

export const useSelect = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
) => {
  const onChoice = useCallback(() => {
    setTool({ ...tool, type: ToolType.select, cursor: null });
  }, [setTool, tool]);

  useEffect(() => {
    if (!canvas || tool.type !== ToolType.select) return;

    canvas.selection = true;
    canvas.perPixelTargetFind = false;

    return () => {
      canvas.selection = false;
      canvas.perPixelTargetFind = true;
      // CRITICAL: discard the active object. fabric retains
      // `activeObject` across tool switches; if we leave it set,
      // the next tool's click on the still-selected object's
      // hitbox is interpreted by fabric as "drag the active
      // object" rather than reaching the new tool's mouse:down
      // handler. Symptom users see: "stuck in selection" — after
      // V → click → B (or any other non-select tool), drawing
      // doesn't start because clicking on the previously-selected
      // mark just drags it.
      //
      // discardActiveObject also fires selection:cleared, which
      // tells Slice K's controls.ts to take down the active-
      // object's custom handles. requestRenderAll redraws the
      // canvas without the selection bounding box.
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };
  }, [canvas, tool.type]);

  return { onChoice };
};
