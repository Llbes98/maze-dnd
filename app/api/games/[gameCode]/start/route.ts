import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getParticipantMovePoints, normalizeMovePointMap } from "@/lib/turn-state";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, move_points_per_turn, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("kind", "player")
      .order("created_at", { ascending: true });

    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Add at least one player first." }, { status: 400 });
    }

    const participantMovePoints = normalizeMovePointMap(game.map_data?.participantMovePoints);

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        status: "active",
        current_turn_index: 0,
        is_npc_turn: false,
        map_data: {
          ...(game.map_data ?? {}),
          endedParticipantIds: [],
        },
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

    for (const participant of participants) {
      const { error: setMovesError } = await supabaseAdmin
        .from("participants")
        .update({
          remaining_moves: getParticipantMovePoints(
            participant.id,
            game.move_points_per_turn,
            participantMovePoints
          ),
        })
        .eq("id", participant.id);

      if (setMovesError) {
        return NextResponse.json({ error: setMovesError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
