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
    const setTool = vi.fn();
    expect(() =>
      renderHook(() =>
        useEraser(null, setTool, baseTool(ToolType.eraser), new Set())
      )
    ).not.toThrow();
  });

  it("registers mouse listeners only while eraser tool is active", () => {
    const mock = createMockCanvas();
    const { rerender, unmount } = renderHook(
      ({ tool }: { tool: Tool }) =>
        useEraser(asCanvas(mock), vi.fn(), tool, new Set()),
      { initialProps: { tool: baseTool(ToolType.pencil) } }
    );

    expect(mock.on).not.toHaveBeenCalled();

    rerender({ tool: baseTool(ToolType.eraser) });
    expect(mock.on).toHaveBeenCalledWith("mouse:move", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("mouse:up", expect.any(Function));
    expect(mock.selection).toBe(false);

    unmount();
    expect(mock.off).toHaveBeenCalledWith("mouse:move", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith("mouse:up", expect.any(Function));
  });

  it("removes a clicked-on object only while mouse is held down", () => {
    const mock = createMockCanvas();
    renderHook(() =>
      useEraser(asCanvas(mock), vi.fn(), baseTool(ToolType.eraser), new Set())
    );
    const target = { foo: "bar" };

    fire(mock, "mouse:move", { target });
    expect(mock.remove).not.toHaveBeenCalled();

    fire(mock, "mouse:down", {});
    fire(mock, "mouse:move", { target });
    expect(mock.remove).toHaveBeenCalledWith(target);

    fire(mock, "mouse:up", {});
    mock.remove.mockClear();
    fire(mock, "mouse:move", { target });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("onChoice flips the tool to eraser", () => {
    const setTool = vi.fn();
    const tool = baseTool(ToolType.pencil);
    const { result } = renderHook(() =>
      useEraser(null, setTool, tool, new Set())
    );

    act(() => result.current.onChoice());

    expect(setTool).toHaveBeenCalledWith({
      ...tool,
      type: ToolType.eraser,
      cursor: null,
    });
  });
});
