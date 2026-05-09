import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePencil } from "./pencil";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas } from "../test/mockCanvas";

const baseTool = (type: ToolType): Tool => ({
  active: false,
  type,
  cursor: null,
});

describe("usePencil", () => {
  it("does not crash with null canvas", () => {
    expect(() =>
      renderHook(() =>
        usePencil(null, vi.fn(), baseTool(ToolType.select), vi.fn())
      )
    ).not.toThrow();
  });

  it("enables drawing mode while pencil is active and disables on cleanup", () => {
    const mock = createMockCanvas();
    mock.isDrawingMode = false;
    const { unmount } = renderHook(() =>
      usePencil(asCanvas(mock), vi.fn(), baseTool(ToolType.pencil), vi.fn())
    );
    expect(mock.isDrawingMode).toBe(true);

    unmount();
    expect(mock.isDrawingMode).toBe(false);
  });

  it("onChoice flips the tool to pencil", () => {
    const setTool = vi.fn();
    const tool = baseTool(ToolType.select);
    const { result } = renderHook(() =>
      usePencil(null, setTool, tool, vi.fn())
    );

    act(() => result.current.onChoice());

    expect(setTool).toHaveBeenCalledWith({
      ...tool,
      type: ToolType.pencil,
      cursor: null,
    });
  });

  it("onColorChoice updates brush color and reports back", () => {
    const setColor = vi.fn();
    const mock = createMockCanvas();
    const { result } = renderHook(() =>
      usePencil(asCanvas(mock), vi.fn(), baseTool(ToolType.pencil), setColor)
    );

    act(() => {
      result.current.onColorChoice({
        hex: "#abcdef",
      } as Parameters<typeof result.current.onColorChoice>[0]);
    });

    expect(setColor).toHaveBeenCalledWith("#abcdef");
    expect(mock.freeDrawingBrush.color).toBe("#abcdef");
  });
});
