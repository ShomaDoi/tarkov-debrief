// Shared erasure machinery.
//
// Two consumers need to erase canvas objects:
//
//   1. useEraser  — locked-mode eraser activated by toolbar / `E`
//                   key. mouse:down arms, mouse:up disarms.
//
//   2. useKeyboardShortcuts — right-mouse-hold quasi-eraser. On
//                   right-mouse-down it must arm the eraser
//                   *synchronously*, before fabric finishes
//                   dispatching the mouse:down event. If we
//                   instead flipped tool.type and waited for
//                   useEraser's effect to re-register, the
//                   triggering mouse:down would have already
//                   passed — see R19 in the design doc.
//
// Both consumers create their own EraserSession; the session owns
// its mouse:move handler and the active flag. The actual erasure
// logic (skip the background image, call canvas.remove) is shared.
//
// Design reference: claudedocs/design_p0_slice.md §4.5.

import * as fabric from "fabric";
import type { TPointerEventInfo, TPointerEvent } from "fabric";

type HoverInfo = TPointerEventInfo<TPointerEvent> & {
  target?: fabric.FabricObject;
};

// Remove `target` from `canvas` unless it's protected. Protection
// = either no target at all (cursor over empty canvas), or the
// target is the loaded map image (its src is in `unerasable`).
export function eraseTargetIfAllowed(
  canvas: fabric.Canvas,
  target: fabric.FabricObject | undefined,
  unerasable: Set<string>,
): void {
  if (!target) return;
  if (
    target instanceof fabric.FabricImage &&
    unerasable.has(target.getSrc())
  ) {
    return;
  }
  canvas.remove(target);
}

export interface EraserSession {
  // Idempotent: starting an already-active session is a no-op.
  // Used directly by the shortcut hook's right-mouse onEnter.
  start(): void;
  // Idempotent: stopping an inactive session is a no-op.
  // Used directly by the shortcut hook's right-mouse onExit.
  stop(): void;
  isActive(): boolean;
}

export function createEraserSession(
  canvas: fabric.Canvas,
  unerasable: Set<string>,
): EraserSession {
  let active = false;

  // Inline closure over `canvas` and `unerasable` so we can attach
  // and detach the same function reference from canvas.on/off.
  const onMove = (opt: HoverInfo) => {
    if (!active) return;
    eraseTargetIfAllowed(canvas, opt.target, unerasable);
  };

  return {
    start() {
      if (active) return;
      active = true;
      canvas.on("mouse:move", onMove);
    },
    stop() {
      if (!active) return;
      active = false;
      canvas.off("mouse:move", onMove);
    },
    isActive() {
      return active;
    },
  };
}
