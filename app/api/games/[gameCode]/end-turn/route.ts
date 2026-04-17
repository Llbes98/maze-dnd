import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Participant = {
  id: string;
  turn_order: number | null;
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
      .select("id, status, current_turn_index, move_points_per_turn")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id, turn_order")
      .eq("game_id", game.id)
      .order("turn_order", { ascending: true });

    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Could not load turn order." }, { status: 500 });
    }

    const ordered = participants.filter((p) => p.turn_order !== null) as Participant[];
    const activeParticipant = ordered[game.current_turn_index];

    if (!activeParticipant || activeParticipant.id !== participantId) {
      return NextResponse.json({ error: "It is not your turn." }, { status: 400 });
    }

    const nextIndex = (game.current_turn_index + 1) % ordered.length;
    const nextParticipant = ordered[nextIndex];

    const { error: zeroOutError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: 0 })
      .eq("id", participantId);

    if (zeroOutError) {
      return NextResponse.json({ error: zeroOutError.message }, { status: 500 });
    }

    const { error: gameUpdateError } = await supabaseAdmin
      .from("games")
      .update({ current_turn_index: nextIndex })
      .eq("id", game.id);

    if (gameUpdateError) {
      return NextResponse.json({ error: gameUpdateError.message }, { status: 500 });
    }

    const { error: nextMovesError } = await supabaseAdmin
      .from("participants")
      .update({ remaining_moves: game.move_points_per_turn })
      .eq("id", nextParticipant.id);

    if (nextMovesError) {
      return NextResponse.json({ error: nextMovesError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}