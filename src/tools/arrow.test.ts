import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import { useArrow } from "./arrow";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";
import { Tool, ToolType } from "./tool";
import {
  readOperator,
  readPhase,
  readMarkType,
  readArrowTip,
} from "./metadata";

function baseTool(type: ToolType = ToolType.arrow): Tool {
  return { type, active: false, cursor: null };
}

/**
 * Build a real fabric.Path from an SVG path-data string. We need an
 * actual fabric.Path (not a duck-typed stub) because the postprocess
 * constructs a fabric.Group from it, and Group's constructor calls
 * `_set` on its children — a method only the real fabric.Object
 * subclass tree exposes.
 *
 * The commands argument is a convenience: we render it into SVG
 * path-data text (e.g. [["M",0,0],["Q",5,0,10,0]] → "M 0 0 Q 5 0
 * 10 0") so callers can keep their inputs in the same shape the
 * arrowhead math operates on.
 */
function mockPath(
  commands: (string | number)[][],
  stroke = "#0693E3",
): fabric.Path {
  const d = commands
    .map((c) => c.map((v) => String(v)).join(" "))
    .join(" ");
  return new fabric.Path(d, { stroke });
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

describe("useArrow", () => {
  it("activates drawing mode when tool is arrow", () => {
    const mock = createMockCanvas();
    mock.isDrawingMode = false;
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        null,
        "record",
        null,
      ),
    );
    expect(mock.isDrawingMode).toBe(true);
  });

  it("appends an arrowhead and groups path + arrowhead on commit", () => {
    const mock = createMockCanvas();
    const undo = makeUndoStub();
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        "alpha",
        "record",
        undo,
      ),
    );

    // A two-command path: M(0,0), Q(5,0,10,0). Endpoint (10,0),
    // tangent (1,0).
    const path = mockPath([
      ["M", 0, 0],
      ["Q", 5, 0, 10, 0],
    ]);

    fire(mock, "path:created", { path });

    // The postprocess should have:
    //  1. popped the path's auto-add
    //  2. marked the path transient
    //  3. removed the path from the canvas
    //  4. added a group (containing path + arrowhead)
    expect(undo.popLastAction).toHaveBeenCalledTimes(1);
    expect(undo.markTransient).toHaveBeenCalledWith(path);
    expect(mock.remove).toHaveBeenCalledWith(path);
    expect(mock.add).toHaveBeenCalledTimes(1);
    // The added object is a fabric.Group.
    const added = mock.add.mock.calls[0]![0];
    expect(added).toBeInstanceOf(fabric.Group);
  });

  it("tags the resulting group with operator, phase, and markType='arrow'", () => {
    const mock = createMockCanvas();
    const undo = makeUndoStub();
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        "bravo",
        "plan",
        undo,
      ),
    );

    fire(mock, "path:created", {
      path: mockPath([
        ["M", 0, 0],
        ["Q", 5, 5, 10, 10],
      ]),
    });

    const group = mock.add.mock.calls[0]![0] as fabric.Group;
    expect(readOperator(group)).toBe("bravo");
    expect(readPhase(group)).toBe("plan");
    expect(readMarkType(group)).toBe("arrow");
  });

  it("tags the resulting group with __arrowTip = the path's terminal endpoint", () => {
    // The chain-anchor recomputer in App.tsx reads __arrowTip on
    // every canvas walk. Storing the tip on the OBJECT (not in an
    // outside ref) is what makes undo / eraser update the anchor
    // automatically — see App.tsx `recomputeLastArrowTip` and
    // metadata.ts `tagArrowTip`/`readArrowTip`.
    const mock = createMockCanvas();
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        null,
        "record",
        makeUndoStub(),
      ),
    );

    fire(mock, "path:created", {
      path: mockPath([
        ["M", 0, 0],
        ["Q", 50, 20, 100, 40],
      ]),
    });

    const group = mock.add.mock.calls[0]![0] as fabric.Group;
    expect(readArrowTip(group)).toEqual({ x: 100, y: 40 });
  });

  it("works without an undo API (falls back to skipping the popLastAction step)", () => {
    const mock = createMockCanvas();
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        null,
        "record",
        null, // no undo wired
      ),
    );

    fire(mock, "path:created", {
      path: mockPath([
        ["M", 0, 0],
        ["Q", 5, 0, 10, 0],
      ]),
    });

    // Even without undo, the group should still be added — the
    // postprocess simply skips the popLastAction / markTransient
    // steps that would otherwise reconcile the undo stack. The tip
    // is still tagged so the chain anchor recomputer can read it.
    expect(mock.add).toHaveBeenCalledTimes(1);
    const group = mock.add.mock.calls[0]![0] as fabric.Group;
    expect(group).toBeInstanceOf(fabric.Group);
    expect(readArrowTip(group)).toEqual({ x: 10, y: 0 });
  });

  it("bails out on an empty path command list rather than crashing", () => {
    const mock = createMockCanvas();
    renderHook(() =>
      useArrow(
        asCanvas(mock),
        () => {},
        baseTool(ToolType.arrow),
        null,
        "record",
        makeUndoStub(),
      ),
    );

    // Pathological empty-command path. Defensive guard in the
    // postprocess returns early; the raw path remains on the
    // canvas untouched.
    expect(() => fire(mock, "path:created", { path: mockPath([]) })).not.toThrow();
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("onChoice sets the tool to arrow", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    const { result } = renderHook(() =>
      useArrow(
        asCanvas(mock),
        setTool,
        baseTool(ToolType.pencil),
        null,
        "record",
        null,
      ),
    );
    result.current.onChoice();
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.arrow }),
    );
  });
});
