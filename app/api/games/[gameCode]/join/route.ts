import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PLAYER_COLORS = [
  "red",
  "dark-green",
  "light-green",
  "dark-blue",
  "light-blue",
  "purple",
  "yellow",
  "orange",
] as const;

function normalizePlayerColor(input: unknown) {
  return PLAYER_COLORS.includes(input as (typeof PLAYER_COLORS)[number])
    ? (input as (typeof PLAYER_COLORS)[number])
    : "red";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const color = normalizePlayerColor(body.color);

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("participants")
      .insert({
        game_id: game.id,
        kind: "player",
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
            [data.id]: color,
          },
        },
      })
      .eq("id", game.id);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
