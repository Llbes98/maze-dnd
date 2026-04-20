import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();

    const x = Number(body.x);
    const y = Number(body.y);
    const label = String(body.label ?? "Trap").trim() || "Trap";
    const visibilityMode =
      body.visibilityMode === "public" ? "public" : "hidden";

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, width, height")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.width || y >= game.height) {
      return NextResponse.json({ error: "Trap position is out of bounds." }, { status: 400 });
    }

    const { data: existingTrap } = await supabaseAdmin
      .from("traps")
      .select("id")
      .eq("game_id", game.id)
      .eq("x", x)
      .eq("y", y)
      .maybeSingle();

    if (existingTrap) {
      const { error: deleteError } = await supabaseAdmin
        .from("traps")
        .delete()
        .eq("id", existingTrap.id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, removed: true });
    }

    const { error: insertError } = await supabaseAdmin
      .from("traps")
      .insert({
        game_id: game.id,
        x,
        y,
        label,
        visibility_mode: visibilityMode,
        visible_to_participant_ids: [],
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, removed: false });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
