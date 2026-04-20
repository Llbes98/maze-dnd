import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const NPC_COLORS = ["orange", "purple", "dark-green", "dark-blue"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "NPC name is required." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data: existingNpcs, error: existingError } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("kind", "npc");

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if ((existingNpcs ?? []).length >= 4) {
      return NextResponse.json({ error: "Maximum 4 NPCs allowed." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("participants")
      .insert({
        game_id: game.id,
        kind: "npc",
        name,
      })
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await supabaseAdmin
      .from("games")
      .update({
        map_data: {
          ...(game.map_data ?? {}),
          participantColors: {
            ...((game.map_data?.participantColors as Record<string, string> | undefined) ?? {}),
            [data.id]: NPC_COLORS[(existingNpcs ?? []).length % NPC_COLORS.length],
          },
        },
      })
      .eq("id", game.id);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
