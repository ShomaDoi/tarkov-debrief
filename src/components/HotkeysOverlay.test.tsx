import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HotkeysOverlay } from "./HotkeysOverlay";
import type { SuspensionRef } from "@/hooks/useKeyboardShortcuts";

let suspended: SuspensionRef;
beforeEach(() => {
  suspended = { current: false };
});

describe("HotkeysOverlay", () => {
  it("renders nothing when closed", () => {
    render(
      <HotkeysOverlay
        open={false}
        onClose={vi.fn()}
        suspendedRef={suspended}
      />,
    );
    // Dialog role is the load-bearing test for "is the overlay
    // mounted as a modal." Absent when closed.
    expect(screen.queryByRole("dialog")).toBeNull();
    // And global shortcuts stay live when the overlay isn't open.
    expect(suspended.current).toBe(false);
  });

  it("renders a dialog when open and suspends global shortcuts", () => {
    // Same load-bearing contract as MarkerRadial — without
    // suspension, typing letter keys (V, B, ...) while the
    // overlay's open would silently switch tools underneath.
    const { unmount } = render(
      <HotkeysOverlay open onClose={vi.fn()} suspendedRef={suspended} />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(suspended.current).toBe(true);
    unmount();
    expect(suspended.current).toBe(false);
  });

  it("includes every known hotkey section heading", () => {
    // Periodic-drift safeguard: if a section's title changes in
    // the catalog, this test flags it. Each section needs to
    // appear at least once.
    render(
      <HotkeysOverlay open onClose={vi.fn()} suspendedRef={suspended} />,
    );
    expect(screen.getByText(/^Tools$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Tactical marks$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Phase$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Other$/i)).toBeInTheDocument();
  });

  it("documents the P2 Shift+Space replay binding", () => {
    // Periodic-drift safeguard: if the design or wiring of the
    // replay scrubber changes (e.g. a different modifier or a new
    // key), this test flags the overlay row going stale. The
    // useKeyboardShortcuts binding in App.tsx is the source of
    // truth; the overlay must match.
    render(
      <HotkeysOverlay open onClose={vi.fn()} suspendedRef={suspended} />,
    );
    // The kbd pill renders the literal string "Shift + Space".
    const pill = screen.getByText(/Shift \+ Space/i, { selector: "kbd" });
    expect(pill).toBeInTheDocument();
  });

  it("lists each P1 tactical-mark binding (A, S, O, X, I, D, T)", () => {
    // The overlay is the user-visible reference for these keys.
    // If a binding ships in App.tsx but isn't reflected here, the
    // user has no way to discover it. This test catches the
    // omission for the P1 vocabulary set.
    render(
      <HotkeysOverlay open onClose={vi.fn()} suspendedRef={suspended} />,
    );
    for (const key of ["A", "S", "O", "X", "I", "D", "T"]) {
      // Each key appears in its own kbd pill. We assert the kbd
      // element specifically (queryByText would also match labels).
      const pills = screen
        .getAllByText(key, { selector: "kbd" })
        .filter((el) => el.textContent === key);
      expect(pills.length).toBeGreaterThan(0);
    }
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <HotkeysOverlay open onClose={onClose} suspendedRef={suspended} />,
    );
    // The backdrop is a div with class HotkeysOverlay-backdrop.
    // We find it via document.querySelector since it has no
    // accessible role.
    const backdrop = document.querySelector(".HotkeysOverlay-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Esc is pressed inside the dialog", () => {
    const onClose = vi.fn();
    render(
      <HotkeysOverlay open onClose={onClose} suspendedRef={suspended} />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <HotkeysOverlay open onClose={onClose} suspendedRef={suspended} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking INSIDE the dialog does not dismiss", () => {
    // stopPropagation on the dialog itself prevents the click from
    // bubbling to the backdrop's onClick. Without it, any click
    // inside the dialog (e.g. selecting text) would close the
    // overlay.
    const onClose = vi.fn();
    render(
      <HotkeysOverlay open onClose={onClose} suspendedRef={suspended} />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
