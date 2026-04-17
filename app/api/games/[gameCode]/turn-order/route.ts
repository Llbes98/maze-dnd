import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const orderedParticipantIds = Array.isArray(body.orderedParticipantIds)
      ? body.orderedParticipantIds.map(String)
      : [];

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    for (let index = 0; index < orderedParticipantIds.length; index += 1) {
      const participantId = orderedParticipantIds[index];
      const { error } = await supabaseAdmin
        .from("participants")
        .update({ turn_order: index })
        .eq("id", participantId)
        .eq("game_id", game.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}