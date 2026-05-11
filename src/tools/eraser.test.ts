import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useEraser } from "./eraser";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";

const baseTool = (type: ToolType): Tool => ({
  active: false,
  type,
  cursor: null,
});

describe("useEraser", () => {
  it("does not crash with null canvas", () => {
    expect(() =>
      renderHook(() =>
        useEraser(null, vi.fn(), baseTool(ToolType.eraser), new Set()),
      ),
    ).not.toThrow();
  });

  it("registers mouse:down/up only while eraser tool is active", () => {
    const mock = createMockCanvas();
    const { rerender, unmount } = renderHook(
      ({ tool }: { tool: Tool }) =>
        useEraser(asCanvas(mock), vi.fn(), tool, new Set()),
      { initialProps: { tool: baseTool(ToolType.pencil) } },
    );

    expect(mock.on).not.toHaveBeenCalled();

    rerender({ tool: baseTool(ToolType.eraser) });
    expect(mock.on).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("mouse:up", expect.any(Function));
    expect(mock.selection).toBe(false);

    unmount();
    expect(mock.off).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith("mouse:up", expect.any(Function));
  });

  it("erases on mouse:move only while LEFT button is held", () => {
    // Behavior wraps eraserCore.createEraserSession — the session
    // arms on mouse:down and disarms on mouse:up. Movement between
    // those events removes hovered targets.
    const mock = createMockCanvas();
    renderHook(() =>
      useEraser(
        asCanvas(mock),
        vi.fn(),
        baseTool(ToolType.eraser),
        new Set(),
      ),
    );
    const target = { foo: "bar" };

    fire(mock, "mouse:move", { target });
    expect(mock.remove).not.toHaveBeenCalled();

    fire(mock, "mouse:down", { e: { button: 0 } });
    fire(mock, "mouse:move", { target });
    expect(mock.remove).toHaveBeenCalledWith(target);

    fire(mock, "mouse:up", { e: { button: 0 } });
    mock.remove.mockClear();
    fire(mock, "mouse:move", { target });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("RIGHT-button down does NOT arm the locked eraser (§4.5)", () => {
    // The right-mouse-hold quasi-eraser flows through
    // useKeyboardShortcuts + eraserCore directly, NOT through this
    // hook. The button-reservation contract ensures that if the
    // user happens to be in locked-eraser mode AND right-clicks,
    // they don't get double-armed (which is harmless but wasted
    // work).
    const mock = createMockCanvas();
    renderHook(() =>
      useEraser(
        asCanvas(mock),
        vi.fn(),
        baseTool(ToolType.eraser),
        new Set(),
      ),
    );
    fire(mock, "mouse:down", { e: { button: 2 } });
    fire(mock, "mouse:move", { target: { foo: "bar" } });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("onChoice flips the tool to eraser", () => {
    const setTool = vi.fn();
    const tool = baseTool(ToolType.pencil);
    const { result } = renderHook(() =>
      useEraser(null, setTool, tool, new Set()),
    );

    act(() => result.current.onChoice());

    expect(setTool).toHaveBeenCalledWith({
      ...tool,
      type: ToolType.eraser,
      cursor: null,
    });
  });
});
