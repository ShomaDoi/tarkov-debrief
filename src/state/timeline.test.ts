import { describe, it, expect, beforeEach } from "vitest";
import {
  ANIMATION_CONFIG,
  animDurationFor,
  computePathArcLength,
  getBodyPath,
  projectTimeline,
  useTimeline,
  type AnimationConfig,
} from "./timeline";
import { tagObject } from "@/tools/metadata";
import type * as fabric from "fabric";

// Test helpers: synthesize fabric-like objects without spinning up
// a real canvas. The timeline functions read tagged metadata
// (__id / __seq / __markType) and, for path-typed objects, a
// `path` array and `type === "path"`. Plain JS bags do the job.

interface PathLikeOptions {
  commands?: [string, ...number[]][];
  markType?: string;
  tag?: { operator: string | null; phase: "record" | "plan" };
}

function makePathObj(opts: PathLikeOptions = {}): fabric.FabricObject {
  const obj = {
    type: "path",
    path: opts.commands ?? [],
  } as unknown as fabric.FabricObject;
  if (opts.tag) {
    tagObject(obj, opts.tag.operator, opts.tag.phase);
  }
  if (opts.markType) {
    (obj as any).__markType = opts.markType;
  }
  return obj;
}

function makeGroupObj(
  children: fabric.FabricObject[],
  opts: { markType?: string } = {},
): fabric.FabricObject {
  const obj = {
    type: "group",
    getObjects: () => children,
  } as unknown as fabric.FabricObject;
  tagObject(obj, null, "record");
  if (opts.markType) {
    (obj as any).__markType = opts.markType;
  }
  return obj;
}

describe("computePathArcLength", () => {
  it("returns 0 for an empty path", () => {
    const path = makePathObj({ commands: [] });
    expect(computePathArcLength(path)).toBe(0);
  });

  it("sums straight-line L segments", () => {
    // M 0,0 → L 3,4 → L 3,0 : length 5 + 4 = 9
    const path = makePathObj({
      commands: [
        ["M", 0, 0],
        ["L", 3, 4],
        ["L", 3, 0],
      ],
    });
    expect(computePathArcLength(path)).toBeCloseTo(9, 5);
  });

  it("uses chord approximation for Q segments", () => {
    // M 0,0 → Q ctrl=(5,10) end=(10,0) : chord = 10
    // (Real arc length is ~12 with that control point, but the
    // brush emits sub-pixel segments so chord ≈ arc; tests assert
    // the chord behavior since that's what the implementation
    // documents.)
    const path = makePathObj({
      commands: [
        ["M", 0, 0],
        ["Q", 5, 10, 10, 0],
      ],
    });
    expect(computePathArcLength(path)).toBeCloseTo(10, 5);
  });

  it("ignores Z close-paths in the length calculation", () => {
    const path = makePathObj({
      commands: [
        ["M", 0, 0],
        ["L", 5, 0],
        ["Z"],
      ],
    });
    expect(computePathArcLength(path)).toBeCloseTo(5, 5);
  });
});

describe("getBodyPath", () => {
  it("returns a fabric.Path directly", () => {
    const path = makePathObj({ commands: [["M", 0, 0]] });
    expect(getBodyPath(path)).toBe(path);
  });

  it("digs into a group and returns the first path child", () => {
    // Arrow's group is built as [bodyPath, arrowhead] per
    // tools/arrow.ts; the body is the first path-typed child.
    const body = makePathObj({ commands: [["M", 0, 0]] });
    const head = {
      type: "path", // a path-typed arrowhead
      path: [],
    } as unknown as fabric.FabricObject;
    const group = makeGroupObj([body, head]);
    // Either the body or the head matches "first path child" — the
    // helper just needs to return *a* path. Body comes first.
    expect(getBodyPath(group)).toBe(body);
  });

  it("returns null for objects with no path child", () => {
    const obj = { type: "rect" } as any;
    expect(getBodyPath(obj)).toBeNull();
  });
});

describe("animDurationFor", () => {
  const cfg: AnimationConfig = {
    drawSpeedPxPerSec: 600,
    coneSweepMs: 500,
    interMarkGapMs: 250,
  };

  it("pencil duration = arcLength / drawSpeed × 1000 (rounded)", () => {
    // arcLength = 300 px @ 600 px/s = 500 ms.
    const path = makePathObj({
      markType: "pencil",
      commands: [
        ["M", 0, 0],
        ["L", 300, 0],
      ],
    });
    expect(animDurationFor(path, cfg)).toBe(500);
  });

  it("arrow duration uses the body path inside the group", () => {
    // body 600 px @ 600 px/s = 1000 ms.
    const body = makePathObj({
      commands: [
        ["M", 0, 0],
        ["L", 600, 0],
      ],
    });
    const head = makePathObj({ commands: [["M", 0, 0]] });
    const arrow = makeGroupObj([body, head], { markType: "arrow" });
    expect(animDurationFor(arrow, cfg)).toBe(1000);
  });

  it("cone duration is the fixed coneSweepMs config", () => {
    const cone = {
      type: "path",
      path: [],
    } as unknown as fabric.FabricObject;
    tagObject(cone, null, "record");
    (cone as any).__markType = "cone";
    expect(animDurationFor(cone, cfg)).toBe(500);
  });

  it("instant-appear mark types return 0", () => {
    for (const mt of [
      "engagementX",
      "soundPing",
      "positionDot",
      "text",
      "sightline",
    ]) {
      const obj = {} as fabric.FabricObject;
      tagObject(obj, null, "record");
      (obj as any).__markType = mt;
      expect(animDurationFor(obj, cfg)).toBe(0);
    }
  });

  it("untagged or unknown mark types return 0", () => {
    const obj = {} as fabric.FabricObject;
    expect(animDurationFor(obj, cfg)).toBe(0);
  });

  it("caches arc length on the body path after first call", () => {
    const path = makePathObj({
      markType: "pencil",
      commands: [
        ["M", 0, 0],
        ["L", 300, 0],
      ],
    });
    animDurationFor(path, cfg);
    expect((path as any).__pathArcLength).toBeCloseTo(300, 5);
  });
});

