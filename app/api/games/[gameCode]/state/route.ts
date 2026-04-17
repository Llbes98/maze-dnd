import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Participant = {
  id: string;
  name: string;
  kind: "player" | "npc";
  x: number | null;
  y: number | null;
  turn_order: number | null;
  remaining_moves: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, code, name, width, height, move_points_per_turn, status, current_turn_index")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id, name, kind, x, y, turn_order, remaining_moves")
      .eq("game_id", game.id)
      .order("turn_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (participantsError) {
      return NextResponse.json({ error: participantsError.message }, { status: 500 });
    }

    const ordered = (participants ?? []) as Participant[];
    const activeParticipant =
      ordered.filter((p) => p.turn_order !== null)[game.current_turn_index] ?? null;

    return NextResponse.json({
      game,
      participants: ordered,
      activeParticipantId: activeParticipant?.id ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}