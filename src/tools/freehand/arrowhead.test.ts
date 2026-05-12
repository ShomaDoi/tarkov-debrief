import { describe, it, expect } from "vitest";
import {
  computeTangent,
  tangentFromPoints,
  arrowheadVertices,
  lastPoint,
  tangentControlOf,
  TANGENT_SAMPLE_COUNT,
  type Command,
  type Point,
} from "./arrowhead";

// Arrowhead-geometry tests work with raw command tuples rather than
// a real fabric.Path, because the math we care about runs on the
// command array exclusively. The cast-through-`unknown` accepts the
// looser test literal shape.

describe("arrowhead/lastPoint", () => {
  it("reads the endpoint of an M command", () => {
    expect(lastPoint(["M", 3, 4] as unknown as Command)).toEqual({ x: 3, y: 4 });
  });
  it("reads the endpoint of an L command", () => {
    expect(lastPoint(["L", 5, 6] as unknown as Command)).toEqual({ x: 5, y: 6 });
  });
  it("reads the endpoint of a Q command (NOT the control point)", () => {
    expect(lastPoint(["Q", 1, 2, 7, 8] as unknown as Command)).toEqual({ x: 7, y: 8 });
  });
  it("reads the endpoint of a C command", () => {
    expect(lastPoint(["C", 1, 2, 3, 4, 9, 10] as unknown as Command)).toEqual({ x: 9, y: 10 });
  });
});

describe("arrowhead/tangentControlOf", () => {
  it("returns the Q command's control point", () => {
    expect(tangentControlOf(["Q", 1, 2, 7, 8] as unknown as Command)).toEqual({ x: 1, y: 2 });
  });
  it("returns the C command's second control point (governs t=1 tangent)", () => {
    expect(tangentControlOf(["C", 1, 2, 3, 4, 9, 10] as unknown as Command)).toEqual({
      x: 3,
      y: 4,
    });
  });
  it("returns null for M / L commands", () => {
    expect(tangentControlOf(["M", 0, 0] as unknown as Command)).toBeNull();
    expect(tangentControlOf(["L", 5, 5] as unknown as Command)).toBeNull();
  });
});

