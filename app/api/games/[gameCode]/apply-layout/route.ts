import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  cellKey,
  normalizeCells,
  normalizeWalls,
  wallKey,
  type Cell,
  type Wall,
} from "@/lib/maze-visibility";

type ImportedTrap = {
  x: number;
  y: number;
  label: string;
  visibility_mode: "hidden" | "public";
};

function uniqueCells(cells: Cell[]) {
  const unique = new Map<string, Cell>();

  for (const cell of cells) {
    unique.set(cellKey(cell.x, cell.y), cell);
  }

  return Array.from(unique.values());
}

function uniqueWalls(walls: Wall[]) {
  const unique = new Map<string, Wall>();

  for (const wall of walls) {
    unique.set(wallKey(wall), wall);
  }

  return Array.from(unique.values());
}

function isCellInBounds(cell: Cell, width: number, height: number) {
  return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;
}

function isWallInBounds(wall: Wall, width: number, height: number) {
  if (wall.direction === "right") {
    return wall.x >= 0 && wall.y >= 0 && wall.x < width - 1 && wall.y < height;
  }

  return wall.x >= 0 && wall.y >= 0 && wall.x < width && wall.y < height - 1;
}

function normalizeImportedTraps(input: unknown, width: number, height: number) {
  if (!Array.isArray(input)) return [];

  const traps: ImportedTrap[] = [];
  const usedCells = new Set<string>();

  for (const trap of input) {
    if (
      typeof trap !== "object" ||
      trap === null ||
      !("x" in trap) ||
      !("y" in trap) ||
      !Number.isInteger((trap as { x: unknown }).x) ||
      !Number.isInteger((trap as { y: unknown }).y)
    ) {
      throw new Error("Trap data is invalid.");
    }

    const x = Number((trap as { x: number }).x);
    const y = Number((trap as { y: number }).y);

    if (x < 0 || y < 0 || x >= width || y >= height) {
      throw new Error("Trap position is out of bounds.");
    }

    const key = cellKey(x, y);
    if (usedCells.has(key)) continue;
    usedCells.add(key);

    const label = String((trap as { label?: unknown }).label ?? "Trap").trim() || "Trap";
    const visibilityMode =
      (trap as { visibilityMode?: unknown }).visibilityMode === "public" ||
      (trap as { visibility_mode?: unknown }).visibility_mode === "public"
        ? "public"
        : "hidden";

    traps.push({
      x,
      y,
      label,
      visibility_mode: visibilityMode,
    });
  }

  return traps;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const layout = typeof body.layout === "object" && body.layout !== null ? body.layout : body;
    const width = Number((layout as { width?: unknown }).width);
    const height = Number((layout as { height?: unknown }).height);

    if (!Number.isInteger(width) || width < 10 || width > 100) {
      return NextResponse.json({ error: "Layout width must be between 10 and 100." }, { status: 400 });
    }

    if (!Number.isInteger(height) || height < 10 || height > 100) {
      return NextResponse.json({ error: "Layout height must be between 10 and 100." }, { status: 400 });
    }

    const walls = uniqueWalls(normalizeWalls((layout as { walls?: unknown }).walls));
    const goals = uniqueCells(normalizeCells((layout as { goals?: unknown }).goals));
    const traps = normalizeImportedTraps((layout as { traps?: unknown }).traps, width, height);

    if (walls.some((wall) => !isWallInBounds(wall, width, height))) {
      return NextResponse.json({ error: "Layout contains an out-of-bounds wall." }, { status: 400 });
    }

    if (goals.some((goal) => !isCellInBounds(goal, width, height))) {
      return NextResponse.json({ error: "Layout contains an out-of-bounds goal." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: positionedParticipants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .not("x", "is", null)
      .not("y", "is", null)
      .or(`x.lt.0,x.gte.${width},y.lt.0,y.gte.${height}`);

    if (participantsError) {
      return NextResponse.json({ error: participantsError.message }, { status: 500 });
    }

    if ((positionedParticipants ?? []).length > 0) {
      return NextResponse.json(
        { error: "A positioned participant would be outside this layout. Clear or move them first." },
        { status: 400 }
      );
    }

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        width,
        height,
        map_data: {
          ...(game.map_data ?? {}),
          walls,
          goals,
        },
      })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("traps")
      .delete()
      .eq("game_id", game.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (traps.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("traps").insert(
        traps.map((trap) => ({
          game_id: game.id,
          x: trap.x,
          y: trap.y,
          label: trap.label,
          visibility_mode: trap.visibility_mode,
          visible_to_participant_ids: [],
          is_triggered: false,
        }))
      );

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bad layout." },
      { status: 400 }
    );
  }
}
