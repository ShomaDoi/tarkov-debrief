import * as fabric from "fabric";
import { useCallback, useEffect } from "react";
import { ColorResult } from "react-color";
import { Tool, ToolType, SetToolFn } from "./tool";

export const usePencil = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
  setColor: (color: string) => void,
) => {
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

    return () => {
      canvas.isDrawingMode = false;
    };
  }, [canvas, tool.type]);

  return { onChoice, onColorChoice };
};