describe("arrowhead/computeTangent", () => {
  it("returns (1, 0) for an empty command list", () => {
    expect(computeTangent([])).toEqual({ dx: 1, dy: 0 });
  });

  it("returns (1, 0) for a single M command (degenerate single point)", () => {
    expect(computeTangent([["M", 0, 0] as unknown as Command])).toEqual({
      dx: 1,
      dy: 0,
    });
  });

  it("uses the chord direction for the canonical freehand case", () => {
    // Path: M(0,0) then Q(5,0)→(10,0). After averaging only one
    // segment exists; its chord is (0,0)→(10,0) → normalized (1,0).
    const tan = computeTangent([
      ["M", 0, 0] as unknown as Command,
      ["Q", 5, 0, 10, 0] as unknown as Command,
    ]);
    expect(tan.dx).toBeCloseTo(1, 9);
    expect(tan.dy).toBeCloseTo(0, 9);
  });

  it("computes a 45° tangent for a diagonal end-segment", () => {
    // M(0,0) → Q endpoint (10,10). Chord (0,0)→(10,10) →
    // normalized (√2/2, √2/2).
    const tan = computeTangent([
      ["M", 0, 0] as unknown as Command,
      ["Q", 5, 5, 10, 10] as unknown as Command,
    ]);
    expect(tan.dx).toBeCloseTo(Math.SQRT1_2, 9);
    expect(tan.dy).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("uses chord direction for L commands", () => {
    // M(0,0) then L(3,4). Chord = (3, 4) → normalized = (3/5, 4/5).
    const tan = computeTangent([
      ["M", 0, 0] as unknown as Command,
      ["L", 3, 4] as unknown as Command,
    ]);
    expect(tan.dx).toBeCloseTo(0.6, 9);
    expect(tan.dy).toBeCloseTo(0.8, 9);
  });

  it("averages across multiple segments to smooth the tangent", () => {
    // Build a path with N+1 endpoints whose chord-tangents disagree
    // slightly. The averaged result should sit between them, not snap
    // to the latest one.
    //
    // Sequence: (0,0) → (10,0) → (20,1) → (30,0) → (40,1) → (50,0).
    // All chords lean roughly +X with tiny ±Y wobble. Average ≈ pure
    // +X — the noise cancels.
    const tan = computeTangent([
      ["M", 0, 0] as unknown as Command,
      ["L", 10, 0] as unknown as Command,
      ["L", 20, 1] as unknown as Command,
      ["L", 30, 0] as unknown as Command,
      ["L", 40, 1] as unknown as Command,
      ["L", 50, 0] as unknown as Command,
    ]);
    // All chords have a +X component. The y component should be
    // small (averaged-out noise), but the +X component dominates.
    expect(tan.dx).toBeGreaterThan(0.95);
    expect(Math.abs(tan.dy)).toBeLessThan(0.2);
  });

  it("samples at most TANGENT_SAMPLE_COUNT+1 endpoints from the end of the path", () => {
    // Build a path much longer than the sample window. The
    // averaged tangent should ignore the older portion of the
    // path and only reflect the last N segments.
    //
    // Path goes EAST for many segments, then turns SOUTH for
    // exactly TANGENT_SAMPLE_COUNT trailing segments. The
    // averaged tangent should be pure SOUTH — older EAST chords
    // are outside the sample window.
    const cmds: Command[] = [["M", 0, 0] as unknown as Command];
    for (let x = 10; x <= 100; x += 10) {
      cmds.push(["L", x, 0] as unknown as Command);
    }
    // Now turn SOUTH for exactly TANGENT_SAMPLE_COUNT segments,
    // starting from (100, 0).
    for (let s = 1; s <= TANGENT_SAMPLE_COUNT; s++) {
      cmds.push(["L", 100, 10 * s] as unknown as Command);
    }
    const tan = computeTangent(cmds);
    // Pure south (within numerical tolerance — there's a single
    // east chord from the corner included in the window).
    // The corner-east chord shares the window with N-1 south
    // chords. Net direction is mostly south with a small east bias.
    expect(tan.dy).toBeGreaterThan(0.9);
    // The east bias should be small.
    expect(Math.abs(tan.dx)).toBeLessThan(0.5);
  });
});

describe("arrowhead/tangentFromPoints", () => {
  // Direct unit-level tests for the shared helper that drives both
  // the committed-arrow tangent (via computeTangent's endpoint
  // walk) and the live-brush tangent (via OutlinedPencilBrush's
  // `_points` slice).

  it("returns FALLBACK_TANGENT for < 2 points", () => {
    expect(tangentFromPoints([])).toEqual({ dx: 1, dy: 0 });
    expect(tangentFromPoints([{ x: 0, y: 0 }])).toEqual({ dx: 1, dy: 0 });
  });

  it("computes the unit chord for a two-point sequence", () => {
    const tan = tangentFromPoints([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
    expect(tan.dx).toBeCloseTo(0.6, 9);
    expect(tan.dy).toBeCloseTo(0.8, 9);
  });

  it("averages unit tangents across multiple segments", () => {
    // Three segments: (1,0), (0,1), (1,0). Sum of units = (2,1).
    // Normalized = (2/√5, 1/√5).
    const tan = tangentFromPoints([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    const expectedLen = Math.hypot(2, 1);
    expect(tan.dx).toBeCloseTo(2 / expectedLen, 9);
    expect(tan.dy).toBeCloseTo(1 / expectedLen, 9);
  });

  it("skips collapsed (coincident) adjacent points", () => {
    // Three points where the middle is at the same spot as the
    // first. The zero-length first chord is skipped; only the
    // (0,0)→(5,0) chord contributes.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ];
    const tan = tangentFromPoints(points);
    expect(tan.dx).toBeCloseTo(1, 9);
    expect(tan.dy).toBeCloseTo(0, 9);
  });

  it("returns FALLBACK_TANGENT when summed tangents cancel (degenerate)", () => {
    // Two equal-length chords going in opposite directions sum to
    // zero — the path has no net direction. Falls back to (+1, 0).
    const tan = tangentFromPoints([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(tan).toEqual({ dx: 1, dy: 0 });
  });

  it("equal-length perpendicular chords average to 45°", () => {
    // Two unit chords +X and +Y. Sum = (1, 1). Normalized = (√2/2,
    // √2/2). This is the "is my averaging biased by chord length?"
    // sanity check.
    const tan = tangentFromPoints([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]);
    expect(tan.dx).toBeCloseTo(Math.SQRT1_2, 9);
    expect(tan.dy).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("long and short chords contribute equally (unit-tangent averaging)", () => {
    // One short east chord (length 1) and one long east chord (length
    // 100). Both point +X. Average is still pure +X regardless of
    // length. This confirms we're averaging UNIT tangents, not raw
    // displacement vectors.
    const tan = tangentFromPoints([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 101, y: 0 },
    ]);
    expect(tan.dx).toBeCloseTo(1, 9);
    expect(tan.dy).toBeCloseTo(0, 9);
  });
});

describe("arrowhead/arrowheadVertices", () => {
  // Constants from arrowhead.ts (HEIGHT_RATIO = 4, HALF_BASE_RATIO = 1.5,
  // min height 10, min halfBase 6). The tests parameterize off these
  // values explicitly so future tuning updates stay focused on the
  // module constants rather than spread across assertions.
  const HEIGHT_RATIO = 4;
  const HALF_BASE_RATIO = 2;

  it("places tip AT the endpoint and base BEHIND it (tangent +X)", () => {
    // strokeWidth=10 → height = max(10*4, 10) = 40, halfBase =
    // max(10*2, 6) = 20. Tip coincides with the line's endpoint
    // so the arms meet the line at a single point. Base is at
    // (endpoint - height * tangent).
    const verts = arrowheadVertices(
      { x: 100, y: 50 },
      { dx: 1, dy: 0 },
      10,
    );
    expect(verts[0]).toEqual({ x: 100, y: 50 });
    // Base-axis at (100 - 40, 50) = (60, 50); base vertices ±
    // halfBase perpendicular.
    expect(verts[1].x).toBeCloseTo(100 - 10 * HEIGHT_RATIO, 9);
    expect(verts[1].y).toBeCloseTo(50 + 10 * HALF_BASE_RATIO, 9);
    expect(verts[2].x).toBeCloseTo(100 - 10 * HEIGHT_RATIO, 9);
    expect(verts[2].y).toBeCloseTo(50 - 10 * HALF_BASE_RATIO, 9);
  });

  it("rotates with the tangent direction", () => {
    // strokeWidth=10, tangent +Y. Tip at endpoint; base behind
    // along -Y; spread along ±X.
    const verts = arrowheadVertices(
      { x: 100, y: 50 },
      { dx: 0, dy: 1 },
      10,
    );
    expect(verts[0].x).toBeCloseTo(100, 9);
    expect(verts[0].y).toBeCloseTo(50, 9);
    // perp = (-1, 0) → base-left at (baseX - halfBase, baseY) with
    // baseY = 50 - HEIGHT_RATIO * 10 ... wait: baseY = endpoint.y -
    // height * tangent.dy = 50 - 40*1 = 10. perp = (-1, 0).
    expect(verts[1].x).toBeCloseTo(100 - 10 * HALF_BASE_RATIO, 9);
    expect(verts[1].y).toBeCloseTo(50 - 10 * HEIGHT_RATIO, 9);
    expect(verts[2].x).toBeCloseTo(100 + 10 * HALF_BASE_RATIO, 9);
    expect(verts[2].y).toBeCloseTo(50 - 10 * HEIGHT_RATIO, 9);
  });

  it("the base vertices are symmetric about the tangent axis", () => {
    // For an arbitrary tangent angle, the two base vertices are
    // equidistant from the tangent line through the endpoint, on
    // either side of the base-axis (endpoint - height * tangent).
    const endpoint = { x: 200, y: 100 };
    const tan = { dx: 0.6, dy: 0.8 };
    const sw = 10;
    const [v0, v1, v2] = arrowheadVertices(endpoint, tan, sw);
    // Tip is AT the endpoint.
    expect(v0.x).toBeCloseTo(endpoint.x, 9);
    expect(v0.y).toBeCloseTo(endpoint.y, 9);
    // Base midpoint lies on the tangent axis at distance height
    // behind the endpoint.
    const baseMid = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
    const expectedBaseX = endpoint.x - sw * HEIGHT_RATIO * tan.dx;
    const expectedBaseY = endpoint.y - sw * HEIGHT_RATIO * tan.dy;
    expect(baseMid.x).toBeCloseTo(expectedBaseX, 9);
    expect(baseMid.y).toBeCloseTo(expectedBaseY, 9);
  });

  it("scales dimensions with strokeWidth", () => {
    // Wider stroke → base sits farther behind the endpoint.
    // Asserts base-axis position (endpoint - height*tangent) since
    // the tip itself is always at the endpoint.
    const [, lNarrow] = arrowheadVertices(
      { x: 0, y: 0 },
      { dx: 1, dy: 0 },
      5,
    );
    const [, lWide] = arrowheadVertices(
      { x: 0, y: 0 },
      { dx: 1, dy: 0 },
      20,
    );
    // strokeWidth 5  → height = max(20, 10) = 20 → base-axis x = -20.
    // strokeWidth 20 → height = max(80, 10) = 80 → base-axis x = -80.
    expect(lNarrow.x).toBeCloseTo(-5 * HEIGHT_RATIO, 9);
    expect(lWide.x).toBeCloseTo(-20 * HEIGHT_RATIO, 9);
  });

  it("honors the minimum dimensions for very small strokes", () => {
    const [tip, l, r] = arrowheadVertices({ x: 0, y: 0 }, { dx: 1, dy: 0 }, 1);
    // Tip is AT endpoint (0, 0). height clamp = max(4, 10) = 10
    // → base-axis x = -10. halfBase clamp = max(2, 6) = 6.
    expect(tip).toEqual({ x: 0, y: 0 });
    expect(l.x).toBe(-10);
    expect(Math.abs(l.y)).toBe(6);
    expect(r.x).toBe(-10);
    expect(Math.abs(r.y)).toBe(6);
  });
});
