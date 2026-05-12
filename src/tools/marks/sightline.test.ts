import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import { useMark, type UseMarkOptions } from "./useMark";
import {
  SIGHTLINE_SPEC,
  readSightlineParams,
  type SightlineParams,
} from "./sightline";
import { asCanvas, createMockCanvas, fire } from "../../test/mockCanvas";
import { ToolType, type Tool } from "../tool";
import type { Operator } from "@/state/operators";
import type { Point } from "./geometry";
import { readOperator, readPhase, readMarkType } from "../metadata";

// ---- Helpers ------------------------------------------------------

const ALPHA: Operator = {
  id: "op-alpha",
  name: "Alpha",
  color: "#0693E3",
  visible: true,
};

function baseTool(type: ToolType = ToolType.sightline): Tool {
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
  const tool = overrides.tool ?? baseTool(ToolType.sightline);
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

// Anchor + end pairs used in several tests; centralized so the
// 15°-snap math doesn't drift across cases.
const ANCHOR: Point = { x: 100, y: 50 };
const END: Point = { x: 200, y: 50 }; // 0° from +X, on a 15° snap boundary

describe("SIGHTLINE_SPEC", () => {
  it("declares the expected discrete-gesture metadata", () => {
    expect(SIGHTLINE_SPEC.toolType).toBe(ToolType.sightline);
    expect(SIGHTLINE_SPEC.markType).toBe("sightline");
    expect(SIGHTLINE_SPEC.interaction).toBe("chained-click");
    expect(SIGHTLINE_SPEC.colorSource).toBe("operator");
    expect(SIGHTLINE_SPEC.oneShot).toBe(true);
    expect(SIGHTLINE_SPEC.revertTo).toBe(ToolType.arrow);
    expect(SIGHTLINE_SPEC.serialize).toBeTypeOf("function");
    expect(SIGHTLINE_SPEC.deserialize).toBeTypeOf("function");
    // updatePreview is required by the refactor: without it,
    // useMark's chained-click preview redraw silently no-ops on the
    // Path-shaped preview and freezes at zero length. See types.ts
    // on MarkSpec.updatePreview for the rationale.
    expect(SIGHTLINE_SPEC.updatePreview).toBeTypeOf("function");
  });

  it("build returns a fabric.Path with operator-colored stroke + __sightline params", () => {
    const obj = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 10, y: 20 },
      end: { x: 50, y: 60 },
      color: "#0693E3",
    });
    expect(obj).toBeInstanceOf(fabric.Path);
    const path = obj as fabric.Path;
    expect(path.stroke).toBe("#0693E3");
    // Pre-applyPhase: fill is still the raw color (cone-style; the
    // alpha-shifted rgba is written by applyPhase, which useMark
    // calls immediately after build in production).
    expect(path.fill).toBe("#0693E3");

    const params = readSightlineParams(path);
    expect(params).not.toBeNull();
    expect(params!.origin).toEqual({ x: 10, y: 20 });
    expect(params!.range).toBeCloseTo(Math.hypot(40, 40));
    expect(params!.angle).toBeCloseTo(Math.atan2(40, 40)); // π/4
  });

  it("applyPhase shifts fill alpha and stroke dash between record and plan", () => {
    const obj = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      color: "#0693E3",
    });

    SIGHTLINE_SPEC.applyPhase(obj, "plan");
    const path = obj as fabric.Path;
    // Plan: rgba with 8% alpha + dashed stroke matching cone's
    // PLAN_DASH.
    expect(path.fill).toBe("rgba(6, 147, 227, 0.08)");
    expect(path.strokeDashArray).toEqual([10, 15]);

    SIGHTLINE_SPEC.applyPhase(obj, "record");
    // Record: rgba with 15% alpha + solid stroke.
    expect(path.fill).toBe("rgba(6, 147, 227, 0.15)");
    expect(path.strokeDashArray).toEqual([]);
  });

  it("serialize / deserialize round-trip preserves (origin, angle, range)", () => {
    const obj = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 7, y: 11 },
      end: { x: 13, y: 17 },
      color: "#000",
    });
    const state = SIGHTLINE_SPEC.serialize!(obj) as {
      origin: Point;
      angle: number;
      range: number;
    };
    expect(state.origin).toEqual({ x: 7, y: 11 });
    expect(state.angle).toBeCloseTo(Math.atan2(6, 6));
    expect(state.range).toBeCloseTo(Math.hypot(6, 6));

    SIGHTLINE_SPEC.deserialize!(obj, {
      origin: { x: 0, y: 0 },
      angle: 0,
      range: 100,
    });
    const after = readSightlineParams(obj) as SightlineParams;
    expect(after.origin).toEqual({ x: 0, y: 0 });
    expect(after.angle).toBe(0);
    expect(after.range).toBe(100);
  });

  it("build throws on non-chained-click params (defensive)", () => {
    expect(() =>
      SIGHTLINE_SPEC.build({
        kind: "point",
        at: { x: 0, y: 0 },
        color: "#000",
      }),
    ).toThrow(/chained-click/);
  });

  it("updatePreview mutates __sightline params in place (no add/remove)", () => {
    const obj = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      color: "#000",
    });
    SIGHTLINE_SPEC.updatePreview!(obj, {
      kind: "chained-click",
      anchor: { x: 0, y: 0 },
      end: { x: 30, y: 40 },
      color: "#000",
    });
    const p = readSightlineParams(obj) as SightlineParams;
    expect(p.range).toBeCloseTo(50);
    expect(p.angle).toBeCloseTo(Math.atan2(40, 30));
  });
});

