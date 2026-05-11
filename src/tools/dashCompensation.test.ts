import { describe, it, expect } from "vitest";
import { dashArrayForZoom } from "./dashCompensation";
import { PLAN_DASH_ARRAY } from "@/state/phase";

describe("dashArrayForZoom", () => {
  it("returns the screen-pixel pattern unchanged at zoom 1", () => {
    expect(dashArrayForZoom(1)).toEqual(PLAN_DASH_ARRAY);
  });

  it("doubles canvas-unit lengths at zoom 0.5 (zoomed out)", () => {
    // At zoom 0.5, a canvas-unit length L renders as L * 0.5
    // screen px. To get N screen px we need L = 2N canvas units.
    expect(dashArrayForZoom(0.5)).toEqual(
      PLAN_DASH_ARRAY.map((n) => n * 2),
    );
  });

  it("halves canvas-unit lengths at zoom 2 (zoomed in)", () => {
    expect(dashArrayForZoom(2)).toEqual(
      PLAN_DASH_ARRAY.map((n) => n / 2),
    );
  });

  it("falls back to the screen-pixel default if zoom is invalid", () => {
    // Should never happen — zoom.ts clamps to [0.01, 20] — but a
    // zero zoom would NaN out the division otherwise.
    expect(dashArrayForZoom(0)).toEqual(PLAN_DASH_ARRAY);
  });
});
