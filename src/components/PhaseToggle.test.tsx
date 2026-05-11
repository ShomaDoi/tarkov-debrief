import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PhaseToggle } from "./PhaseToggle";

describe("PhaseToggle", () => {
  it("renders both segments with aria-pressed reflecting active phase", () => {
    render(<PhaseToggle phase="record" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /record/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /plan/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking the inactive segment fires onChange with the target", () => {
    const onChange = vi.fn();
    render(<PhaseToggle phase="record" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /plan/i }));
    expect(onChange).toHaveBeenCalledWith("plan");
  });

  it("clicking the already-active segment is a no-op", () => {
    const onChange = vi.fn();
    render(<PhaseToggle phase="plan" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /plan/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
