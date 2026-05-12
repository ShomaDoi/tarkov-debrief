export enum ToolType {
  select = "select",
  pencil = "pencil",
  eraser = "eraser",
  marker = "marker",
  pan = "pan",
  // P1 additions (claudedocs/design_p1_slice.md §3.3).
  // Wired progressively across phases; the enum lands in Phase 1 so
  // downstream modules can reference these without forward-decl gymnastics.
  arrow = "arrow",
  sightline = "sightline",
  cone = "cone",
  engagementX = "engagementX",
  soundPing = "soundPing",
  positionDot = "positionDot",
  text = "text",
}

export type Tool = {
  active: boolean;
  type: ToolType;
  cursor: null | string;
};

export type SetToolFn = (tool: Tool) => void;
