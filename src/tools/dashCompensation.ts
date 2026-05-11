// Dash-array zoom compensation — for NEW plan-phase strokes only.
//
// Semantics:
//   - At the moment a plan-phase stroke is created, we want its
//     dash pattern to look like PLAN_DASH_ARRAY at the CURRENT
//     zoom (i.e. screen-pixel values).
//   - After creation, the stroke's dashArray is canvas-unit-fixed
//     and zooms naturally with the viewport, the same way any
//     other fabric object does. Zooming in makes both the stroke
//     AND its dashes bigger together.
//
// This matches the user's mental model: zoom changes shouldn't
// retroactively alter the appearance of strokes that already
// exist. They should only affect the sizing of NEW marks.
//
// fabric stores strokeDashArray in canvas units. At zoom Z a
// canvas-unit length L renders as L * Z screen pixels. To make
// L * Z = desired_screen_px at the moment of drawing, set L =
// desired_screen_px / Z. That's all this helper does.
//
// Used only by src/tools/pencil.ts at path:created. There is
// intentionally no global recompensation hook — see also the
// comment in src/tools/zoom.ts inside the mouse:wheel handler.
//
// Design reference: claudedocs/design_p0_slice.md §6.3.

import { PLAN_DASH_ARRAY } from "@/state/phase";

export function dashArrayForZoom(zoom: number): number[] {
  // Defensive: zoom should always be > 0 (fabric clamps it to
  // [0.01, 20] in our zoom.ts), but a 0 here would divide-by-zero.
  if (zoom <= 0) return PLAN_DASH_ARRAY;
  return PLAN_DASH_ARRAY.map((n) => n / zoom);
}
