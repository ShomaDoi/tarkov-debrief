import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useKeyboardShortcuts,
  type Binding,
  type SuspensionRef,
} from "./useKeyboardShortcuts";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...modifiers }));
}
function release(key: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { key }));
}

let suspended: SuspensionRef;
beforeEach(() => {
  suspended = { current: false };
});

describe("press bindings", () => {
  it("fires onPress on a matching unmodified keydown", () => {
    const mock = createMockCanvas();
    const onPress = vi.fn();
    const bindings: Binding[] = [{ kind: "press", key: "v", onPress }];
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings,
        suspendedRef: suspended,
      }),
    );
    press("v");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire when an input owns focus", () => {
    const mock = createMockCanvas();
    const onPress = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "press", key: "v", onPress }],
        suspendedRef: suspended,
      }),
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    press("v");
    expect(onPress).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("modifier-strict: Ctrl+Shift+Z does NOT match a Ctrl+Z binding", () => {
    // This is the regression for design doc §4.2: without strict
    // matching, the future redo binding (Ctrl+Shift+Z) would
    // accidentally trigger undo.
    const mock = createMockCanvas();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          {
            kind: "press",
            key: "z",
            modifiers: ["cmdOrCtrl"],
            onPress: onUndo,
          },
        ],
        suspendedRef: suspended,
      }),
    );
    press("z", { ctrlKey: true, shiftKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("cmdOrCtrl matches Meta on Mac and Ctrl on Win/Linux", () => {
    const mock = createMockCanvas();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          {
            kind: "press",
            key: "z",
            modifiers: ["cmdOrCtrl"],
            onPress: onUndo,
          },
        ],
        suspendedRef: suspended,
      }),
    );
    press("z", { metaKey: true });
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it("tap repeat is allowed (hold Cmd+Z fires multiple times)", () => {
    // Preserves the original useUndo behavior: holding Cmd+Z spams
    // undo. We do NOT suppress keydown auto-repeat for press bindings.
    const mock = createMockCanvas();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          {
            kind: "press",
            key: "z",
            modifiers: ["cmdOrCtrl"],
            onPress: onUndo,
          },
        ],
        suspendedRef: suspended,
      }),
    );
    press("z", { ctrlKey: true });
    press("z", { ctrlKey: true });
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(3);
  });
});

describe("hold bindings", () => {
  it("fires onEnter on keydown and onExit on keyup", () => {
    const mock = createMockCanvas();
    const onEnter = vi.fn();
    const onExit = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "hold", key: " ", onEnter, onExit }],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    expect(onEnter).toHaveBeenCalledTimes(1);
    release(" ");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("suppresses keydown repeat (onEnter fires once)", () => {
    const mock = createMockCanvas();
    const onEnter = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "hold", key: " ", onEnter, onExit: vi.fn() }],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    press(" ");
    press(" ");
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("a second hold while another is active is ignored", () => {
    const mock = createMockCanvas();
    const enterA = vi.fn();
    const enterB = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "hold", key: " ", onEnter: enterA, onExit: vi.fn() },
          { kind: "hold", key: "x", onEnter: enterB, onExit: vi.fn() },
        ],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    press("x");
    expect(enterA).toHaveBeenCalledTimes(1);
    expect(enterB).not.toHaveBeenCalled();
  });

  it("blur auto-releases an active hold", () => {
    // R1: alt-tabbing while holding Space must not leave the app
    // stuck in pan mode.
    const mock = createMockCanvas();
    const onExit = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "hold", key: " ", onEnter: vi.fn(), onExit }],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    window.dispatchEvent(new Event("blur"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a modified hold key is rejected (Cmd+Space doesn't start pan)", () => {
    const mock = createMockCanvas();
    const onEnter = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "hold", key: " ", onEnter, onExit: vi.fn() }],
        suspendedRef: suspended,
      }),
    );
    press(" ", { metaKey: true });
    expect(onEnter).not.toHaveBeenCalled();
  });
});

