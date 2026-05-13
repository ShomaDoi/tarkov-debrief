import { describe, it, expect } from "vitest";
import {
  applyAnimation,
  computeCumulative,
  computePartialPath,
  coneSweep,
  pathReveal,
  resetAnimation,
} from "./animators";
import { tagObject } from "@/tools/metadata";
import { writeConeParams } from "./cone";
import type * as fabric from "fabric";

interface PathLike {
  type: "path";
  path: Array<[string, ...(number | null)[]]>;
  setCoords?: () => void;
  visible?: boolean;
  __markType?: string;
  __pathOriginal?: unknown;
  __pathCumulative?: unknown;
}

function makePath(
  commands: Array<[string, ...(number | null)[]]>,
  markType: "pencil" | "arrow" | undefined = "pencil",
): fabric.FabricObject {
  const obj: PathLike = {
    type: "path",
    path: commands,
    setCoords: () => {},
    visible: true,
  };
  if (markType) obj.__markType = markType;
  return obj as unknown as fabric.FabricObject;
}

function makeArrowGroup(
  bodyCommands: Array<[string, ...(number | null)[]]>,
): {
  group: fabric.FabricObject;
  body: fabric.FabricObject;
  head: fabric.FabricObject;
} {
  const body = makePath(bodyCommands, undefined);
  (body as any).__role = "body";
  const head = {
    type: "path",
    path: [],
    visible: true,
    setCoords: () => {},
  } as any;
  head.__role = "head";
  const children = [body, head];
  const group = {
    type: "group",
    getObjects: () => children,
    setCoords: () => {},
    visible: true,
    __markType: "arrow",
  } as unknown as fabric.FabricObject;
  return { group, body, head: head as fabric.FabricObject };
}

describe("computeCumulative", () => {
  it("returns [0] for a path with only M", () => {
    const cum = computeCumulative([["M", 0, 0]]);
    expect(cum).toEqual([0]);
  });

  it("accumulates straight-line L segments", () => {
    // M 0,0 → L 3,4 (len 5) → L 3,8 (len 4) → cum = [0, 5, 9]
    const cum = computeCumulative([
      ["M", 0, 0],
      ["L", 3, 4],
      ["L", 3, 8],
    ]);
    expect(cum.length).toBe(3);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeCloseTo(5, 5);
    expect(cum[2]).toBeCloseTo(9, 5);
  });

  it("uses chord length for Q segments", () => {
    const cum = computeCumulative([
      ["M", 0, 0],
      ["Q", 5, 10, 10, 0],
    ]);
    expect(cum[1]).toBeCloseTo(10, 5);
  });
});

describe("computePartialPath", () => {
  // Three-segment path of length 6 (M + L1 + L2 + L3, all unit-length).
  const cmds: Array<[string, ...(number | null)[]]> = [
    ["M", 0, 0],
    ["L", 2, 0],
    ["L", 4, 0],
    ["L", 6, 0],
  ];
  const cum = computeCumulative(cmds);
  // cum = [0, 2, 4, 6]

  it("returns just M when target <= 0", () => {
    const out = computePartialPath(cmds, cum, 0);
    expect(out.length).toBe(1);
    expect(out[0]?.[0]).toBe("M");
  });

  it("returns full path when target >= total", () => {
    const out = computePartialPath(cmds, cum, 100);
    expect(out.length).toBe(4);
    expect(out[3]?.[0]).toBe("L");
    expect(out[3]?.[2]).toBe(0);
  });

  it("truncates with a partial L at fractional target", () => {
    // target 3 → fully through L1 (cum=2), partial through L2 (cum=4)
    // ratio = (3 - 2) / (4 - 2) = 0.5 → endpoint = (2,0) + 0.5*((4,0)-(2,0)) = (3,0)
    const out = computePartialPath(cmds, cum, 3);
    expect(out.length).toBe(3); // M, L1, partial L
    expect(out[2]?.[0]).toBe("L");
    expect(out[2]?.[1]).toBeCloseTo(3, 5);
    expect(out[2]?.[2]).toBeCloseTo(0, 5);
  });
});

