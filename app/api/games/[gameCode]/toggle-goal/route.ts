import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cellKey, normalizeCells } from "@/lib/maze-visibility";

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
      return NextResponse.json({ error: "Goal position is out of bounds." }, { status: 400 });
    }

    const goals = normalizeCells(game.map_data?.goals);
    const targetKey = cellKey(x, y);
    const exists = goals.some((goal) => cellKey(goal.x, goal.y) === targetKey);

    const nextGoals = exists
      ? goals.filter((goal) => cellKey(goal.x, goal.y) !== targetKey)
      : [...goals, { x, y }];

    const { error } = await supabaseAdmin
      .from("games")
      .update({
        map_data: {
          ...(game.map_data ?? {}),
          goals: nextGoals,
        },
      })
      .eq("id", game.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, goals: nextGoals });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
