// Replay scrubber UI.
//
// A horizontal bar overlaid at the bottom of the canvas viewport.
// Hidden when the timeline is empty (no marks yet); appears on
// the first mark add and stays until the canvas is cleared.
//
// All state and behavior lives in the timeline prop
// (UseTimelineReturn from src/state/timeline.ts). This component
// is purely presentational — it reads timeline values and calls
// timeline mutators in response to user input. The RAF advance
// loop, the slot subscriber, the speed-multiplier handling, and
// the play/pause state machine all live inside useTimeline.
//
// Interaction:
//   - Click on track or drag the playhead: seek to position.
//   - Play/pause button: toggle isPlaying.
//   - "Live" button: jump to the rightmost position.
//   - Speed buttons (0.5×, 1×, 2×): set playback speed.
//
// Design references:
//   - claudedocs/design_p2_slice.md §8 (Scrubber UI)
//   - claudedocs/design_p2_slice.md §0 R-E (discrete speed buttons)
//   - claudedocs/design_p2_slice.md §0 R-F (play-from-live behavior;
//     handled inside useTimeline.play, not here)

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpeedMultiplier,
  UseTimelineReturn,
} from "@/state/timeline";
import "./Scrubber.css";

export interface ScrubberProps {
  timeline: UseTimelineReturn;
}

const SPEEDS: SpeedMultiplier[] = [0.5, 1, 2];

/**
 * Format a playback-time millisecond count as M:SS (e.g. 73000 → "1:13").
 * Floor on seconds matches video-player convention — the user
 * sees the elapsed second tick over rather than jitter half a
 * second early.
 */
export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Scrubber({ timeline }: ScrubberProps) {
  // All hooks declared unconditionally before any early return
  // (React rules of hooks). The empty-timeline early return is
  // below.
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const seekToClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      timeline.setPlayhead(ratio * timeline.playbackTotalDuration);
    },
    [timeline],
  );

  const onTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Capture and seek immediately; the window-level mousemove
    // listener takes over from here. Prevents the canvas's
    // mouse:down from firing (the scrubber is not a child of the
    // canvas, but the user might rapid-click between them).
    e.preventDefault();
    e.stopPropagation();
    seekToClientX(e.clientX);
    setDragging(true);
  };

  // Drag tracking lives on the window so the user can drag outside
  // the scrubber's bounds without losing capture. Standard pattern
  // for slider components.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => seekToClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, seekToClientX]);

  const onPlayPauseClick = () => {
    if (timeline.isPlaying) timeline.pause();
    else timeline.play();
  };

  const onLiveClick = () => {
    timeline.setPlayhead(timeline.playbackTotalDuration);
  };

  // Empty timeline → no scrubber. Avoids visual chrome on first
  // app load before any annotation has happened.
  if (timeline.slots.length === 0) return null;

  // Playhead position as a fraction of playback total. Edge case:
  // if playbackTotalDuration === 0 (single instant-appear mark
  // with no gap behind it), playhead stays at 0 and ratio is 0.
  const playheadRatio =
    timeline.playbackTotalDuration > 0
      ? timeline.playhead / timeline.playbackTotalDuration
      : 0;

  return (
    <div className="Scrubber" role="region" aria-label="Replay scrubber">
      <button
        className="Scrubber-playPause"
        type="button"
        aria-label={timeline.isPlaying ? "Pause" : "Play"}
        onClick={onPlayPauseClick}
      >
        {/* Two visual states. Using text instead of icons to avoid
            another SVG asset for P2; the icons can drop in later
            without restructuring. */}
        {timeline.isPlaying ? "▐▐" : "▶"}
      </button>
      <div
        ref={trackRef}
        className="Scrubber-track"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(timeline.playbackTotalDuration)}
        aria-valuenow={Math.round(timeline.playhead)}
        aria-label="Replay playhead"
        tabIndex={0}
        onMouseDown={onTrackMouseDown}
      >
        <div
          className="Scrubber-track-fill"
          style={{ width: `${playheadRatio * 100}%` }}
        />
        <div
          className="Scrubber-playhead"
          style={{ left: `${playheadRatio * 100}%` }}
        />
      </div>
      <span className="Scrubber-time" aria-live="off">
        {formatTime(timeline.playhead)} /{" "}
        {formatTime(timeline.playbackTotalDuration)}
      </span>
      <button
        className={
          timeline.isLive
            ? "Scrubber-live Scrubber-live--active"
            : "Scrubber-live"
        }
        type="button"
        aria-label="Jump to live"
        aria-pressed={timeline.isLive}
        onClick={onLiveClick}
      >
        Live
      </button>
      <div
        className="Scrubber-speeds"
        role="group"
        aria-label="Replay speed"
      >
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={
              timeline.speed === s
                ? "Scrubber-speed Scrubber-speed--active"
                : "Scrubber-speed"
            }
            type="button"
            aria-label={`Playback speed ${s}x`}
            aria-pressed={timeline.speed === s}
            onClick={() => timeline.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
