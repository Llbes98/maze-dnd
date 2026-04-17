import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateGameCode } from "@/lib/game-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const width = Number(body.width);
    const height = Number(body.height);
    const movePointsPerTurn = Number(body.movePointsPerTurn);

    if (!name) {
      return NextResponse.json({ error: "Game name is required." }, { status: 400 });
    }

    if (!Number.isInteger(width) || width < 10 || width > 100) {
      return NextResponse.json({ error: "Width must be between 10 and 100." }, { status: 400 });
    }

    if (!Number.isInteger(height) || height < 10 || height > 100) {
      return NextResponse.json({ error: "Height must be between 10 and 100." }, { status: 400 });
    }

    if (!Number.isInteger(movePointsPerTurn) || movePointsPerTurn < 1) {
      return NextResponse.json({ error: "Move points must be at least 1." }, { status: 400 });
    }

    let code = generateGameCode();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from("games")
        .insert({
          code,
          name,
          width,
          height,
          move_points_per_turn: movePointsPerTurn,
        })
        .select("code")
        .single();

      if (!error && data) {
        return NextResponse.json(data);
      }

      code = generateGameCode();
    }

    return NextResponse.json({ error: "Could not create a unique game code." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}