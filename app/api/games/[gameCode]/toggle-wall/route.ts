import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeWalls, type WallDirection, wallKey } from "@/lib/maze-visibility";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const x = Number(body.x);
    const y = Number(body.y);
    const direction = body.direction as WallDirection;

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, width, height, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const validDirection = direction === "right" || direction === "down";
    const inBounds =
      validDirection &&
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      ((direction === "right" && x < game.width - 1 && y < game.height) ||
        (direction === "down" && x < game.width && y < game.height - 1));

    if (!inBounds) {
      return NextResponse.json({ error: "Wall position is out of bounds." }, { status: 400 });
    }

    const walls = normalizeWalls(game.map_data?.walls);
    const targetWall = { x, y, direction };
    const targetKey = wallKey(targetWall);
    const exists = walls.some((wall) => wallKey(wall) === targetKey);

    const nextWalls = exists
      ? walls.filter((wall) => wallKey(wall) !== targetKey)
      : [...walls, targetWall];

    const { error } = await supabaseAdmin
      .from("games")
      .update({
        map_data: {
          ...(game.map_data ?? {}),
          walls: nextWalls,
        },
      })
      .eq("id", game.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, walls: nextWalls });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
