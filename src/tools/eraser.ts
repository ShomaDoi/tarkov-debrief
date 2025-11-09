import * as fabric from "fabric";
import { useEffect, useRef, useCallback } from "react";
import { SetToolFn, Tool, ToolType } from "./tool";

export const useEraser = (canvas: fabric.Canvas | null, setTool: SetToolFn, tool: Tool, unerasable: Set<string>) => {
  const activeRef = useRef(false);

  const onUse = useCallback((opt: any) => {
    if (tool.type === ToolType.eraser && opt.target !== undefined && activeRef.current) {
      if (
        opt.target instanceof fabric.FabricImage &&
        unerasable.has(opt.target.getSrc())
      ) {
        return;
      }
      canvas?.remove(opt.target!);
    }
  }, [canvas, tool.type, unerasable]);

  const onClick = useCallback(() => {
    activeRef.current = true;
  }, []);

  const onRelease = useCallback(() => {
    activeRef.current = false;
  }, []);

  const onChoice = useCallback(() => {
    setTool({
      ...tool,
      type: ToolType.eraser,
      cursor: null,
    });
  }, [setTool, tool]);

  useEffect(() => {
    if (tool.type === ToolType.eraser && canvas) {
      canvas.on("mouse:move", onUse);
      canvas.on("mouse:down", onClick);
      canvas.on("mouse:up", onRelease);
      canvas.selection = false;

      return () => {
        if (canvas) {
          canvas.off("mouse:move", onUse);
          canvas.off("mouse:down", onClick);
          canvas.off("mouse:up", onRelease);
          activeRef.current = false;
        }
      };
    }
  }, [tool.type, canvas, onUse, onClick, onRelease]);

  return { onChoice, onUse };
};