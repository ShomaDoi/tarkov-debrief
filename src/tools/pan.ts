import * as fabric from "fabric";
import type { TPointerEventInfo, TPointerEvent } from "fabric";
import { useEffect, useRef } from "react";
import { SetToolFn, Tool, ToolType } from "./tool";

type PointerInfo = TPointerEventInfo<TPointerEvent>;

export const usePan = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
) => {
  // Pan flips the active tool inside its own mouse:down handler. If the
  // useEffect depended on `tool`, the parent re-render that follows
  // setTool(...) would tear down the handlers mid-drag and the mouse:up
  // handler that runs afterwards would see activeRef=false (wiped by
  // the cleanup) and never restore the previous tool.
  //
  // So we register handlers once per canvas and read the live tool /
  // setTool through refs that get updated on every render.
  const toolRef = useRef(tool);
  const setToolRef = useRef(setTool);
  toolRef.current = tool;
  setToolRef.current = setTool;

  const activeRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const prevToolRef = useRef<Tool | null>(null);

  useEffect(() => {
    if (!canvas) return;

    const onDrag = (opt: PointerInfo) => {
      if (!activeRef.current) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] += e.clientX - lastPosRef.current.x;
      vpt[5] += e.clientY - lastPosRef.current.y;
      canvas.requestRenderAll();
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onStart = (opt: PointerInfo) => {
      const e = opt.e as MouseEvent;
      if (e.button !== 1) return; // middle click only
      e.preventDefault();
      const current = toolRef.current;
      prevToolRef.current = current;
      setToolRef.current({ ...current, type: ToolType.pan });
      activeRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      canvas.isDrawingMode = false;
      canvas.on("mouse:move", onDrag);
    };

    const onStop = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      canvas.off("mouse:move", onDrag);
      const prev = prevToolRef.current;
      if (prev) setToolRef.current({ ...prev });
    };

    canvas.on("mouse:down", onStart);
    canvas.on("mouse:up", onStop);

    return () => {
      canvas.off("mouse:down", onStart);
      canvas.off("mouse:up", onStop);
      canvas.off("mouse:move", onDrag);
    };
  }, [canvas]);
};
