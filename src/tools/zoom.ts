import * as fabric from "fabric";
import { useEffect } from "react";
import { dashArrayForZoom } from "./dashCompensation";

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
      //
      // Note: we intentionally do NOT recompensate dashArrays on
      // existing plan-phase paths. Existing paths' dash patterns are
      // baked in canvas units at creation time and scale naturally
      // with the viewport — same semantics as any other canvas
      // object. The compensation only runs at path:created
      // (src/tools/pencil.ts) so a new stroke drawn at the current
      // zoom matches the configured screen-pixel pattern.
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = brushWidth / zoom;
        // Same idea for the live planning-stroke dash pattern —
        // recompute so the gaps stay visually constant in screen px
        // across the zoom transition. Only touch when active; null
        // means record phase. The brush's dashArray drives the live
        // preview; see src/App.tsx's "Brush strokeDashArray follows
        // phase" effect for the canonical setter.
        if (canvas.freeDrawingBrush.strokeDashArray) {
          canvas.freeDrawingBrush.strokeDashArray = dashArrayForZoom(zoom);
        }
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
