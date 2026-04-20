import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Trap = {
  id: string;
  visible_to_participant_ids: string[] | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const participantId = String(body.participantId ?? "");
    const trapId = String(body.trapId ?? "");
    const outcome = body.outcome === "fail" ? "fail" : "success";

    if (!participantId || !trapId) {
      return NextResponse.json({ error: "Missing trap or participant." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("id", participantId)
      .eq("game_id", game.id)
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ error: "Participant not found." }, { status: 404 });
    }

    const { data: trap, error: trapError } = await supabaseAdmin
      .from("traps")
      .select("id, visible_to_participant_ids")
      .eq("id", trapId)
      .eq("game_id", game.id)
      .maybeSingle<Trap>();

    if (trapError || !trap) {
      return NextResponse.json({ error: "Trap not found." }, { status: 404 });
    }

    const update =
      outcome === "success"
        ? {
            visibility_mode: "selective",
            visible_to_participant_ids: Array.from(
              new Set([...(trap.visible_to_participant_ids ?? []), participantId])
            ),
          }
        : {
            visibility_mode: "public",
            is_triggered: true,
          };

    const { error: updateError } = await supabaseAdmin
      .from("traps")
      .update(update)
      .eq("id", trap.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