describe("useMark(SIGHTLINE_SPEC) — chained-click interaction", () => {
  it("soft-fails to arrow when no lastArrowTip exists", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: null,
        }),
      ),
    );

    // The activation effect should have reverted the tool to
    // SIGHTLINE_SPEC.revertTo (= arrow) immediately.
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
    // No preview was added.
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("adds a transient zero-range preview on activation when an anchor exists", () => {
    const mock = createMockCanvas();
    const undo = makeUndoStub();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          undo,
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    // One add: the preview Path. The preview is marked transient
    // so undo doesn't record it.
    expect(mock.add).toHaveBeenCalledTimes(1);
    const preview = mock.add.mock.calls[0]![0] as fabric.FabricObject;
    expect(preview).toBeInstanceOf(fabric.Path);
    const params = readSightlineParams(preview) as SightlineParams;
    expect(params.origin).toEqual(ANCHOR);
    // Initial preview range == 0 (anchor == end until first move).
    expect(params.range).toBe(0);
    expect(undo.markTransient).toHaveBeenCalledWith(preview);
  });

  it("default mouse:move aims smoothly at the raw cursor (no snap)", () => {
    const mock = createMockCanvas();
    // getScenePoint returns whatever we tell it to. Anchor (100, 50);
    // cursor (200, 17) → raw delta (100, -33), angle ≈ -18.3°.
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 17 }));
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    fire(mock, "mouse:move", { e: new MouseEvent("mousemove") });

    const preview = mock.add.mock.calls[0]![0] as fabric.FabricObject;
    const p = readSightlineParams(preview) as SightlineParams;
    // No modifier → freeform aim. Bisector points directly at the
    // raw cursor delta (no snap).
    expect(p.angle).toBeCloseTo(Math.atan2(-33, 100));
    expect(p.range).toBeCloseTo(Math.hypot(100, 33));
  });

  it("Shift-held mouse:move enables 15° angle snap", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 17 }));
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    const e = new MouseEvent("mousemove", { shiftKey: true });
    fire(mock, "mouse:move", { e });

    const preview = mock.add.mock.calls[0]![0] as fabric.FabricObject;
    const p = readSightlineParams(preview) as SightlineParams;
    // useMark's applyAngleSnap rotates the END point around the
    // anchor to the nearest 15° step. Raw angle atan2(-33, 100) ≈
    // -0.319 rad ≈ -18.3° → snaps to -15° = -π/12. Range is
    // preserved through the snap.
    expect(p.angle).toBeCloseTo(-Math.PI / 12, 6);
    expect(p.range).toBeCloseTo(Math.hypot(100, 33), 6);
  });

  it("commits a sightline on mouse:down and reverts to arrow", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: END.x, y: END.y })); // 0° from anchor (snap boundary)
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    // First call is the preview add (during activation).
    expect(mock.add).toHaveBeenCalledTimes(1);

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    // mouse:down committed a NEW Path (the second add) and removed
    // the preview (the only remove so far).
    expect(mock.add).toHaveBeenCalledTimes(2);
    expect(mock.remove).toHaveBeenCalledTimes(1);
    const committed = mock.add.mock.calls[1]![0] as fabric.FabricObject;
    expect(committed).toBeInstanceOf(fabric.Path);

    const params = readSightlineParams(committed) as SightlineParams;
    expect(params.origin).toEqual(ANCHOR);
    // Cursor (200, 50) is straight +X from anchor; that's already
    // on a snap boundary (0°), so direction is unchanged.
    expect(params.angle).toBeCloseTo(0);
    expect(params.range).toBeCloseTo(END.x - ANCHOR.x);

    expect(readOperator(committed)).toBe(ALPHA.id);
    expect(readPhase(committed)).toBe("record");
    expect(readMarkType(committed)).toBe("sightline");

    // Tool reverts to arrow (SIGHTLINE_SPEC.revertTo).
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
  });

  it("ignores right-button mouse:down (button-reservation contract)", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: END.x, y: END.y }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    // Reset add calls from activation so we count only commit-time
    // adds.
    const addCallsBefore = mock.add.mock.calls.length;
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 2 }),
    });
    // No new commit happened.
    expect(mock.add.mock.calls.length).toBe(addCallsBefore);
    expect(setTool).not.toHaveBeenCalled();
  });

  it("Esc cancels the preview without committing and reverts to arrow", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    const addCallsBefore = mock.add.mock.calls.length;

    // Dispatch a real Escape keydown event on window so the
    // listener installed by useMark catches it.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // No new commit (only the preview remove).
    expect(mock.add.mock.calls.length).toBe(addCallsBefore);
    expect(mock.remove).toHaveBeenCalledTimes(1);
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
  });

  it("removes its preview and listeners on tool deactivation", () => {
    const mock = createMockCanvas();
    // Get a baseline of what events were subscribed during activation.
    const { unmount } = renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    unmount();
    expect(mock.off).toHaveBeenCalledWith("mouse:move", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    // Preview removed during cleanup.
    expect(mock.remove).toHaveBeenCalled();
  });

  it("onChoice sets the tool to sightline", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    const { result } = renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          tool: baseTool(ToolType.arrow),
          lastArrowTip: ANCHOR,
        }),
      ),
    );

    result.current.onChoice();
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.sightline }),
    );
  });
});
