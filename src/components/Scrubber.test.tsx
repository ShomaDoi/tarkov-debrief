import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Scrubber, formatTime } from "./Scrubber";
import type { Slot, UseTimelineReturn } from "@/state/timeline";

// Helpers — synthesize a UseTimelineReturn for component-level tests
// without spinning up the canvas + RAF infrastructure that
// useTimeline normally drives. Mutators are vi.fn so tests can
// assert they were called.

interface MockTimelineOpts {
  slotCount?: number;
  playhead?: number;
  playbackTotalDuration?: number;
  isPlaying?: boolean;
  isLive?: boolean;
  speed?: 0.5 | 1 | 2;
}

function mkTimeline(opts: MockTimelineOpts = {}): UseTimelineReturn {
  const slotCount = opts.slotCount ?? 1;
  const playbackTotalDuration = opts.playbackTotalDuration ?? 1000;
  const playhead = opts.playhead ?? playbackTotalDuration; // default: live
  const slots: Slot[] = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      id: `id-${i}`,
      seq: i,
      // Test stand-in; the Scrubber doesn't read obj, just .id/.seq.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj: {} as any,
      logicalSlotStart: i * 500,
      logicalAnimDuration: 0,
    });
  }
  return {
    slots,
    logicalTotalDuration: playbackTotalDuration,
    playbackTotalDuration,
    playhead,
    setPlayhead: vi.fn(),
    isLive: opts.isLive ?? playhead >= playbackTotalDuration,
    isPlaying: opts.isPlaying ?? false,
    speed: opts.speed ?? 1,
    setSpeed: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
  };
}

describe("formatTime", () => {
  it("formats sub-second values as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(999)).toBe("0:00");
  });

  it("formats seconds and minutes", () => {
    expect(formatTime(1000)).toBe("0:01");
    expect(formatTime(60_000)).toBe("1:00");
    expect(formatTime(73_500)).toBe("1:13"); // floor on seconds
    expect(formatTime(125_000)).toBe("2:05");
  });

  it("clamps negative input to zero", () => {
    expect(formatTime(-100)).toBe("0:00");
  });
});

describe("Scrubber", () => {
  it("renders nothing when the timeline is empty", () => {
    const timeline = mkTimeline({ slotCount: 0, playbackTotalDuration: 0 });
    const { container } = render(<Scrubber timeline={timeline} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the region when at least one slot exists", () => {
    const timeline = mkTimeline({ slotCount: 1 });
    render(<Scrubber timeline={timeline} />);
    expect(screen.getByRole("region", { name: /Replay scrubber/i })).toBeInTheDocument();
  });

  it("renders the play button labeled 'Play' when not playing", () => {
    const timeline = mkTimeline({ isPlaying: false });
    render(<Scrubber timeline={timeline} />);
    expect(screen.getByRole("button", { name: /play$/i })).toBeInTheDocument();
  });

  it("renders the play button labeled 'Pause' when playing", () => {
    const timeline = mkTimeline({ isPlaying: true });
    render(<Scrubber timeline={timeline} />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("clicking play calls timeline.play()", () => {
    const timeline = mkTimeline({ isPlaying: false });
    render(<Scrubber timeline={timeline} />);
    fireEvent.click(screen.getByRole("button", { name: /play$/i }));
    expect(timeline.play).toHaveBeenCalledTimes(1);
    expect(timeline.pause).not.toHaveBeenCalled();
  });

  it("clicking pause calls timeline.pause()", () => {
    const timeline = mkTimeline({ isPlaying: true });
    render(<Scrubber timeline={timeline} />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(timeline.pause).toHaveBeenCalledTimes(1);
    expect(timeline.play).not.toHaveBeenCalled();
  });

  it("clicking Live snaps the playhead to playbackTotalDuration", () => {
    const timeline = mkTimeline({
      playhead: 200,
      playbackTotalDuration: 1000,
      isLive: false,
    });
    render(<Scrubber timeline={timeline} />);
    fireEvent.click(screen.getByRole("button", { name: /jump to live/i }));
    expect(timeline.setPlayhead).toHaveBeenCalledWith(1000);
  });

  it("Live button shows active state when isLive", () => {
    const timeline = mkTimeline({ isLive: true });
    render(<Scrubber timeline={timeline} />);
    const btn = screen.getByRole("button", { name: /jump to live/i });
    expect(btn.className).toContain("Scrubber-live--active");
  });

  it("speed buttons render all three options", () => {
    const timeline = mkTimeline();
    render(<Scrubber timeline={timeline} />);
    expect(screen.getByRole("button", { name: /0\.5x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^playback speed 1x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2x/i })).toBeInTheDocument();
  });

  it("clicking a speed button calls setSpeed", () => {
    const timeline = mkTimeline({ speed: 1 });
    render(<Scrubber timeline={timeline} />);
    fireEvent.click(screen.getByRole("button", { name: /2x/i }));
    expect(timeline.setSpeed).toHaveBeenCalledWith(2);
  });

  it("active speed button has the active class", () => {
    const timeline = mkTimeline({ speed: 2 });
    render(<Scrubber timeline={timeline} />);
    const btn = screen.getByRole("button", { name: /2x/i });
    expect(btn.className).toContain("Scrubber-speed--active");
  });

  it("renders the time label", () => {
    const timeline = mkTimeline({
      playhead: 3000,
      playbackTotalDuration: 8000,
    });
    render(<Scrubber timeline={timeline} />);
    expect(screen.getByText(/0:03 \/ 0:08/)).toBeInTheDocument();
  });

  it("track is a slider with the playhead's aria value", () => {
    const timeline = mkTimeline({
      playhead: 500,
      playbackTotalDuration: 1000,
    });
    render(<Scrubber timeline={timeline} />);
    const slider = screen.getByRole("slider", { name: /replay playhead/i });
    expect(slider).toHaveAttribute("aria-valuenow", "500");
    expect(slider).toHaveAttribute("aria-valuemax", "1000");
  });

  // Track mousedown → seek-to test. JSDOM doesn't actually
  // populate getBoundingClientRect with width > 0 by default,
  // so the seek won't dispatch unless we mock it. This guard
  // verifies the mousedown handler at minimum doesn't crash and
  // (when rect.width is mocked) does seek.
  it("track mousedown seeks via setPlayhead when track has nonzero width", () => {
    const timeline = mkTimeline({
      playhead: 0,
      playbackTotalDuration: 1000,
    });
    render(<Scrubber timeline={timeline} />);
    const slider = screen.getByRole("slider", { name: /replay playhead/i });
    // Mock the bounding rect so the ratio calculation produces
    // something useful. Without this, JSDOM returns all zeros and
    // setPlayhead isn't called.
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 8,
      width: 200,
      height: 8,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(slider, { clientX: 100 });
    // 100 / 200 = 0.5 → 500 ms.
    expect(timeline.setPlayhead).toHaveBeenCalled();
    const arg = (timeline.setPlayhead as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg).toBeCloseTo(500, 5);
  });
});