describe("interaction between holds and presses", () => {
  it("unmodified press is suppressed while a hold is active", () => {
    const mock = createMockCanvas();
    const onPressV = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "hold", key: " ", onEnter: vi.fn(), onExit: vi.fn() },
          { kind: "press", key: "v", onPress: onPressV },
        ],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    press("v");
    expect(onPressV).not.toHaveBeenCalled();
  });

  it("MODIFIED press still fires while a hold is active (undo works during pan)", () => {
    // Carve-out per §4.4 item 3. Pan-while-undoing is a legitimate
    // flow; the suppression rule applies to unmodified taps only.
    const mock = createMockCanvas();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "hold", key: " ", onEnter: vi.fn(), onExit: vi.fn() },
          {
            kind: "press",
            key: "z",
            modifiers: ["cmdOrCtrl"],
            onPress: onUndo,
          },
        ],
        suspendedRef: suspended,
      }),
    );
    press(" ");
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe("suspension (radial open)", () => {
  it("unmodified presses suppressed while suspended", () => {
    const mock = createMockCanvas();
    const onPress = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "press", key: "v", onPress }],
        suspendedRef: suspended,
      }),
    );
    suspended.current = true;
    press("v");
    expect(onPress).not.toHaveBeenCalled();
    suspended.current = false;
    press("v");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("modified presses (Cmd/Ctrl+Z) still fire while suspended", () => {
    const mock = createMockCanvas();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          {
            kind: "press",
            key: "z",
            modifiers: ["cmdOrCtrl"],
            onPress: onUndo,
          },
        ],
        suspendedRef: suspended,
      }),
    );
    suspended.current = true;
    press("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe("mouse-hold bindings", () => {
  it("fires onEnter on matching button down, onExit on up", () => {
    const mock = createMockCanvas();
    const onEnter = vi.fn();
    const onExit = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [{ kind: "mouseHold", button: 2, onEnter, onExit }],
        suspendedRef: suspended,
      }),
    );
    fire(mock, "mouse:down", { e: { button: 2 } });
    fire(mock, "mouse:up", { e: { button: 2 } });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("ignores other buttons", () => {
    const mock = createMockCanvas();
    const onEnter = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "mouseHold", button: 2, onEnter, onExit: vi.fn() },
        ],
        suspendedRef: suspended,
      }),
    );
    fire(mock, "mouse:down", { e: { button: 0 } });
    fire(mock, "mouse:down", { e: { button: 1 } });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("attaches a contextmenu listener to upperCanvasEl", () => {
    // Without this, the OS context menu hijacks right-clicks before
    // we can use them as quasi-erasers.
    const mock = createMockCanvas();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [],
        suspendedRef: suspended,
      }),
    );
    expect(mock.upperCanvasEl.addEventListener).toHaveBeenCalledWith(
      "contextmenu",
      expect.any(Function),
    );
  });

  it("right-mouse-down is ignored while a keyboard hold is active (mutex)", () => {
    // Regression for the "nested quasi-modes leak state" bug.
    // If the user holds Space (pan) AND then right-mouse-downs,
    // we must NOT fire the eraser onEnter — both would clobber
    // each other's previousTool tracking in App.tsx.
    const mock = createMockCanvas();
    const eraserEnter = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "hold", key: " ", onEnter: vi.fn(), onExit: vi.fn() },
          {
            kind: "mouseHold",
            button: 2,
            onEnter: eraserEnter,
            onExit: vi.fn(),
          },
        ],
        suspendedRef: suspended,
      }),
    );
    press(" "); // enter pan via Space
    fire(mock, "mouse:down", { e: { button: 2 } });
    expect(eraserEnter).not.toHaveBeenCalled();
  });

  it("keyboard hold is ignored while a mouse hold is active (mutex)", () => {
    // Inverse of the above.
    const mock = createMockCanvas();
    const panEnter = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "hold", key: " ", onEnter: panEnter, onExit: vi.fn() },
          {
            kind: "mouseHold",
            button: 2,
            onEnter: vi.fn(),
            onExit: vi.fn(),
          },
        ],
        suspendedRef: suspended,
      }),
    );
    fire(mock, "mouse:down", { e: { button: 2 } });
    press(" ");
    expect(panEnter).not.toHaveBeenCalled();
  });

  it("blur auto-releases an active mouse hold", () => {
    const mock = createMockCanvas();
    const onExit = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(asCanvas(mock), {
        bindings: [
          { kind: "mouseHold", button: 2, onEnter: vi.fn(), onExit },
        ],
        suspendedRef: suspended,
      }),
    );
    fire(mock, "mouse:down", { e: { button: 2 } });
    window.dispatchEvent(new Event("blur"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("ref-mirror regression (R12)", () => {
  it("a binding reconfigured between renders is honored without re-installing the window listener", () => {
    const mock = createMockCanvas();
    let pressedA = 0;
    let pressedB = 0;
    const { rerender } = renderHook(
      ({ bindings }: { bindings: Binding[] }) =>
        useKeyboardShortcuts(asCanvas(mock), {
          bindings,
          suspendedRef: suspended,
        }),
      {
        initialProps: {
          bindings: [
            { kind: "press", key: "v", onPress: () => (pressedA += 1) },
          ],
        },
      },
    );
    press("v");
    expect(pressedA).toBe(1);

    // Window listener installation count BEFORE re-render. We can't
    // observe addEventListener directly without monkeypatching, so
    // we instead assert behavior: replacing the bindings with a new
    // callback should route the next press through the new one.
    rerender({
      bindings: [
        { kind: "press", key: "v", onPress: () => (pressedB += 1) },
      ],
    });
    press("v");
    expect(pressedA).toBe(1); // old callback NOT re-fired
    expect(pressedB).toBe(1); // new callback fired
  });
});
