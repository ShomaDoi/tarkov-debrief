import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import {
  CONE_SPEC,
  conePathData,
  coneEdgeEndpoints,
  deriveConeParams,
  readConeParams,
  writeConeParams,
  type ConeParams,
} from "./cone";
import { useMark, type UseMarkOptions } from "./useMark";
import { asCanvas, createMockCanvas, fire } from "../../test/mockCanvas";
import { ToolType, type Tool } from "../tool";
import type { Operator } from "@/state/operators";
import type { Point } from "./geometry";
import { readMarkType, readPhase } from "../metadata";

const ALPHA: Operator = {
  id: "op-alpha",
  name: "Alpha",
  color: "#0693E3",
  visible: true,
};
const PI = Math.PI;

function baseTool(type: ToolType = ToolType.cone): Tool {
  return { type, active: false, cursor: null };
}

function makeUndoStub() {
  return {
    onUndo: vi.fn(),
    markTransient: vi.fn(),
    unmarkTransient: vi.fn(),
    popLastAction: vi.fn(),
    recordAdd: vi.fn(),
    recordRemove: vi.fn(),
  };
}

function makeOpts(
  overrides: Partial<UseMarkOptions> & {
    canvas: UseMarkOptions["canvas"];
    lastArrowTip?: Point | null;
  },
): UseMarkOptions {
  const lastArrowTipRef = {
    current: overrides.lastArrowTip ?? null,
  } as UseMarkOptions["lastArrowTipRef"];
  const tool = overrides.tool ?? baseTool(ToolType.cone);
  return {
    canvas: overrides.canvas,
    tool,
    setTool: overrides.setTool ?? vi.fn(),
    activeOperator: overrides.activeOperator ?? ALPHA,
    activeOperatorId: overrides.activeOperatorId ?? ALPHA.id,
    phase: overrides.phase ?? "record",
    lastArrowTipRef,
    undo: overrides.undo ?? makeUndoStub(),
  };
}

// ---- Geometry helpers --------------------------------------------

describe("cone/coneEdgeEndpoints", () => {
  it("places B and C at distance `range` from origin along the right angles", () => {
    // Origin (0, 0); startAngle = 0 (pointing +X); sweep = π/2 (90°
    // CCW in math). Range = 100. Edge 1 (B) at (100, 0); edge 2 (C)
    // at angle π/2 → (0, 100).
    const { B, C } = coneEdgeEndpoints({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: PI / 2,
      range: 100,
    });
    expect(B.x).toBeCloseTo(100, 9);
    expect(B.y).toBeCloseTo(0, 9);
    expect(C.x).toBeCloseTo(0, 9);
    expect(C.y).toBeCloseTo(100, 9);
  });
});

describe("cone/conePathData", () => {
  it("returns M-L-A-Z structure with rx=ry=range", () => {
    const d = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: PI / 2,
      range: 50,
    });
    // Single A command with matching radii.
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d).toMatch(/A 50 50 0/);
  });

  it("uses largeArcFlag=0 for minor sectors (|sweep| ≤ π)", () => {
    const d = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: PI / 2,
      range: 50,
    });
    // Path: "M 0 0 L 50 0 A 50 50 0 0 1 ... Z"
    //                              ^ largeArcFlag
    expect(d).toMatch(/A 50 50 0 0 [01]/);
  });

  it("uses largeArcFlag=1 for reflex sectors (|sweep| > π)", () => {
    const d = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: (3 * PI) / 2,
      range: 50,
    });
    expect(d).toMatch(/A 50 50 0 1 [01]/);
  });

  it("flips sweepFlag with the sign of sweep", () => {
    const positive = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: PI / 2,
      range: 50,
    });
    const negative = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: -PI / 2,
      range: 50,
    });
    // sweepFlag is the 4th and 5th digit of the A args: "A r r 0 large sweep ..."
    expect(positive).toMatch(/A 50 50 0 0 1/);
    expect(negative).toMatch(/A 50 50 0 0 0/);
  });

  it("collapses to a single edge for zero-sweep (degenerate)", () => {
    const d = conePathData({
      origin: { x: 0, y: 0 },
      startAngle: 0,
      sweep: 0,
      range: 50,
    });
    expect(d).not.toMatch(/A /);
    expect(d).toMatch(/M 0 0 L 50 0 Z/);
  });
});

