import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarkerRadial, type MarkerOption } from "./MarkerRadial";
import type { SuspensionRef } from "@/hooks/useKeyboardShortcuts";

function makeSlots(): (MarkerOption | null)[] {
  return [
    { url: "x://thick.svg", label: "Thick PMC" },
    { url: "x://med.svg", label: "Med PMC" },
    { url: "x://light.svg", label: "Light PMC" },
    { url: "x://scav.svg", label: "Scav" },
    null,
    null,
    null,
    null,
  ];
}

let suspended: SuspensionRef;
beforeEach(() => {
  suspended = { current: false };
});

describe("MarkerRadial", () => {
  it("sets suspendedRef.current to true on mount and false on unmount", () => {
    // This is the load-bearing contract for R17 — without this
    // the global shortcut hook would steal V/B/E presses while the
    // radial is open.
    const { unmount } = render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    expect(suspended.current).toBe(true);
    unmount();
    expect(suspended.current).toBe(false);
  });

  it("focuses the first non-null wedge on mount", () => {
    render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Thick PMC",
    );
  });

  it("clicking a wedge invokes onSelect with the wedge's url", () => {
    const onSelect = vi.fn();
    render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={onSelect}
        onCancel={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Med PMC" }));
    expect(onSelect).toHaveBeenCalledWith("x://med.svg");
  });

  it("clicking the cancel button invokes onCancel", () => {
    const onCancel = vi.fn();
    render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={onCancel}
        suspendedRef={suspended}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Escape key invokes onCancel", () => {
    const onCancel = vi.fn();
    render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={onCancel}
        suspendedRef={suspended}
      />,
    );
    // Radial element receives the keyDown via React; we fire it on
    // the currently-focused element (the first wedge), which
    // bubbles to the radial's onKeyDown handler.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ArrowRight cycles focus, skipping empty slots", () => {
    render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    // Initial focus is Thick (slot 0). ArrowRight → Med (slot 1).
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Med PMC",
    );
    // Three more rights take us past Light, Scav, and into the
    // empty slots — which should be skipped, wrapping to Thick.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Scav",
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Thick PMC",
    );
  });

  it("backdrop click invokes onCancel", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={onCancel}
        suspendedRef={suspended}
      />,
    );
    const backdrop = container.querySelector(".MarkerRadial-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the prior activeElement on unmount", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open radial";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <MarkerRadial
        center={{ x: 200, y: 200 }}
        slots={makeSlots()}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
