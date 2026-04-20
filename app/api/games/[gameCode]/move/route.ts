import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdjacent } from "@/lib/game-utils";
import { normalizeCells, isWallBetween, normalizeWalls } from "@/lib/maze-visibility";
import { normalizeStringList } from "@/lib/turn-state";

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

    if (game.is_npc_turn) {
      return NextResponse.json({ error: "It is the NPC turn." }, { status: 400 });
    }

    const endedParticipantIds = normalizeStringList(game.map_data?.endedParticipantIds);

    if (endedParticipantIds.includes(participantId)) {
      return NextResponse.json({ error: "You have ended your turn." }, { status: 400 });
    }

    const { data: activeParticipant, error: participantError } = await supabaseAdmin
      .from("participants")
      .select("id, kind, x, y, remaining_moves")
      .eq("game_id", game.id)
      .eq("id", participantId)
      .eq("kind", "player")
      .maybeSingle();

    if (participantError || !activeParticipant) {
      return NextResponse.json({ error: "Player not found." }, { status: 404 });
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

    if (isWallBetween(activeParticipant.x, activeParticipant.y, toX, toY, walls)) {
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
      .select("id, label, visibility_mode, visible_to_participant_ids, is_triggered")
      .eq("game_id", game.id)
      .eq("x", toX)
      .eq("y", toY)
      .maybeSingle();

    const trapAlreadyVisible =
      trap &&
      (trap.is_triggered ||
        trap.visibility_mode === "public" ||
        (trap.visibility_mode === "selective" &&
          (trap.visible_to_participant_ids ?? []).includes(participantId)));
    const goals = normalizeCells(game.map_data?.goals);
    const reachedGoal = goals.some((goal) => goal.x === toX && goal.y === toY);

    return NextResponse.json({
      ok: true,
      reachedGoal,
      triggeredTrap:
        trap && !trapAlreadyVisible ? { id: trap.id, label: trap.label } : null,
    });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
}
