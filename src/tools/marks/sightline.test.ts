import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import { useMark, type UseMarkOptions } from "./useMark";
import { SIGHTLINE_SPEC } from "./sightline";
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
  });

  it("build returns a dashed fabric.Line with operator-colored stroke", () => {
    const line = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 10, y: 20 },
      end: { x: 50, y: 60 },
      color: "#0693E3",
    }) as fabric.Line;
    expect(line).toBeInstanceOf(fabric.Line);
    expect(line.stroke).toBe("#0693E3");
    expect(line.strokeDashArray).toEqual([6, 6]);
    expect(line.x1).toBe(10);
    expect(line.y1).toBe(20);
    expect(line.x2).toBe(50);
    expect(line.y2).toBe(60);
  });

  it("applyPhase swaps the dash density between record and plan", () => {
    const line = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      color: "#000",
    }) as fabric.Line;
    SIGHTLINE_SPEC.applyPhase(line, "plan");
    expect(line.strokeDashArray).toEqual([4, 4]);
    SIGHTLINE_SPEC.applyPhase(line, "record");
    expect(line.strokeDashArray).toEqual([6, 6]);
  });

  it("serialize / deserialize round-trip preserves endpoint coords", () => {
    const line = SIGHTLINE_SPEC.build({
      kind: "chained-click",
      anchor: { x: 7, y: 11 },
      end: { x: 13, y: 17 },
      color: "#000",
    });
    const state = SIGHTLINE_SPEC.serialize!(line);
    expect(state).toEqual({ x1: 7, y1: 11, x2: 13, y2: 17 });

    SIGHTLINE_SPEC.deserialize!(line, { x1: 0, y1: 0, x2: 100, y2: 100 });
    const after = SIGHTLINE_SPEC.serialize!(line);
    expect(after).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
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

  it("adds a transient preview line on activation when an anchor exists", () => {
    const mock = createMockCanvas();
    const undo = makeUndoStub();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          undo,
          lastArrowTip: { x: 100, y: 50 },
        }),
      ),
    );

    // One add: the preview line. The preview is marked transient
    // so undo doesn't record it.
    expect(mock.add).toHaveBeenCalledTimes(1);
    const preview = mock.add.mock.calls[0]![0] as fabric.Line;
    expect(preview).toBeInstanceOf(fabric.Line);
    expect(preview.x1).toBe(100);
    expect(preview.y1).toBe(50);
    // Initial preview end == anchor (zero-length until first move).
    expect(preview.x2).toBe(100);
    expect(preview.y2).toBe(50);
    expect(undo.markTransient).toHaveBeenCalledWith(preview);
  });

  it("updates the preview end on mouse:move with 15° angle snap", () => {
    const mock = createMockCanvas();
    // getScenePoint returns whatever we tell it to.
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 17 })); // ~5° from +X
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 50 },
        }),
      ),
    );

    fire(mock, "mouse:move", { e: new MouseEvent("mousemove") });
    const preview = mock.add.mock.calls[0]![0] as fabric.Line;
    // Anchor (100, 50). Raw cursor (200, 17). Raw delta (100, -33),
    // angle ≈ -18.3°, snaps to -15° (= -π/12 rad). Range = √(100² +
    // 33²) ≈ 105.3. End = anchor + range * (cos(-15°), sin(-15°)).
    const range = Math.hypot(100, -33);
    const expectedX = 100 + range * Math.cos(-Math.PI / 12);
    const expectedY = 50 + range * Math.sin(-Math.PI / 12);
    expect(preview.x2).toBeCloseTo(expectedX, 6);
    expect(preview.y2).toBeCloseTo(expectedY, 6);
  });

  it("Shift-held mouse:move disables angle snap", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 17 }));
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          lastArrowTip: { x: 100, y: 50 },
        }),
      ),
    );

    const e = new MouseEvent("mousemove", { shiftKey: true });
    fire(mock, "mouse:move", { e });

    const preview = mock.add.mock.calls[0]![0] as fabric.Line;
    // No snap → preview ends at the raw cursor position.
    expect(preview.x2).toBe(200);
    expect(preview.y2).toBe(17);
  });

  it("commits a sightline on mouse:down and reverts to arrow", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 50 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: { x: 100, y: 50 },
        }),
      ),
    );

    // First call is the preview add (during activation).
    expect(mock.add).toHaveBeenCalledTimes(1);

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    // mouse:down committed a NEW line (the second add) and removed
    // the preview (the only remove so far).
    expect(mock.add).toHaveBeenCalledTimes(2);
    expect(mock.remove).toHaveBeenCalledTimes(1);
    const committed = mock.add.mock.calls[1]![0] as fabric.Line;
    expect(committed).toBeInstanceOf(fabric.Line);
    expect(committed.x1).toBe(100);
    expect(committed.y1).toBe(50);
    // Angle snap kicks in: cursor (200, 50) is straight +X from
    // anchor; that's already on a snap boundary (0°), so end is
    // unchanged.
    expect(committed.x2).toBeCloseTo(200);
    expect(committed.y2).toBeCloseTo(50);
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
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 50 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        SIGHTLINE_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
          lastArrowTip: { x: 100, y: 50 },
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
          lastArrowTip: { x: 100, y: 50 },
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
          lastArrowTip: { x: 100, y: 50 },
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
          lastArrowTip: { x: 100, y: 50 },
        }),
      ),
    );

    result.current.onChoice();
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.sightline }),
    );
  });
});
