import * as fabric from "fabric";
import { useEffect } from "react";

export const useZoom = (
  canvas: fabric.Canvas | null,
  brushWidth: number,
) => {
  useEffect(() => {
    if (!canvas) return;

    const onWheel = (opt: { e: WheelEvent }) => {
      const event = opt.e;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** event.deltaY;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.01) zoom = 0.01;

      canvas.zoomToPoint(
        { x: event.offsetX, y: event.offsetY } as fabric.Point,
        zoom,
      );

      // Keep the apparent stroke width constant in screen pixels regardless
      // of zoom. Only relevant while the pencil is the active drawing tool;
      // adjusting the brush at other times is harmless but conceptually
      // muddled (the previous version did it unconditionally, hence the
      // old "untie zoom from brush" FIXME).
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = brushWidth / zoom;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    canvas.on("mouse:wheel", onWheel);
    return () => {
      canvas.off("mouse:wheel", onWheel);
    };
  }, [canvas, brushWidth]);
};
