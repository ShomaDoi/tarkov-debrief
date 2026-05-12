import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolType } from "@/tools/tool";
import {
  loadTool,
  saveTool,
  isTransientTool,
  DEFAULT_TOOL,
} from "./tool";

const STORAGE_KEY = "tarkov-debrief:tool:v1";

// jsdom provides a real localStorage, but its state leaks across
// tests. Reset before each.
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("state/tool", () => {
  describe("loadTool", () => {
    it("returns DEFAULT_TOOL (pencil) when storage is empty", () => {
      expect(loadTool()).toBe(DEFAULT_TOOL);
      expect(DEFAULT_TOOL).toBe(ToolType.pencil);
    });

    it("returns DEFAULT_TOOL when storage contains garbage", () => {
      localStorage.setItem(STORAGE_KEY, "not-a-real-tool");
      expect(loadTool()).toBe(DEFAULT_TOOL);
    });

    it("returns the persisted value for sticky tools", () => {
      saveTool(ToolType.eraser);
      expect(loadTool()).toBe(ToolType.eraser);
    });

    it("returns DEFAULT_TOOL when a transient tool was persisted", () => {
      // The motivation: a user reloading mid-sightline shouldn't
      // come back in sightline mode with no arrow tip to anchor to.
      saveTool(ToolType.sightline);
      expect(loadTool()).toBe(DEFAULT_TOOL);

      saveTool(ToolType.cone);
      expect(loadTool()).toBe(DEFAULT_TOOL);

      saveTool(ToolType.text);
      expect(loadTool()).toBe(DEFAULT_TOOL);
    });

    it("honors persisted sticky P1 tools (arrow, point marks)", () => {
      saveTool(ToolType.arrow);
      expect(loadTool()).toBe(ToolType.arrow);

      saveTool(ToolType.engagementX);
      expect(loadTool()).toBe(ToolType.engagementX);

      saveTool(ToolType.positionDot);
      expect(loadTool()).toBe(ToolType.positionDot);

      saveTool(ToolType.soundPing);
      expect(loadTool()).toBe(ToolType.soundPing);
    });
  });

  describe("saveTool", () => {
    it("round-trips through localStorage", () => {
      saveTool(ToolType.select);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("select");
      expect(loadTool()).toBe(ToolType.select);
    });

    it("overwrites prior persisted value", () => {
      saveTool(ToolType.pencil);
      saveTool(ToolType.eraser);
      expect(loadTool()).toBe(ToolType.eraser);
    });
  });

  describe("isTransientTool", () => {
    it("returns true for one-shot tools", () => {
      expect(isTransientTool(ToolType.sightline)).toBe(true);
      expect(isTransientTool(ToolType.cone)).toBe(true);
      expect(isTransientTool(ToolType.text)).toBe(true);
    });

    it("returns false for sticky tools", () => {
      expect(isTransientTool(ToolType.pencil)).toBe(false);
      expect(isTransientTool(ToolType.arrow)).toBe(false);
      expect(isTransientTool(ToolType.eraser)).toBe(false);
      expect(isTransientTool(ToolType.engagementX)).toBe(false);
      expect(isTransientTool(ToolType.soundPing)).toBe(false);
      expect(isTransientTool(ToolType.positionDot)).toBe(false);
    });

    it("returns false for non-mark sticky tools", () => {
      expect(isTransientTool(ToolType.select)).toBe(false);
      expect(isTransientTool(ToolType.marker)).toBe(false);
      expect(isTransientTool(ToolType.pan)).toBe(false);
    });
  });
});
