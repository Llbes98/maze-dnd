import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdjacent } from "@/lib/game-utils";
import { isWallBetween, normalizeWalls } from "@/lib/maze-visibility";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameCode: string }> }
) {
  try {
    const { gameCode } = await params;
    const body = await request.json();

    const participantId = String(body.participantId ?? "");
    const toX = Number(body.toX);
    const toY = Number(body.toY);

    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, width, height, status, is_npc_turn, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (game.status !== "active") {
      return NextResponse.json({ error: "Game is not active." }, { status: 400 });
    }

    if (!game.is_npc_turn) {
      return NextResponse.json({ error: "It is not the NPC turn." }, { status: 400 });
    }

    const { data: npc, error: npcError } = await supabaseAdmin
      .from("participants")
      .select("id, game_id, kind, x, y")
      .eq("id", participantId)
      .eq("game_id", game.id)
      .eq("kind", "npc")
      .maybeSingle();

    if (npcError || !npc) {
      return NextResponse.json({ error: "NPC not found." }, { status: 404 });
    }

    if (
      npc.x === null ||
      npc.y === null ||
      !Number.isInteger(toX) ||
      !Number.isInteger(toY)
    ) {
      return NextResponse.json({ error: "Invalid move." }, { status: 400 });
    }

    if (toX < 0 || toY < 0 || toX >= game.width || toY >= game.height) {
      return NextResponse.json({ error: "Move is out of bounds." }, { status: 400 });
    }

    if (!isAdjacent(npc.x, npc.y, toX, toY)) {
      return NextResponse.json({ error: "NPCs can only move one square at a time." }, { status: 400 });
    }

    const walls = normalizeWalls(game.map_data?.walls);

    if (isWallBetween(npc.x, npc.y, toX, toY, walls)) {
      return NextResponse.json({ error: "A wall blocks that path." }, { status: 400 });
    }

    const { data: occupied } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("game_id", game.id)
      .eq("x", toX)
      .eq("y", toY)
      .maybeSingle();

    if (occupied) {
      return NextResponse.json({ error: "That square is occupied." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("participants")
      .update({ x: toX, y: toY })
      .eq("id", participantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
