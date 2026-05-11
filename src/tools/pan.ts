// Pan tool with dual-activation paths.
//
// Two ways to pan:
//
//   1. MIDDLE-CLICK quasi-pan (always available regardless of
//      tool.type). The mouse:down handler flips tool.type to pan,
//      attaches a drag listener, mouse:up restores the previous
//      tool. This is the "I want to nudge the view mid-drawing
//      without switching tools" path and predates the keyboard
//      hook.
//
//   2. TOOL-IS-PAN drag. While tool.type === 'pan', LEFT-button
//      drags pan the canvas. The Space-hold quasi-mode in
//      useKeyboardShortcuts flips tool.type to 'pan' on Space-down
//      and back on Space-up; this effect picks up the change and
//      binds left-button drag listeners. Without this path, Space
//      would silently fail to pan (R14 in the design doc).
//
// Implementation oddity: path 1's mouse:down/up handlers are
// registered ONCE per canvas (effect deps = [canvas]) because the
// handler itself flips tool.type — making the effect depend on
// tool.type would tear down the handler mid-drag and break the
// release (the original ref-mirror commentary that used to live
// here). Path 2's left-button drag handlers are bound inside a
// SECOND effect that DOES depend on tool.type, because they're
// only active while tool.type === 'pan'.

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
  // Pan flips the active tool inside its own mouse:down handler. If
  // path-1's useEffect depended on `tool`, the parent re-render that
  // follows setTool(...) would tear down the handlers mid-drag and
  // the mouse:up handler that runs afterwards would see
  // activeRef=false (wiped by the cleanup) and never restore the
  // previous tool. So we register handlers once per canvas and read
  // the live tool / setTool through refs that get updated on every
  // render.
  const toolRef = useRef(tool);
  const setToolRef = useRef(setTool);
  toolRef.current = tool;
  setToolRef.current = setTool;

  const activeRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const prevToolRef = useRef<Tool | null>(null);

  // Path 1: middle-click quasi-pan (always-on).
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

  // Path 2: tool-is-pan drag (Space-hold integration). Only active
  // while tool.type === 'pan'. The keyboard hook flips tool.type to
  // 'pan' on Space-down and the effect runs to bind left-button
  // drag handlers; when Space is released, tool.type reverts and
  // the cleanup detaches.
  //
  // Important: these handlers must NOT clash with path 1. Path 1
  // gates on button===1 and only runs on initial mouse:down; path
  // 2 here gates on button===0. They share `activeRef` /
  // `lastPosRef` / `onDrag`-style logic but with different lifetimes.
  useEffect(() => {
    if (!canvas) return;
    if (tool.type !== ToolType.pan) return;

    let dragging = false;
    let last = { x: 0, y: 0 };

    const onMove = (opt: PointerInfo) => {
      if (!dragging) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      vpt[4] += e.clientX - last.x;
      vpt[5] += e.clientY - last.y;
      canvas.requestRenderAll();
      last = { x: e.clientX, y: e.clientY };
    };

    const onDown = (opt: PointerInfo) => {
      const e = opt.e as MouseEvent;
      // Left button only. Middle is handled by path 1 (and would
      // double-process here otherwise).
      if (typeof e.button === "number" && e.button !== 0) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };

    const onUp = () => {
      dragging = false;
    };

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:move", onMove);
    canvas.on("mouse:up", onUp);
    // Disable drawing mode while pan is active — otherwise fabric's
    // free-drawing brush would draw a stroke as we drag.
    const wasDrawing = canvas.isDrawingMode;
    canvas.isDrawingMode = false;

    return () => {
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:move", onMove);
      canvas.off("mouse:up", onUp);
      canvas.isDrawingMode = wasDrawing;
    };
  }, [canvas, tool.type]);
};
