import { describe, it, expect } from "vitest";
import { wrapToPi, snapAngle, rotate, sub, length, clamp } from "./geometry";

const PI = Math.PI;
// Floating-point tolerance for the trig assertions.
const EPS = 1e-9;

describe("geometry/wrapToPi", () => {
  it("leaves values already in (-π, π] unchanged", () => {
    expect(wrapToPi(0)).toBeCloseTo(0);
    expect(wrapToPi(PI / 2)).toBeCloseTo(PI / 2);
    expect(wrapToPi(-PI / 2)).toBeCloseTo(-PI / 2);
    expect(wrapToPi(PI)).toBeCloseTo(PI); // upper boundary inclusive
  });

  it("wraps values just above π down into the negative range", () => {
    expect(wrapToPi(PI + 0.1)).toBeCloseTo(-PI + 0.1);
  });

  it("wraps values just below -π up into the positive range", () => {
    expect(wrapToPi(-PI - 0.1)).toBeCloseTo(PI - 0.1);
  });

  it("handles multi-revolution wraps", () => {
    // 3π = π + 2π, should wrap to π exactly.
    expect(wrapToPi(3 * PI)).toBeCloseTo(PI);
    // -3π should wrap to π too (passes through the +π boundary).
    expect(wrapToPi(-3 * PI)).toBeCloseTo(PI);
  });

  it("delta of two close angles across the branch cut stays bounded", () => {
    // Cursor went from just below +π to just above -π — a tiny
    // visual move. The integrator's wrapToPi(curAngle - prevAngle)
    // should report a small dθ, not a near-2π jump.
    const prev = PI - 0.01;
    const cur = -PI + 0.01;
    const dθ = wrapToPi(cur - prev);
    expect(Math.abs(dθ)).toBeLessThan(0.1);
  });
});

describe("geometry/snapAngle", () => {
  // 15° in radians.
  const STEP = PI / 12;

  it("snaps to the nearest multiple", () => {
    // 17° is closer to 15° (step 1) than to 30° (step 2).
    expect(snapAngle((17 * PI) / 180, STEP)).toBeCloseTo(
      (15 * PI) / 180,
      EPS,
    );
    // 23° is closer to 30° than to 15°.
    expect(snapAngle((23 * PI) / 180, STEP)).toBeCloseTo(
      (30 * PI) / 180,
      EPS,
    );
  });

  it("returns 0 for 0", () => {
    expect(snapAngle(0, STEP)).toBe(0);
  });

  it("handles negative angles symmetrically", () => {
    expect(snapAngle((-17 * PI) / 180, STEP)).toBeCloseTo(
      (-15 * PI) / 180,
      EPS,
    );
  });
});

describe("geometry/rotate", () => {
  it("rotating (1,0) by π/2 yields (0,1)", () => {
    const r = rotate({ x: 1, y: 0 }, PI / 2);
    expect(r.x).toBeCloseTo(0, EPS);
    expect(r.y).toBeCloseTo(1, EPS);
  });

  it("rotating by 0 is a no-op", () => {
    const r = rotate({ x: 3, y: 4 }, 0);
    expect(r.x).toBeCloseTo(3, EPS);
    expect(r.y).toBeCloseTo(4, EPS);
  });

  it("rotating by 2π returns to the original vector", () => {
    const r = rotate({ x: 3, y: 4 }, 2 * PI);
    expect(r.x).toBeCloseTo(3, EPS);
    expect(r.y).toBeCloseTo(4, EPS);
  });
});

describe("geometry/sub + length", () => {
  it("sub computes a - b coordinate-wise", () => {
    expect(sub({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 });
  });

  it("length computes Euclidean magnitude", () => {
    expect(length({ x: 3, y: 4 })).toBe(5);
    expect(length({ x: 0, y: 0 })).toBe(0);
  });
});

describe("geometry/clamp", () => {
  it("returns the value when inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps to the lower bound", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it("clamps to the upper bound", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
