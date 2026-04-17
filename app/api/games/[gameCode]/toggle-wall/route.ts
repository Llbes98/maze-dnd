import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cellKey, normalizeWalls } from "@/lib/maze-visibility";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const x = Number(body.x);
    const y = Number(body.y);

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, width, height, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.width || y >= game.height) {
      return NextResponse.json({ error: "Wall position is out of bounds." }, { status: 400 });
    }

    const { data: occupied } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("x", x)
      .eq("y", y)
      .maybeSingle();

    if (occupied) {
      return NextResponse.json({ error: "Cannot place a wall on an occupied square." }, { status: 400 });
    }

    const walls = normalizeWalls(game.map_data?.walls);
    const targetKey = cellKey(x, y);
    const exists = walls.some((wall) => cellKey(wall.x, wall.y) === targetKey);

    const nextWalls = exists
      ? walls.filter((wall) => cellKey(wall.x, wall.y) !== targetKey)
      : [...walls, { x, y }];

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