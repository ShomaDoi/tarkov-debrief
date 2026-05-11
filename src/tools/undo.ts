// Undo: the data side of the action stack.
//
// What stays here: the stack itself, the object:added / object:removed
// subscriptions that populate it, the REPLAY sentinel that prevents
// undo from feeding itself, and the onUndo callback.
//
// What moved out: the window keydown listener. Cmd/Ctrl+Z is now
// bound through useKeyboardShortcuts in App.tsx — see
// src/hooks/useKeyboardShortcuts.ts. The migration is atomic
// (design doc §4.6): if both listeners are ever live at the same
// time, undo will double-fire (R11). The acceptance check in §11
// covers this.
//
// Design reference: claudedocs/design_p0_slice.md §4.6.

import * as fabric from "fabric";
import { useCallback, useEffect, useRef } from "react";

type Action =
  | { type: "add"; object: fabric.FabricObject }
  | { type: "remove"; object: fabric.FabricObject };

// Sentinel attached to fabric objects during an undo replay so the
// object:added / object:removed listeners don't push the replay
// action back onto the stack (which would create an infinite ping-
// pong). Same pattern as the metadata helpers in tools/metadata.ts.
const REPLAY = "__undoReplay" as const;

export const useUndo = (
  canvas: fabric.Canvas | null,
  unerasable: Set<string>,
) => {
  const stack = useRef<Action[]>([]);

  const onUndo = useCallback(() => {
    if (!canvas) return;
    const action = stack.current.pop();
    if (!action) return;

    (action.object as unknown as Record<string, unknown>)[REPLAY] = true;
    if (action.type === "add") {
      canvas.remove(action.object);
    } else {
      canvas.add(action.object);
    }
    delete (action.object as unknown as Record<string, unknown>)[REPLAY];
    canvas.requestRenderAll();
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;

    const onAdd = ({ target }: { target: fabric.FabricObject }) => {
      if ((target as unknown as Record<string, unknown>)[REPLAY]) return;
      // The loaded map image is in `unerasable` (set up in App.tsx);
      // it must not enter the undo stack or else Ctrl+Z would
      // "undo" the map itself.
      if (target instanceof fabric.Image && unerasable.has(target.getSrc())) {
        return;
      }
      stack.current.push({ type: "add", object: target });
    };

    const onRemove = ({ target }: { target: fabric.FabricObject }) => {
      if ((target as unknown as Record<string, unknown>)[REPLAY]) return;
      stack.current.push({ type: "remove", object: target });
    };

    canvas.on("object:added", onAdd);
    canvas.on("object:removed", onRemove);

    return () => {
      canvas.off("object:added", onAdd);
      canvas.off("object:removed", onRemove);
    };
  }, [canvas, unerasable]);

  return { onUndo };
};