describe("projectTimeline", () => {
  let cfg: AnimationConfig;

  beforeEach(() => {
    cfg = {
      drawSpeedPxPerSec: 600,
      coneSweepMs: 500,
      interMarkGapMs: 250,
    };
  });

  it("empty marks → empty slots, total 0", () => {
    const { slots, logicalTotalDuration } = projectTimeline([], cfg);
    expect(slots).toEqual([]);
    expect(logicalTotalDuration).toBe(0);
  });

  it("filters out untagged objects (no __id / __seq)", () => {
    // The map image is untagged today; this guards against it
    // sneaking into the timeline.
    const mapImage = {
      type: "image",
    } as unknown as fabric.FabricObject;
    const tagged = makePathObj({
      markType: "pencil",
      commands: [
        ["M", 0, 0],
        ["L", 100, 0],
      ],
    });
    // tagObject is what writes id/seq. mapImage doesn't get it.
    tagObject(tagged, null, "record");
    const { slots } = projectTimeline([mapImage, tagged], cfg);
    expect(slots.length).toBe(1);
    expect(slots[0]?.obj).toBe(tagged);
  });

  it("sorts marks by __seq ascending regardless of array order", () => {
    const a = makePathObj({ commands: [["M", 0, 0]] });
    const b = makePathObj({ commands: [["M", 0, 0]] });
    const c = makePathObj({ commands: [["M", 0, 0]] });
    // Tag in order a → b → c so seqs are ascending. Pass in
    // reverse to verify the projection sorts.
    tagObject(a, null, "record");
    tagObject(b, null, "record");
    tagObject(c, null, "record");
    const { slots } = projectTimeline([c, a, b], cfg);
    expect(slots.map((s) => s.obj)).toEqual([a, b, c]);
  });

  it("computes slot starts as cumulative (duration + gap)", () => {
    // Three pencils, each 600 px = 1000 ms. Gap 250 ms.
    // Expected starts: 0, 1250, 2500. Total: 2500 + 1000 = 3500.
    const make = () =>
      makePathObj({
        markType: "pencil",
        commands: [
          ["M", 0, 0],
          ["L", 600, 0],
        ],
        tag: { operator: null, phase: "record" },
      });
    const marks = [make(), make(), make()];
    const { slots, logicalTotalDuration } = projectTimeline(marks, cfg);
    expect(slots[0]?.logicalSlotStart).toBe(0);
    expect(slots[0]?.logicalAnimDuration).toBe(1000);
    expect(slots[1]?.logicalSlotStart).toBe(1250);
    expect(slots[2]?.logicalSlotStart).toBe(2500);
    expect(logicalTotalDuration).toBe(3500); // last.start + last.duration, no trailing gap
  });

  it("instant-appear marks contribute 0 duration but still get a gap", () => {
    // pencil 600 px (1000 ms) → engagementX (0 ms) → pencil 600 px (1000 ms).
    // Gaps between each: 250 ms.
    // Starts: 0, 1250, 1500. Total: 1500 + 1000 = 2500.
    const a = makePathObj({
      markType: "pencil",
      commands: [
        ["M", 0, 0],
        ["L", 600, 0],
      ],
      tag: { operator: null, phase: "record" },
    });
    const b = {} as fabric.FabricObject;
    tagObject(b, null, "record");
    (b as any).__markType = "engagementX";
    const c = makePathObj({
      markType: "pencil",
      commands: [
        ["M", 0, 0],
        ["L", 600, 0],
      ],
      tag: { operator: null, phase: "record" },
    });
    const { slots, logicalTotalDuration } = projectTimeline([a, b, c], cfg);
    expect(slots[0]?.logicalSlotStart).toBe(0);
    expect(slots[1]?.logicalSlotStart).toBe(1250);
    expect(slots[1]?.logicalAnimDuration).toBe(0);
    expect(slots[2]?.logicalSlotStart).toBe(1500);
    expect(logicalTotalDuration).toBe(2500);
  });

  it("exposes ANIMATION_CONFIG as a tunable constant", () => {
    // Smoke check that the public export has the expected shape.
    // Values are tuning parameters — asserting specific values
    // here would break this test every time playback feel is
    // tuned in production. Structural check only.
    expect(typeof ANIMATION_CONFIG.drawSpeedPxPerSec).toBe("number");
    expect(typeof ANIMATION_CONFIG.coneSweepMs).toBe("number");
    expect(typeof ANIMATION_CONFIG.interMarkGapMs).toBe("number");
    expect(ANIMATION_CONFIG.drawSpeedPxPerSec).toBeGreaterThan(0);
  });
});

// useTimeline (the React hook) is exercised by the Scrubber
// component tests; the RAF loop and React effect lifecycle are
// awkward to unit-test in isolation. We assert the hook EXISTS
// and is callable so an accidental rename / removal trips a test.
describe("useTimeline export", () => {
  it("is a function", () => {
    expect(typeof useTimeline).toBe("function");
  });
});
