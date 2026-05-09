/* Stamp tool places a marker -- scav icon, pmc icon, etc */

import * as fabric from "fabric";
import { useCallback, useEffect, useRef } from "react";
import { SetToolFn, Tool, ToolType } from "./tool";

export const useStamp = (
  canvas: fabric.Canvas | null,
  setSidebar: (visible: boolean) => void,
  tool: Tool,
  setTool: SetToolFn,
) => {
  const markerUrlRef = useRef<string>("");
  const cacheRef = useRef<Record<string, fabric.Image>>({});

  const onChoice = useCallback(
    (evt: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      const target = evt.target as HTMLImageElement;
      markerUrlRef.current = target.src;
      const cursorString = `url("${target.src}"), auto`;

      if (canvas) {
        canvas.defaultCursor = cursorString;
        canvas.hoverCursor = cursorString;
      }

      setTool({ ...tool, type: ToolType.marker });
      setSidebar(false);
    },
    [canvas, setSidebar, setTool, tool],
  );

  useEffect(() => {
    if (!canvas || tool.type !== ToolType.marker) return;

    const placeMarker = async (evt: { e: MouseEvent | TouchEvent }) => {
      if ((evt.e as MouseEvent).altKey) return;
      const url = markerUrlRef.current;
      if (!url) return;

      let cached = cacheRef.current[url];
      if (!cached) {
        cached = await fabric.Image.fromURL(url);
        cacheRef.current[url] = cached;
      }

      const image = await cached.clone();
      // Pin to top-left so the cursor's hotspot lands at the marker corner.
      // (fabric v7 default is center; see e2e/smoke.spec.ts regression note.)
      image.set({ originX: "left", originY: "top" });

      const pointer = canvas.getScenePoint(evt.e);
      image.left = pointer.x;
      image.top = pointer.y;
      image.scale(1 / canvas.getZoom());

      canvas.add(image);
    };

    canvas.on("mouse:down", placeMarker);
    return () => {
      canvas.off("mouse:down", placeMarker);
      canvas.defaultCursor = "auto";
      canvas.hoverCursor = "auto";
    };
  }, [canvas, tool.type]);

  return { onChoice };
};
