export type Cell = { x: number; y: number };
export type WallDirection = "right" | "down";
export type Wall = Cell & { direction: WallDirection };

export function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function normalizeCells(input: unknown): Cell[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((cell) => {
      if (
        typeof cell === "object" &&
        cell !== null &&
        "x" in cell &&
        "y" in cell &&
        Number.isInteger((cell as { x: unknown }).x) &&
        Number.isInteger((cell as { y: unknown }).y)
      ) {
        return {
          x: Number((cell as { x: number }).x),
          y: Number((cell as { y: number }).y),
        };
      }

      return null;
    })
    .filter((cell): cell is Cell => cell !== null);
}

export function wallKey(wall: Wall) {
  return `${wall.x},${wall.y},${wall.direction}`;
}

function isWallDirection(input: unknown): input is WallDirection {
  return input === "right" || input === "down";
}

function legacyCellToEdges(cell: Cell): Wall[] {
  const walls: Wall[] = [
    { x: cell.x, y: cell.y, direction: "right" },
    { x: cell.x, y: cell.y, direction: "down" },
  ];

  if (cell.x > 0) {
    walls.push({ x: cell.x - 1, y: cell.y, direction: "right" });
  }

  if (cell.y > 0) {
    walls.push({ x: cell.x, y: cell.y - 1, direction: "down" });
  }

  return walls;
}

export function normalizeWalls(input: unknown): Wall[] {
  if (!Array.isArray(input)) return [];

  const walls = input.flatMap((cell) => {
    if (
      typeof cell === "object" &&
      cell !== null &&
      "x" in cell &&
      "y" in cell &&
      Number.isInteger((cell as { x: unknown }).x) &&
      Number.isInteger((cell as { y: unknown }).y)
    ) {
      const baseCell = {
        x: Number((cell as { x: number }).x),
        y: Number((cell as { y: number }).y),
      };

      if (
        "direction" in cell &&
        isWallDirection((cell as { direction: unknown }).direction)
      ) {
        return [{ ...baseCell, direction: (cell as { direction: WallDirection }).direction }];
      }

      return legacyCellToEdges(baseCell);
    }

    return [];
  });

  const uniqueWalls = new Map<string, Wall>();
  for (const wall of walls) {
    uniqueWalls.set(wallKey(wall), wall);
  }

  return Array.from(uniqueWalls.values());
}

export function getWallBetween(fromX: number, fromY: number, toX: number, toY: number): Wall | null {
  const dx = toX - fromX;
  const dy = toY - fromY;

  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return null;
  }

  if (dx === 1) return { x: fromX, y: fromY, direction: "right" };
  if (dx === -1) return { x: toX, y: toY, direction: "right" };
  if (dy === 1) return { x: fromX, y: fromY, direction: "down" };
  return { x: toX, y: toY, direction: "down" };
}

export function isWallBetween(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walls: Wall[]
) {
  const wall = getWallBetween(fromX, fromY, toX, toY);
  return wall ? walls.some((item) => wallKey(item) === wallKey(wall)) : false;
}

function hasWallSegment(x: number, y: number, direction: WallDirection, walls: Wall[]) {
  return walls.some((wall) => wallKey(wall) === wallKey({ x, y, direction }));
}

export function hasBlockingWallCorner(cornerX: number, cornerY: number, walls: Wall[]) {
  const verticalWall =
    hasWallSegment(cornerX, cornerY, "right", walls) ||
    hasWallSegment(cornerX, cornerY + 1, "right", walls);
  const horizontalWall =
    hasWallSegment(cornerX, cornerY, "down", walls) ||
    hasWallSegment(cornerX + 1, cornerY, "down", walls);

  return verticalWall && horizontalWall;
}

export function isWall(x: number, y: number, walls: Wall[]) {
  return walls.some(
    (wall) =>
      (wall.direction === "right" &&
        ((wall.x === x && wall.y === y) || (wall.x + 1 === x && wall.y === y))) ||
      (wall.direction === "down" &&
        ((wall.x === x && wall.y === y) || (wall.x === x && wall.y + 1 === y)))
  );
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number) {
  const points: Cell[] = [];
  let cx = x0;
  let cy = y0;

  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;

    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }

  return points;
}

export function hasLineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walls: Wall[]
) {
  const line = bresenhamLine(fromX, fromY, toX, toY);

  for (let i = 1; i < line.length; i += 1) {
    const previous = line[i - 1];
    const point = line[i];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;

    if (dx !== 0 && isWallBetween(previous.x, previous.y, point.x, previous.y, walls)) {
      return false;
    }

    if (dy !== 0 && isWallBetween(previous.x, previous.y, previous.x, point.y, walls)) {
      return false;
    }

    if (
      dx !== 0 &&
      dy !== 0 &&
      hasBlockingWallCorner(Math.min(previous.x, point.x), Math.min(previous.y, point.y), walls)
    ) {
      return false;
    }
  }

  return true;
}

export function getVisibleCellKeys(
  fromX: number,
  fromY: number,
  width: number,
  height: number,
  walls: Wall[]
) {
  const visible = new Set<string>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (hasLineOfSight(fromX, fromY, x, y, walls)) {
        visible.add(cellKey(x, y));
      }
    }
  }

  return visible;
}
