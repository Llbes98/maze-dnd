import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeMovePointMap, normalizeStringList } from "@/lib/turn-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const participantId = String(body.participantId ?? "");
    const moves = Number(body.moves);

    if (!participantId || !Number.isInteger(moves) || moves < 0 || moves > 100) {
      return NextResponse.json({ error: "Moves must be a whole number from 0 to 100." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, is_npc_turn, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("participants")
      .select("id, kind")
      .eq("id", participantId)
      .eq("game_id", game.id)
      .eq("kind", "player")
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ error: "Player not found." }, { status: 404 });
    }

    const participantMovePoints = normalizeMovePointMap(game.map_data?.participantMovePoints);
    const nextMovePoints = {
      ...participantMovePoints,
      [participantId]: moves,
    };

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        map_data: {
          ...(game.map_data ?? {}),
          participantMovePoints: nextMovePoints,
        },
      })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    const endedParticipantIds = normalizeStringList(game.map_data?.endedParticipantIds);

    if (!game.is_npc_turn && !endedParticipantIds.includes(participantId)) {
      const { error: movesError } = await supabaseAdmin
        .from("participants")
        .update({ remaining_moves: moves })
        .eq("id", participantId);

      if (movesError) {
        return NextResponse.json({ error: movesError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
