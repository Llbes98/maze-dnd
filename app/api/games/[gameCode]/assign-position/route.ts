import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const participantId = String(body.participantId ?? "");
    const x = Number(body.x);
    const y = Number(body.y);

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, width, height")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.width || y >= game.height) {
      return NextResponse.json({ error: "Position is out of bounds." }, { status: 400 });
    }

    const { data: occupied } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("x", x)
      .eq("y", y)
      .maybeSingle();

    if (occupied && occupied.id !== participantId) {
      return NextResponse.json({ error: "That square is already occupied." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("participants")
      .update({ x, y })
      .eq("id", participantId)
      .eq("game_id", game.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}