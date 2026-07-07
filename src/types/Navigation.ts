import type { EntityId } from "../Game";

export interface PathPoint {
  /** Feet/ground world X in normalized map space. */
  x: number;
  /** Feet/ground world Y in normalized map space. */
  y: number;
}

export type FindPathStatus = "found" | "blocked" | "unreachable";

export interface FindPathOptions {
  /** Entity used to infer foot-collider dimensions. */
  entityId?: EntityId;
  /** Grid size in normalized units. Smaller is more accurate but slower. */
  cellSize?: number;
  /** Allow diagonal A* steps. Defaults to true. */
  allowDiagonal?: boolean;
  /** Remove target points within this distance of the destination. */
  stopDistance?: number;
  /** Foot-collider width used when testing walkability. */
  collisionWidth?: number;
  /** Foot-collider height used when testing walkability. */
  collisionHeight?: number;
  /** If start/end are blocked, search nearby cells for a walkable alternative. */
  snapToNearestWalkable?: boolean;
  /** Max grid radius when snapping blocked feet positions. Defaults to 8 cells. */
  snapRadiusCells?: number;
}

export interface FindPathResult {
  status: FindPathStatus;
  points: PathPoint[];
}

export interface EntityDestinationOptions extends FindPathOptions {
  /** Movement speed in normalized units per second. Defaults to entity.speed or 90. */
  speed?: number;
  /** Recalculate the path this often while moving. Omit/0 to only path once. */
  repathIntervalMs?: number;
}

export type NavigationStatus = "idle" | "moving" | "arrived" | "blocked" | "unreachable";

export interface EntityNavigationState {
  destination: PathPoint;
  path: PathPoint[];
  waypointIndex: number;
  speed: number;
  stopDistance: number;
  status: NavigationStatus;
  lastPathAtMs: number;
  repathIntervalMs?: number;
  options: FindPathOptions;
}

export interface NavigationEventPayload {
  entityId: EntityId;
  destination?: PathPoint;
  status?: NavigationStatus;
}
