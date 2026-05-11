// Locked-mode eraser.
//
// Erasure logic lives in src/tools/eraserCore.ts and is shared with
// the right-mouse-hold quasi-eraser in useKeyboardShortcuts. Read
// eraserCore's header comment for the rationale on the extraction.
//
// Button-reservation contract: mouse:down only arms on the LEFT
// button (e.button === 0). Right-button is reserved for the
// quasi-eraser in useKeyboardShortcuts; middle-button is reserved
// for usePan's middle-click pan. See design doc §4.5.

import * as fabric from "fabric";
import type { TPointerEventInfo, TPointerEvent } from "fabric";
import { useEffect, useCallback, useRef } from "react";
import { SetToolFn, Tool, ToolType } from "./tool";
import { createEraserSession, type EraserSession } from "./eraserCore";

export const useEraser = (
  canvas: fabric.Canvas | null,
  setTool: SetToolFn,
  tool: Tool,
  unerasable: Set<string>,
) => {
  // Session is created fresh per effect mount (= per (canvas, tool)
  // transition into eraser). Stored in a ref so the down/up
  // handlers can call it without re-creating.
  const sessionRef = useRef<EraserSession | null>(null);

  const onChoice = useCallback(() => {
    setTool({
      ...tool,
      type: ToolType.eraser,
      cursor: null,
    });
  }, [setTool, tool]);

  useEffect(() => {
    if (tool.type !== ToolType.eraser || !canvas) return;

    const session = createEraserSession(canvas, unerasable);
    sessionRef.current = session;

    const onDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      // Button-reservation contract (§4.5): only the LEFT button
      // arms the locked eraser. Right-button arming happens in
      // useKeyboardShortcuts directly via the shared session, NOT
      // through this effect — see eraserCore.ts header.
      const e = opt.e as MouseEvent;
      if (typeof e.button === "number" && e.button !== 0) return;
      session.start();
    };
    const onUp = () => session.stop();

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:up", onUp);
    canvas.selection = false;

    return () => {
      session.stop();
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:up", onUp);
      sessionRef.current = null;
    };
  }, [tool.type, canvas, unerasable]);

  return { onChoice };
};