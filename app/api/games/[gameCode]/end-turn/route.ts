import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeStringList } from "@/lib/turn-state";

type Player = {
  id: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const participantId = String(body.participantId ?? "");

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, status, is_npc_turn, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (game.status !== "active") {
      return NextResponse.json({ error: "Game is not active." }, { status: 400 });
    }

    if (game.is_npc_turn) {
      return NextResponse.json({ error: "It is the NPC turn." }, { status: 400 });
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

    const { data: players, error: playersError } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("kind", "player");

    if (playersError || !players || players.length === 0) {
      return NextResponse.json({ error: "Could not load players." }, { status: 500 });
    }

    const endedParticipantIds = normalizeStringList(game.map_data?.endedParticipantIds);
    const nextEndedParticipantIds = Array.from(new Set([...endedParticipantIds, participantId]));
    const allPlayersEnded = (players as Player[]).every((player) =>
      nextEndedParticipantIds.includes(player.id)
    );

    const { error: zeroOutError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: 0 })
      .eq("id", participantId);

    if (zeroOutError) {
      return NextResponse.json({ error: zeroOutError.message }, { status: 500 });
    }

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({
        is_npc_turn: allPlayersEnded,
        map_data: {
          ...(game.map_data ?? {}),
          endedParticipantIds: nextEndedParticipantIds,
        },
      })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, npcTurn: allPlayersEnded });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