describe("pathReveal — pencil", () => {
  it("at t=0 leaves just the M command (no visible content)", () => {
    const p = makePath(
      [
        ["M", 0, 0],
        ["L", 10, 0],
      ],
      "pencil",
    );
    pathReveal(p, 0);
    expect((p as any).path.length).toBe(1);
    expect((p as any).path[0][0]).toBe("M");
  });

  it("at t=1 restores the original path", () => {
    const original: Array<[string, ...(number | null)[]]> = [
      ["M", 0, 0],
      ["L", 10, 0],
    ];
    const p = makePath(original, "pencil");
    // Mid-animation: cache original.
    pathReveal(p, 0.5);
    expect((p as any).path.length).toBeLessThan(original.length + 1);
    // Now t=1 should restore.
    pathReveal(p, 1);
    expect((p as any).path.length).toBe(original.length);
    expect((p as any).__pathOriginal).toBeUndefined();
    expect((p as any).__pathCumulative).toBeUndefined();
  });

  it("caches original on first mid-animation call", () => {
    const p = makePath(
      [
        ["M", 0, 0],
        ["L", 10, 0],
      ],
      "pencil",
    );
    pathReveal(p, 0.3);
    expect((p as any).__pathOriginal).toBeDefined();
    expect((p as any).__pathCumulative).toBeDefined();
  });

  it("partial path at t=0.5 has fewer commands than original", () => {
    const p = makePath(
      [
        ["M", 0, 0],
        ["L", 4, 0],
        ["L", 8, 0],
        ["L", 12, 0],
      ],
      "pencil",
    );
    pathReveal(p, 0.5);
    // Original had 4 commands; partial at midpoint should have ≤ 3.
    expect((p as any).path.length).toBeLessThan(4);
  });

  it("round trip 0 → 0.5 → 1 → 0.5 → 1 leaves original intact", () => {
    const original: Array<[string, ...(number | null)[]]> = [
      ["M", 0, 0],
      ["L", 3, 0],
      ["L", 6, 0],
    ];
    const p = makePath(original, "pencil");
    pathReveal(p, 0);
    pathReveal(p, 0.5);
    pathReveal(p, 1);
    pathReveal(p, 0.5);
    pathReveal(p, 1);
    expect((p as any).path).toEqual(original);
  });
});

describe("pathReveal — arrow group", () => {
  it("hides arrowhead during animation, shows it at t=1", () => {
    const { group, head } = makeArrowGroup([
      ["M", 0, 0],
      ["L", 10, 0],
    ]);
    pathReveal(group, 0.5);
    expect(head.visible).toBe(false);
    pathReveal(group, 1);
    expect(head.visible).toBe(true);
  });

  it("operates on the body path, not the head", () => {
    const { group, body } = makeArrowGroup([
      ["M", 0, 0],
      ["L", 10, 0],
    ]);
    pathReveal(group, 0);
    expect((body as any).path.length).toBe(1); // truncated body
  });
});

describe("coneSweep", () => {
  function makeCone(sweep: number) {
    const cone = {
      type: "path",
      path: [],
      visible: true,
      setCoords: () => {},
      // fabric.set is normally called from set(); we mock it to
      // accept the {path: ...} update so the test can verify path
      // gets re-rendered.
      set: (props: { path?: unknown }) => {
        if (props.path !== undefined) (cone as any).path = props.path;
      },
    } as unknown as fabric.FabricObject;
    tagObject(cone, null, "record");
    (cone as any).__markType = "cone";
    writeConeParams(cone, {
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep,
      range: 100,
    });
    return cone;
  }

  it("at t=0 hides the cone (degenerate sweep)", () => {
    const cone = makeCone(Math.PI);
    coneSweep(cone, 0);
    expect(cone.visible).toBe(false);
  });

  it("at t=1 restores full sweep visibility (visible left to render effect)", () => {
    const cone = makeCone(Math.PI);
    cone.visible = true;
    coneSweep(cone, 1);
    // coneSweep at t=1 does NOT override visibility — the render
    // effect's operator+slot filter is the source of truth.
    expect(cone.visible).toBe(true);
  });

  it("re-renders the path at the scaled sweep", () => {
    const cone = makeCone(Math.PI);
    coneSweep(cone, 0.5);
    const path = (cone as any).path;
    expect(Array.isArray(path)).toBe(true);
    // Non-degenerate at t=0.5 with sweep=π → sweep_eff = π/2; the
    // rendered path has more than just an M command.
    expect(path.length).toBeGreaterThan(1);
  });
});

describe("applyAnimation dispatcher", () => {
  it("no-ops for marks with no registered animator", () => {
    const obj = makePath([], undefined);
    (obj as any).__markType = "engagementX";
    // Should not throw, should not mutate path.
    applyAnimation(obj, 0.5);
    expect((obj as any).path).toEqual([]);
  });

  it("routes pencil to pathReveal", () => {
    const p = makePath(
      [
        ["M", 0, 0],
        ["L", 10, 0],
      ],
      "pencil",
    );
    applyAnimation(p, 0);
    expect((p as any).path.length).toBe(1);
  });

  it("routes arrow to pathReveal", () => {
    const { group, body } = makeArrowGroup([
      ["M", 0, 0],
      ["L", 10, 0],
    ]);
    applyAnimation(group, 0);
    expect((body as any).path.length).toBe(1);
  });

  it("no-ops on untagged objects (no __markType)", () => {
    const obj = makePath([["M", 0, 0]], undefined);
    applyAnimation(obj, 0.5);
    expect((obj as any).path.length).toBe(1);
  });
});

describe("resetAnimation", () => {
  it("equivalent to applyAnimation(obj, 1) — restores pencil to full", () => {
    const original: Array<[string, ...(number | null)[]]> = [
      ["M", 0, 0],
      ["L", 10, 0],
      ["L", 20, 0],
    ];
    const p = makePath(original, "pencil");
    applyAnimation(p, 0.5);
    resetAnimation(p);
    expect((p as any).path).toEqual(original);
  });

  it("no-op on instant-appear marks", () => {
    const obj = makePath([], undefined);
    (obj as any).__markType = "text";
    expect(() => resetAnimation(obj)).not.toThrow();
  });
});
