import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useSelect } from "./select";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas } from "../test/mockCanvas";

const baseTool = (type: ToolType): Tool => ({
  active: false,
  type,
  cursor: null,
});

describe("useSelect", () => {
  it("does not crash with null canvas", () => {
    const setTool = vi.fn();
    expect(() =>
      renderHook(() => useSelect(null, setTool, baseTool(ToolType.pencil)))
    ).not.toThrow();
  });

  it("enables canvas selection while select is active and restores on cleanup", () => {
    const setTool = vi.fn();
    const mock = createMockCanvas();
    const { unmount } = renderHook(() =>
      useSelect(asCanvas(mock), setTool, baseTool(ToolType.select))
    );
    expect(mock.selection).toBe(true);
    expect(mock.perPixelTargetFind).toBe(false);

    unmount();
    expect(mock.selection).toBe(false);
    expect(mock.perPixelTargetFind).toBe(true);
  });

  it("discards the active object on cleanup (stuck-in-selection fix)", () => {
    const setTool = vi.fn();
    const mock = createMockCanvas();
    const { unmount } = renderHook(() =>
      useSelect(asCanvas(mock), setTool, baseTool(ToolType.select))
    );
    unmount();
    // Without this, leaving select mode with an active object still
    // set means the next tool's mouse:down is interpreted by
    // fabric as "drag the active object" instead of reaching the
    // tool's own handler. See select.ts comment for the rationale.
    expect(mock.discardActiveObject).toHaveBeenCalledTimes(1);
    expect(mock.requestRenderAll).toHaveBeenCalled();
  });

  it("leaves canvas alone when another tool is active", () => {
    const setTool = vi.fn();
    const mock = createMockCanvas();
    renderHook(() =>
      useSelect(asCanvas(mock), setTool, baseTool(ToolType.pencil))
    );
    expect(mock.selection).toBe(false);
  });

  it("onChoice flips the tool to select", () => {
    const setTool = vi.fn();
    const tool = baseTool(ToolType.pencil);
    const { result } = renderHook(() => useSelect(null, setTool, tool));

    act(() => result.current.onChoice());

    expect(setTool).toHaveBeenCalledWith({
      ...tool,
      type: ToolType.select,
      cursor: null,
    });
  });
});
