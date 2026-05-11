// Outlined pencil brush + matching Path subclass.
//
// fabric doesn't natively support a crisp stroke outline (a colored
// border drawn behind the main stroke). Its `Shadow` is always a
// gaussian halo — no way to get a hard edge. So we render every
// stroke as two passes:
//
//   1. Wider stroke in `outlineColor` (solid, no dashArray) —
//      the "outline" backing.
//   2. Original stroke on top.
//
// Both passes happen during live drawing (OutlinedPencilBrush) and
// after the path is finalized (OutlinedPath). Live and finalized
// stay visually identical because they share the same constants.
//
// SCALING. The outline thickness is a fixed FRACTION of the
// stroke's `strokeWidth`, not a constant in screen pixels. That
// means the outline scales together with the stroke as the user
// zooms: a path drawn with strokeWidth=W canvas units gets an
// outline of `W * (1 + 2*outlineRatio)` canvas units. Zooming in
// makes both grow together; zooming out makes both shrink
// together. This is what "scale with zoom like everything else"
// gets you — the outline behaves like the rest of the canvas.
//
// LIVE PREVIEW. fabric's BaseBrush._render path is two methods:
// `_render` (full re-render of all captured points) and an
// incremental path used by `onMouseMove` that only draws the
// latest segment. The incremental path doesn't compose cleanly
// with our outline pass (the new segment's outline would overlap
// the previous segment's main stroke). So `needsFullRender` is
// forced to true — every move event triggers a full re-render.
// Performance is fine for the stroke counts a debrief produces.

import * as fabric from "fabric";
import type { Canvas } from "fabric";

// Default outline appearance. Tune by changing these constants
// (single source of truth — applies to both live and finalized).
export const DEFAULT_OUTLINE_COLOR = "#000000";
// Each side's outline adds this fraction of strokeWidth. Total
// outline width = strokeWidth * (1 + 2 * outlineRatio).
// 0.2 = 20% on each side = total 140% the stroke's width.
export const DEFAULT_OUTLINE_RATIO = 0.1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOpts = any;

export class OutlinedPath extends fabric.Path {
  outlineColor: string = DEFAULT_OUTLINE_COLOR;
  outlineRatio: number = DEFAULT_OUTLINE_RATIO;

  constructor(path: AnyOpts, options?: AnyOpts) {
    super(path, options);
    if (options?.outlineColor) this.outlineColor = options.outlineColor;
    if (typeof options?.outlineRatio === "number") {
      this.outlineRatio = options.outlineRatio;
    }
  }

  // Override the renderer to draw two passes. We mutate `this`
  // properties between super._render calls because fabric's
  // Path/_renderStroke reads `this.stroke`, `this.strokeWidth`,
  // and `this.strokeDashArray` from the live instance each call.
  // Save & restore so the object's persisted state is unchanged
  // after rendering (otherwise serialization or any inspection
  // mid-render would see the outline-pass values).
  _render(ctx: CanvasRenderingContext2D) {
    const origStroke = this.stroke;
    const origWidth = this.strokeWidth;
    const origDash = this.strokeDashArray;

    // Pass 1: solid wider outline behind the main stroke.
    // strokeDashArray=null so the outline is continuous even when
    // the main stroke is dashed (plan mode).
    this.stroke = this.outlineColor;
    this.strokeWidth = origWidth * (1 + 2 * this.outlineRatio);
    this.strokeDashArray = null;
    super._render(ctx);

    // Pass 2: original stroke, including dash pattern.
    this.stroke = origStroke;
    this.strokeWidth = origWidth;
    this.strokeDashArray = origDash;
    super._render(ctx);
  }
}

export class OutlinedPencilBrush extends fabric.PencilBrush {
  outlineColor: string = DEFAULT_OUTLINE_COLOR;
  outlineRatio: number = DEFAULT_OUTLINE_RATIO;

  constructor(canvas: Canvas) {
    super(canvas);
  }

  // See header comment item LIVE PREVIEW for why this is forced
  // true. (We also union with the base's truthy conditions —
  // shadow / alpha < 1 / plan-phase dash via the additional
  // override in App.tsx — to stay forward-compatible.)
  needsFullRender(): boolean {
    return true;
  }

  // Two-pass live render. Same shape as OutlinedPath._render —
  // mutate brush properties between super._render calls. The
  // brush's _setBrushStyles reads this.color/width/strokeDashArray
  // each time.
  //
  // The default-parameter dance matches fabric's PencilBrush._render
  // signature exactly. BaseBrush declares `abstract _render(): void`
  // (no args), so without the default value TypeScript would refuse
  // to assign this subclass to a `BaseBrush` slot — see
  // PencilBrush.ts line 177 for the canonical pattern.
  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    const origColor = this.color;
    const origWidth = this.width;
    const origDash = this.strokeDashArray;

    this.color = this.outlineColor;
    this.width = origWidth * (1 + 2 * this.outlineRatio);
    this.strokeDashArray = null;
    super._render(ctx);

    this.color = origColor;
    this.width = origWidth;
    this.strokeDashArray = origDash;
    super._render(ctx);
  }

  // Have the brush emit OutlinedPath instances instead of plain
  // Path so the FINALIZED stroke renders the same two passes as
  // the live preview. This is a verbatim copy of fabric's
  // PencilBrush.createPath (PencilBrush.ts:223-238) except it
  // constructs an OutlinedPath and threads outlineColor/Ratio
  // through. If fabric ever changes createPath's body upstream
  // (e.g. adds new stroke properties to copy), this method needs
  // updating too — flagging that here so a future reader knows
  // to diff against fabric's source on upgrades.
  createPath(pathData: AnyOpts): fabric.Path {
    const path = new OutlinedPath(pathData, {
      fill: null,
      stroke: this.color,
      strokeWidth: this.width,
      strokeLineCap: this.strokeLineCap,
      strokeMiterLimit: this.strokeMiterLimit,
      strokeLineJoin: this.strokeLineJoin,
      strokeDashArray: this.strokeDashArray,
      outlineColor: this.outlineColor,
      outlineRatio: this.outlineRatio,
    });
    if (this.shadow) {
      this.shadow.affectStroke = true;
      path.shadow = new fabric.Shadow(this.shadow);
    }
    return path;
  }
}
