import PF from "pathfinding";
import type GameMap from "./GameMap";
import type { Rect } from "../utils/common";
import type {
  FindPathOptions,
  FindPathResult,
  PathPoint,
} from "../types/Navigation";

const DEFAULT_CELL_SIZE = 25;
const DEFAULT_COLLISION_WIDTH = 28;
const DEFAULT_COLLISION_HEIGHT = 10;
const DEFAULT_SNAP_RADIUS_CELLS = 8;

interface GridCell {
  x: number;
  y: number;
}

interface ResolvedPathOptions {
  cellSize: number;
  allowDiagonal: boolean;
  stopDistance: number;
  collisionWidth: number;
  collisionHeight: number;
  snapToNearestWalkable: boolean;
  snapRadiusCells: number;
}

export default class PathfindingGrid {
  private readonly map: GameMap;
  private readonly options: ResolvedPathOptions;
  private readonly cols: number;
  private readonly rows: number;
  private readonly baseGrid: PF.Grid;

  constructor(map: GameMap, options: FindPathOptions = {}) {
    this.map = map;
    this.options = this.resolveOptions(options);
    this.cols = Math.max(
      1,
      Math.ceil(map.worldNormWidth / this.options.cellSize),
    );
    this.rows = Math.max(
      1,
      Math.ceil(map.worldNormHeight / this.options.cellSize),
    );
    this.baseGrid = this.buildGrid();
  }

  findPath(from: PathPoint, to: PathPoint): FindPathResult {
    const startCell = this.resolveEndpoint(this.worldToCell(from));
    const endCell = this.resolveEndpoint(this.worldToCell(to));

    if (!startCell || !endCell) {
      return { status: "blocked", points: [] };
    }

    const finder = new PF.AStarFinder({
      allowDiagonal: this.options.allowDiagonal,
      dontCrossCorners: true,
    });
    const rawPath = finder.findPath(
      startCell.x,
      startCell.y,
      endCell.x,
      endCell.y,
      this.baseGrid.clone(),
    );

    if (rawPath.length === 0) {
      return { status: "unreachable", points: [] };
    }

    const compressed = PF.Util.compressPath(rawPath);
    const points = compressed.map(([x, y]) => this.cellToWorld({ x, y }));
    if (points.length > 0) {
      points[0] = { ...from };
      points[points.length - 1] = this.cellToWorld(endCell);
    }

    const trimmed = this.trimStopDistance(points, this.options.stopDistance);
    return { status: "found", points: trimmed };
  }

  private resolveOptions(options: FindPathOptions): ResolvedPathOptions {
    const cellSize = Number(options.cellSize);
    const stopDistance = Number(options.stopDistance);
    const collisionWidth = Number(options.collisionWidth);
    const collisionHeight = Number(options.collisionHeight);

    return {
      cellSize:
        Number.isFinite(cellSize) && cellSize > 4
          ? cellSize
          : DEFAULT_CELL_SIZE,
      allowDiagonal: options.allowDiagonal ?? true,
      stopDistance:
        Number.isFinite(stopDistance) && stopDistance > 0 ? stopDistance : 0,
      collisionWidth:
        Number.isFinite(collisionWidth) && collisionWidth > 0
          ? collisionWidth
          : DEFAULT_COLLISION_WIDTH,
      collisionHeight:
        Number.isFinite(collisionHeight) && collisionHeight > 0
          ? collisionHeight
          : DEFAULT_COLLISION_HEIGHT,
      snapToNearestWalkable: options.snapToNearestWalkable ?? true,
      snapRadiusCells:
        Number.isFinite(Number(options.snapRadiusCells)) &&
        Number(options.snapRadiusCells) > 0
          ? Math.floor(Number(options.snapRadiusCells))
          : DEFAULT_SNAP_RADIUS_CELLS,
    };
  }

  isPointWalkable(point: PathPoint): boolean {
    return this.isCellWalkable(this.worldToCell(point));
  }

  findNearestWalkablePoint(point: PathPoint): PathPoint | null {
    const cell = this.resolveEndpoint(this.worldToCell(point));
    return cell ? this.cellToWorld(cell) : null;
  }

  private buildGrid(): PF.Grid {
    const matrix: number[][] = [];
    for (let y = 0; y < this.rows; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < this.cols; x += 1) {
        row.push(this.isCellWalkable({ x, y }) ? 0 : 1);
      }
      matrix.push(row);
    }
    return new PF.Grid(matrix);
  }

  private worldToCell(point: PathPoint): GridCell {
    return {
      x: Math.max(
        0,
        Math.min(this.cols - 1, Math.floor(point.x / this.options.cellSize)),
      ),
      y: Math.max(
        0,
        Math.min(this.rows - 1, Math.floor(point.y / this.options.cellSize)),
      ),
    };
  }

  private cellToWorld(cell: GridCell): PathPoint {
    return {
      x: Math.min(
        this.map.worldNormWidth,
        (cell.x + 0.5) * this.options.cellSize,
      ),
      y: Math.min(
        this.map.worldNormHeight,
        (cell.y + 0.5) * this.options.cellSize,
      ),
    };
  }

  private resolveEndpoint(cell: GridCell): GridCell | null {
    if (this.baseGrid.isWalkableAt(cell.x, cell.y)) {
      return cell;
    }
    if (!this.options.snapToNearestWalkable) {
      return null;
    }

    let best: GridCell | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= this.options.snapRadiusCells; radius += 1) {
      for (let y = cell.y - radius; y <= cell.y + radius; y += 1) {
        for (let x = cell.x - radius; x <= cell.x + radius; x += 1) {
          if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
          if (
            Math.abs(x - cell.x) !== radius &&
            Math.abs(y - cell.y) !== radius
          )
            continue;
          if (!this.baseGrid.isWalkableAt(x, y)) continue;
          const dx = x - cell.x;
          const dy = y - cell.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < bestDistanceSq) {
            best = { x, y };
            bestDistanceSq = distanceSq;
          }
        }
      }
      if (best) return best;
    }

    return null;
  }

  private isCellWalkable(cell: GridCell): boolean {
    const point = this.cellToWorld(cell);
    const rect = this.footRectAt(point.x, point.y);
    return !this.map.checkCollision(rect);
  }

  private footRectAt(feetX: number, feetY: number): Rect {
    const width = this.options.collisionWidth;
    const height = this.options.collisionHeight;
    return {
      x1: feetX - width * 0.5,
      y1: feetY - height,
      x2: feetX + width * 0.5,
      y2: feetY,
    };
  }

  private trimStopDistance(
    points: PathPoint[],
    stopDistance: number,
  ): PathPoint[] {
    if (points.length <= 1 || stopDistance <= 0) return points;
    const result = [...points];
    const destination = result[result.length - 1];

    while (result.length > 1) {
      const prev = result[result.length - 2];
      const distance = Math.hypot(
        destination.x - prev.x,
        destination.y - prev.y,
      );
      if (distance > stopDistance) break;
      result.pop();
    }

    return result;
  }
}
