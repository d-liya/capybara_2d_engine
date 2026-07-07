export type TooltipContent =
  | string
  | {
      title?: string;
      body?: string;
    };

export interface HoverBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type HoverSource =
  | "entity"
  | "map-object"
  | "map-effect"
  | "map-overlay"
  | "placement";

export interface HoverTarget {
  id: string;
  source: HoverSource;
  label: string;
  tooltip?: TooltipContent;
  type?: string;
  bounds: HoverBounds;
  renderY: number;
  x: number;
  y: number;
  clientX?: number;
  clientY?: number;
}

export interface MapPlacementTarget {
  id: string;
  elementName: string;
  placementType?: string;
  contents?: string;
  reasoning?: string;
  gridDimensions?: number[];
  box_2d: number[];
  bounds: HoverBounds;
  renderY: number;
}

export interface MapOverlayTarget {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  currentState: string;
  states: string[];
  box_2d: number[];
  bounds: HoverBounds;
  renderY: number;
  blocksMovement: boolean;
  renderLayer: "background" | "ground" | "occluder" | "prop";
}

export type PropPlacementInput =
  | number[]
  | { box_2d: number[] }
  | { x: number; y: number; width?: number; height?: number }
  | { centerX: number; centerY: number; width?: number; height?: number };

export interface EntityAnimationOptions {
  transitionMs?: number;
}

export interface EntitySpriteTransitionOptions extends EntityAnimationOptions {
  activeAnimation?: string;
}
