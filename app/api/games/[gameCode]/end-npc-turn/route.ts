import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Player = {
  id: string;
  turn_order: number | null;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, move_points_per_turn, is_npc_turn")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (!game.is_npc_turn) {
      return NextResponse.json({ error: "It is not the NPC turn." }, { status: 400 });
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from("participants")
      .select("id, turn_order")
      .eq("game_id", game.id)
      .eq("kind", "player")
      .order("turn_order", { ascending: true });

    if (playersError || !players || players.length === 0) {
      return NextResponse.json({ error: "No players in turn order." }, { status: 400 });
    }

    const firstPlayer = (players as Player[]).filter((p) => p.turn_order !== null)[0];

    if (!firstPlayer) {
      return NextResponse.json({ error: "No valid player turn order." }, { status: 400 });
    }

    const { error: zeroOutError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: 0 })
      .eq("game_id", game.id);

    if (zeroOutError) {
      return NextResponse.json({ error: zeroOutError.message }, { status: 500 });
    }

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        current_turn_index: 0,
        is_npc_turn: false,
      })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    const { error: nextMovesError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: game.move_points_per_turn })
      .eq("id", firstPlayer.id);

    if (nextMovesError) {
      return NextResponse.json({ error: nextMovesError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}