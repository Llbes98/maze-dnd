import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdjacent } from "@/lib/game-utils";
import { isWall, normalizeWalls } from "@/lib/maze-visibility";

type Participant = {
  id: string;
  x: number | null;
  y: number | null;
  remaining_moves: number;
  turn_order: number | null;
};

type Trap = {
  id: string;
  label: string;
};

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
      .select("id, width, height, status, current_turn_index, map_data")
      .eq("code", gameCode)
      .maybeSingle();

    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (game.status !== "active") {
      return NextResponse.json({ error: "Game is not active." }, { status: 400 });
    }

    const { data: participants, error: participantsError } = await supabaseAdmin
      .from("participants")
      .select("id, x, y, remaining_moves, turn_order")
      .eq("game_id", game.id)
      .order("turn_order", { ascending: true });

    if (participantsError || !participants) {
      return NextResponse.json({ error: "Could not load participants." }, { status: 500 });
    }

    const ordered = participants.filter((p) => p.turn_order !== null) as Participant[];
    const activeParticipant = ordered[game.current_turn_index];

    if (!activeParticipant || activeParticipant.id !== participantId) {
      return NextResponse.json({ error: "It is not your turn." }, { status: 400 });
    }

    if (
      activeParticipant.x === null ||
      activeParticipant.y === null ||
      !Number.isInteger(toX) ||
      !Number.isInteger(toY)
    ) {
      return NextResponse.json({ error: "Invalid move." }, { status: 400 });
    }

    if (toX < 0 || toY < 0 || toX >= game.width || toY >= game.height) {
      return NextResponse.json({ error: "Move is out of bounds." }, { status: 400 });
    }

    if (!isAdjacent(activeParticipant.x, activeParticipant.y, toX, toY)) {
      return NextResponse.json({ error: "You can only move one square at a time." }, { status: 400 });
    }

    if (activeParticipant.remaining_moves <= 0) {
      return NextResponse.json({ error: "No movement left." }, { status: 400 });
    }

    const walls = normalizeWalls(game.map_data?.walls);

    if (isWall(toX, toY, walls)) {
      return NextResponse.json({ error: "That square is blocked by a wall." }, { status: 400 });
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
      .update({
        x: toX,
        y: toY,
        remaining_moves: activeParticipant.remaining_moves - 1,
      })
      .eq("id", participantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: trap } = await supabaseAdmin
      .from("traps")
      .select("id, label")
      .eq("game_id", game.id)
      .eq("x", toX)
      .eq("y", toY)
      .maybeSingle();

    if (trap) {
      await supabaseAdmin
        .from("traps")
        .update({ is_triggered: true })
        .eq("id", trap.id);
    }

    return NextResponse.json({
      ok: true,
      triggeredTrap: trap ? ({ id: trap.id, label: trap.label } as Trap) : null,
    });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}