describe("cone/deriveConeParams", () => {
  it("computes a minor-sector sweep within (−π, π]", () => {
    // anchor (0,0), dragStart (100, 0), dragEnd (0, 100). Sweep
    // should be wrapToPi(π/2 - 0) = π/2.
    const p = deriveConeParams(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    );
    expect(p.startAngle).toBeCloseTo(0, 9);
    expect(p.sweep).toBeCloseTo(PI / 2, 9);
    expect(p.range).toBeCloseTo(100, 9);
  });

  it("cannot express reflex sweeps on its own (wrapToPi clamps)", () => {
    // anchor (0,0), dragStart (100, 0), dragEnd (-100, 0). The
    // "minor" interpretation is sweep = π (180°). The reflex
    // interpretation (sweep = -π or +π) is indistinguishable from
    // the two-point inputs; useMark's integrator handles the
    // reflex case.
    const p = deriveConeParams(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: -100, y: 0 },
    );
    expect(Math.abs(p.sweep)).toBeCloseTo(PI, 9);
  });
});

// ---- Spec contract ------------------------------------------------

describe("CONE_SPEC", () => {
  it("declares the expected discrete-gesture metadata", () => {
    expect(CONE_SPEC.toolType).toBe(ToolType.cone);
    expect(CONE_SPEC.markType).toBe("cone");
    expect(CONE_SPEC.interaction).toBe("chained-drag");
    expect(CONE_SPEC.colorSource).toBe("operator");
    expect(CONE_SPEC.oneShot).toBe(true);
    expect(CONE_SPEC.revertTo).toBe(ToolType.arrow);
    expect(CONE_SPEC.serialize).toBeTypeOf("function");
    expect(CONE_SPEC.deserialize).toBeTypeOf("function");
  });

  it("build attaches __cone params to the produced fabric.Path", () => {
    const obj = CONE_SPEC.build({
      kind: "chained-drag",
      anchor: { x: 0, y: 0 },
      dragStart: { x: 100, y: 0 },
      dragEnd: { x: 0, y: 100 },
      color: "#0693E3",
    });
    expect(obj).toBeInstanceOf(fabric.Path);
    const params = readConeParams(obj);
    expect(params).not.toBeNull();
    expect(params!.range).toBeCloseTo(100, 9);
  });

  it("applyPhase darkens fill via rgba alpha and dashes the stroke under plan", () => {
    const obj = CONE_SPEC.build({
      kind: "chained-drag",
      anchor: { x: 0, y: 0 },
      dragStart: { x: 100, y: 0 },
      dragEnd: { x: 0, y: 100 },
      color: "#0693E3",
    });
    CONE_SPEC.applyPhase(obj, "plan");
    const path = obj as fabric.Path;
    expect(typeof path.fill).toBe("string");
    expect((path.fill as string).startsWith("rgba")).toBe(true);
    expect(path.strokeDashArray).toEqual([10, 15]);

    CONE_SPEC.applyPhase(obj, "record");
    // Record uses an empty dashArray (solid stroke).
    expect(path.strokeDashArray).toEqual([]);
  });

  it("serialize / deserialize round-trips ConeParams including reflex sweep", () => {
    const obj = CONE_SPEC.build({
      kind: "chained-drag",
      anchor: { x: 10, y: 20 },
      dragStart: { x: 110, y: 20 },
      dragEnd: { x: 10, y: 120 },
      color: "#000",
    });
    // Overwrite with a reflex-sweep blob to verify deserialize
    // handles it (the build-side wrapToPi flattens reflexes; the
    // deserialize path must preserve them).
    const reflex: ConeParams = {
      origin: { x: 10, y: 20 },
      startAngle: 0,
      sweep: (3 * PI) / 2, // 270°
      range: 80,
    };
    CONE_SPEC.deserialize!(obj, {
      origin: reflex.origin,
      startAngle: reflex.startAngle,
      sweep: reflex.sweep,
      range: reflex.range,
    });
    const back = readConeParams(obj);
    expect(back).not.toBeNull();
    expect(back!.sweep).toBeCloseTo(reflex.sweep, 9);
    expect(back!.range).toBeCloseTo(reflex.range, 9);

    const serialized = CONE_SPEC.serialize!(obj);
    expect((serialized as { sweep: number }).sweep).toBeCloseTo(
      reflex.sweep,
      9,
    );
  });

  it("build throws on non-chained-drag params (defensive)", () => {
    expect(() =>
      CONE_SPEC.build({
        kind: "point",
        at: { x: 0, y: 0 },
        color: "#000",
      }),
    ).toThrow(/chained-drag/);
  });
});

// ---- useMark chained-drag lifecycle ------------------------------

