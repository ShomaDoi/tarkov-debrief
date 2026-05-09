import * as fabric from "fabric";
import { useCallback, useEffect, useRef } from "react";

type Action =
  | { type: "add"; object: fabric.FabricObject }
  | { type: "remove"; object: fabric.FabricObject };

const REPLAY = "__undoReplay" as const;

const isInput = (el: Element | null) =>
  !!el &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    (el as HTMLElement).isContentEditable);

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

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "z") return;
      if (isInput(document.activeElement)) return;
      e.preventDefault();
      onUndo();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      canvas.off("object:added", onAdd);
      canvas.off("object:removed", onRemove);
      window.removeEventListener("keydown", onKey);
    };
  }, [canvas, unerasable, onUndo]);

  return { onUndo };
};
