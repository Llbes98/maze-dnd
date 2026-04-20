import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, move_points_per_turn")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id, turn_order")
      .eq("game_id", game.id)
      .eq("kind", "player")
      .order("turn_order", { ascending: true });

    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Set a turn order first." }, { status: 400 });
    }

    const activeParticipant = participants[0];

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        status: "active",
        current_turn_index: 0,
        is_npc_turn: false,
      })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    const { error: resetMovesError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: 0 })
      .eq("game_id", game.id);

    if (resetMovesError) {
      return NextResponse.json({ error: resetMovesError.message }, { status: 500 });
    }

    const { error: setFirstError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: game.move_points_per_turn })
      .eq("id", activeParticipant.id);

    if (setFirstError) {
      return NextResponse.json({ error: setFirstError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}