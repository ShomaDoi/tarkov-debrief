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
    };
  }, [canvas, tool.type]);

  return { onChoice };
};
