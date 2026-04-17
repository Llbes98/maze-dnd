export type Cell = { x: number; y: number };

export function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function normalizeWalls(input: unknown): Cell[] {
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

export function isWall(x: number, y: number, walls: Cell[]) {
  return walls.some((wall) => wall.x === x && wall.y === y);
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
  walls: Cell[]
) {
  const line = bresenhamLine(fromX, fromY, toX, toY);

  for (let i = 1; i < line.length; i += 1) {
    const point = line[i];
    const target = i === line.length - 1;

    if (isWall(point.x, point.y, walls)) {
      return target;
    }
  }

  return true;
}

export function getVisibleCellKeys(
  fromX: number,
  fromY: number,
  width: number,
  height: number,
  walls: Cell[]
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