describe("useMark(CONE_SPEC) — chained-drag interaction", () => {
  it("soft-fails to arrow when no lastArrowTip exists", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: null,
        }),
      ),
    );

    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("does NOT show a preview on activation (preview begins at mouse:down)", () => {
    const mock = createMockCanvas();
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );
    // Unlike sightline (which adds a preview on activation), cone
    // waits until the user starts dragging.
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("attaches preview on mouse:down and updates on mouse:move", () => {
    const mock = createMockCanvas();
    let scenePoint = { x: 200, y: 100 };
    mock.getScenePoint = vi.fn(() => scenePoint);
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    // mouse:down at scenePoint (200, 100). Origin (100, 100). Edge
    // 1 direction: +X. Preview is the initial sliver (sweep = 0).
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    expect(mock.add).toHaveBeenCalledTimes(1);

    // mouse:move to (100, 200): sweep integrates from atan2(0, 100)=0
    // to atan2(100, 0) = π/2. dθ = π/2.
    scenePoint = { x: 100, y: 200 };
    fire(mock, "mouse:move", { e: new MouseEvent("mousemove") });

    // refreshPreview removes the old preview and adds a new one, so
    // total remove count should now be 1 (the previous preview).
    expect(mock.remove).toHaveBeenCalledTimes(1);
    // Latest add is the updated preview.
    expect(mock.add).toHaveBeenCalledTimes(2);
    const latest = mock.add.mock.calls[1]![0] as fabric.Path;
    const params = readConeParams(latest);
    expect(params).not.toBeNull();
    expect(params!.sweep).toBeCloseTo(PI / 2, 6);
  });

  it("integrates signed sweep across a reflex drag (cumulative > π)", () => {
    const mock = createMockCanvas();
    // Simulate a drag that goes CCW around the origin (in math
    // terms; on screen with Y-down this is CW visually). Start at
    // +X, swing through +Y, then through -X, ending in -Y — total
    // sweep ≈ 3π/2.
    const points = [
      { x: 200, y: 100 }, // angle 0
      { x: 100, y: 200 }, // angle +π/2
      { x: 0, y: 100 }, // angle +π
      { x: 100, y: 0 }, // angle -π/2 (= +3π/2 after integration)
    ];
    let idx = 0;
    mock.getScenePoint = vi.fn(() => points[idx]!);
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    for (idx = 1; idx < points.length; idx++) {
      fire(mock, "mouse:move", { e: new MouseEvent("mousemove") });
    }

    // The final preview should have sweep ≈ 3π/2 — only achievable
    // via cumulative integration. wrapToPi-based derivation would
    // collapse this to -π/2.
    const lastAdd = mock.add.mock.calls.at(-1)![0] as fabric.Path;
    const params = readConeParams(lastAdd);
    expect(params).not.toBeNull();
    expect(params!.sweep).toBeCloseTo((3 * PI) / 2, 5);
  });

  it("commits on mouse:up with the integrated sweep and reverts to arrow", () => {
    const mock = createMockCanvas();
    let scenePoint = { x: 200, y: 100 };
    mock.getScenePoint = vi.fn(() => scenePoint);
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    // mouse:down at (200, 100)
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    // drag to (100, 200) — sweep π/2
    scenePoint = { x: 100, y: 200 };
    fire(mock, "mouse:move", { e: new MouseEvent("mousemove") });
    // release at (100, 200) — well past MIN_DRAG
    fire(mock, "mouse:up", { e: new MouseEvent("mouseup", { button: 0 }) });

    // After commit: preview removed (count = previews added so far,
    // since each add was paired with a remove on refresh + the final
    // remove at commit). The committed cone is the LAST add.
    const lastAdd = mock.add.mock.calls.at(-1)![0] as fabric.Path;
    expect(lastAdd).toBeInstanceOf(fabric.Path);
    const params = readConeParams(lastAdd);
    expect(params!.sweep).toBeCloseTo(PI / 2, 6);
    expect(readMarkType(lastAdd)).toBe("cone");
    expect(readPhase(lastAdd)).toBe("record");

    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
  });

  it("click-cancels when release is within MIN_DRAG of mouse:down (no commit)", () => {
    const mock = createMockCanvas();
    // mouse:down and release at the same point.
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 100 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    fire(mock, "mouse:up", { e: new MouseEvent("mouseup", { button: 0 }) });

    // Tool remained mounted (only a commit triggers the revert).
    expect(setTool).not.toHaveBeenCalled();
  });

  it("ignores right-button mouse:down (button-reservation contract)", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 100 }));
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 2 }),
    });
    // No preview should be on the canvas — the button-2 mouse:down
    // is ignored.
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("Esc cancels the in-progress drag and reverts to arrow", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 100 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        CONE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: { x: 100, y: 100 },
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
    // Preview removed.
    expect(mock.remove).toHaveBeenCalled();
  });

  it("__cone params survive a write-read roundtrip", () => {
    const obj = CONE_SPEC.build({
      kind: "chained-drag",
      anchor: { x: 0, y: 0 },
      dragStart: { x: 100, y: 0 },
      dragEnd: { x: 0, y: 100 },
      color: "#000",
    });
    const next: ConeParams = {
      origin: { x: 5, y: 5 },
      startAngle: 0.3,
      sweep: 1.2,
      range: 77,
    };
    writeConeParams(obj, next);
    const got = readConeParams(obj);
    expect(got).toEqual(next);
  });
});
