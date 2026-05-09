import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useStamp } from "./stamp";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas } from "../test/mockCanvas";

const baseTool = (type: ToolType): Tool => ({
  active: false,
  type,
  cursor: null,
});

describe("useStamp", () => {
  it("does not crash with null canvas", () => {
    expect(() =>
      renderHook(() =>
        useStamp(null, vi.fn(), baseTool(ToolType.marker), vi.fn())
      )
    ).not.toThrow();
  });

  it("registers mouse:down only when marker tool is active", () => {
    const mock = createMockCanvas();
    const { rerender, unmount } = renderHook(
      ({ tool }: { tool: Tool }) =>
        useStamp(asCanvas(mock), vi.fn(), tool, vi.fn()),
      { initialProps: { tool: baseTool(ToolType.pencil) } }
    );
    expect(mock.on).not.toHaveBeenCalledWith(
      "mouse:down",
      expect.any(Function)
    );

    rerender({ tool: baseTool(ToolType.marker) });
    expect(mock.on).toHaveBeenCalledWith("mouse:down", expect.any(Function));

    unmount();
    expect(mock.off).toHaveBeenCalledWith("mouse:down", expect.any(Function));
  });

  it("onChoice closes the sidebar, sets cursor, and flips the tool", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    const setSidebar = vi.fn();
    const tool = baseTool(ToolType.pencil);
    const { result } = renderHook(() =>
      useStamp(asCanvas(mock), setSidebar, tool, setTool)
    );

    const fakeButton = {
      target: { src: "http://example.com/scav.svg" },
    } as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>;
    result.current.onChoice(fakeButton);

    expect(setSidebar).toHaveBeenCalledWith(false);
    expect(setTool).toHaveBeenCalledWith({ ...tool, type: ToolType.marker });
    expect(mock.defaultCursor).toContain("scav.svg");
    expect(mock.hoverCursor).toContain("scav.svg");
  });
});
